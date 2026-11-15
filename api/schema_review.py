"""T35: source-bound, versioned schema review. No automatic scientific approval."""
import copy
import hashlib
import json
import os

from boto3.dynamodb.types import TypeSerializer

try:
    from pipeline import review_extract as review
except ImportError:
    import review_extract as review
try:
    from .projects import fail, stamp
except ImportError:
    from projects import fail, stamp


def joint_schema(documents, proposals):
    result = {'version': 1, 'status': 'proposed', 'variables': [], 'columns': [], 'constants': []}
    seen_columns = set()
    for did in sorted(documents):
        chunks = proposals[did]['schemas']
        for index, schema in enumerate(chunks):
            if schema.get('constants'):
                fail(409, 'conflict', 'Constants require explicit evidence and scope review')
            ids = {v['id']: 'v_'+hashlib.sha256((did+':'+str(index)+':'+v['id']).encode()).hexdigest()[:12]
                   for v in schema['variables']}
            for variable in schema['variables']:
                v = copy.deepcopy(variable)
                v.update(id=ids[v['id']], status='proposed', merged_from=[])
                result['variables'].append(v)
            for column in schema['columns']:
                key = did, column['column']
                if key in seen_columns:
                    fail(409, 'conflict', 'Ambiguous repeated column proposals')
                seen_columns.add(key)
                c = copy.deepcopy(column)
                c.update(doc_id=did, variable=ids.get(c['variable']) if c['variable'] else None, status='proposed')
                result['columns'].append(c)
    return result


class Schemas:
    def __init__(self, projects, table, transaction_client, s3, bucket, sqs, queue):
        self.projects, self.table, self.tx = projects, table, transaction_client
        self.s3, self.bucket, self.sqs, self.queue = s3, bucket, sqs, queue

    def load(self, key):
        response = self.s3.get_object(Bucket=self.bucket, Key=key)
        with response['Body'] as stream:
            return json.loads(stream.read())

    def corpus(self, uid, pid):
        self.projects.get(uid, pid)
        from boto3.dynamodb.conditions import Key
        items, start = [], None
        while True:
            args = {'KeyConditionExpression': Key('PK').eq('P#'+pid) & Key('SK').begins_with('D#'), 'ConsistentRead': True}
            if start:
                args['ExclusiveStartKey'] = start
            response = self.table.query(**args)
            items.extend(response.get('Items', []))
            start = response.get('LastEvaluatedKey')
            if not start:
                break
        documents, proposals = {}, {}
        for item in items:
            if item['status'] == 'skipped' and item.get('error_code') == 'duplicate':
                continue
            eligible = item['status'] == 'done' or item['stage'] in ('extract', 'verify') and item['status'] in ('queued', 'running', 'failed')
            if not eligible or not item.get('proposal_key') or not item.get('sha256'):
                fail(409, 'conflict', 'Every document must finish proposal processing before schema review')
            did = item['id']
            expected = f'u/{uid}/p/{pid}/text/{did}/'
            if item['proposal_key'] != expected+'proposals.json':
                fail(409, 'conflict', 'Unexpected proposal location')
            parsed = self.load(expected+'parsed.json')['document']
            proposed = self.load(item['proposal_key'])
            head = self.s3.head_object(Bucket=self.bucket, Key=item['object_key'])
            if (parsed['sha256'] != item['sha256'] or item['sha256'] != item['expected_sha256']
                    or proposed['source_sha256'] != parsed['sha256'] or parsed['id'] != did
                    or head['ETag'] != item['object_etag'] or head['ContentLength'] != item['bytes']):
                fail(409, 'conflict', 'Corpus changed; reprocess before review')
            documents[did], proposals[did] = parsed, proposed
        if not documents:
            fail(409, 'conflict', 'A processed corpus is required')
        return documents, proposals

    def metadata(self, pid, version):
        return self.table.get_item(Key={'PK': 'P#'+pid, 'SK': 'S#'+str(version)}, ConsistentRead=True).get('Item')

    def current(self, uid, pid):
        parent = self.projects.get(uid, pid)
        documents, proposals = self.corpus(uid, pid)
        version = parent.get('schema_version')
        if version is None:
            if parent['status'] != 'awaiting_review':
                fail(409, 'conflict', 'Project is not ready for review')
            value = review.review_request(joint_schema(documents, proposals), documents)
            value['parsed_sha256'] = review.digest(documents)
            self.persist(uid, pid, parent, value, None)
            return value, documents
        meta = self.metadata(pid, int(version))
        value = self.load(meta['artifact_key'])
        if (meta['artifact_sha256'] != review.digest(value) or value['documents'] != review.snapshot(documents)
                or value.get('parsed_sha256') != review.digest(documents)):
            fail(409, 'conflict', 'Schema or corpus changed; review a new version')
        return value, documents

    def persist(self, uid, pid, parent, value, old_version, dispatch=False):
        schema = value['schema']
        digest = review.digest(value)
        key = f'u/{uid}/p/{pid}/schema/v{schema["version"]}-{digest}.json'
        self.s3.put_object(Bucket=self.bucket, Key=key, Body=json.dumps(value, ensure_ascii=False).encode(),
                           ContentType='application/json')
        encode = TypeSerializer().serialize
        parent_values = {':next': schema['version'], ':revision': parent['revision'], ':one': 1,
                         ':status': 'processing' if dispatch else 'awaiting_review', ':now': stamp(), ':pending': dispatch}
        condition = 'revision = :revision AND '+('attribute_not_exists(schema_version)' if old_version is None else 'schema_version = :old')
        if old_version is not None:
            parent_values[':old'] = old_version
        item = {'PK': 'P#'+pid, 'SK': 'S#'+str(schema['version']), 'version': schema['version'],
                'artifact_key': key, 'artifact_sha256': digest, 'status': schema['status'],
                'source_snapshot_sha256': review.digest(value['documents'])}
        try:
            self.tx.transact_write_items(TransactItems=[
                {'Update': {'TableName': self.table.name,
                    'Key': {k: encode(v) for k, v in {'PK': 'U#'+uid, 'SK': 'P#'+pid}.items()},
                    'UpdateExpression': 'SET schema_version = :next, #status = :status, revision = revision + :one, updated_at = :now, extraction_dispatch_pending = :pending',
                    'ConditionExpression': condition, 'ExpressionAttributeNames': {'#status': 'status'},
                    'ExpressionAttributeValues': {k: encode(v) for k, v in parent_values.items()}}},
                {'Put': {'TableName': self.table.name, 'Item': {k: encode(v) for k, v in item.items()},
                         'ConditionExpression': 'attribute_not_exists(PK)'}}])
        except Exception as exc:
            if getattr(exc, 'response', {}).get('Error', {}).get('Code') == 'TransactionCanceledException':
                fail(409, 'conflict', 'Schema version changed; reload before editing')
            raise

    def get(self, uid, pid):
        value, _ = self.current(uid, pid)
        return value['schema']

    def patch(self, uid, pid, data):
        if not isinstance(data, dict) or set(data) != {'version', 'edits'} or type(data['version']) is not int:
            fail(400, 'invalid_request', 'Expected version and edits')
        value, documents = self.current(uid, pid)
        schema = value['schema']
        if data['version'] != schema['version']:
            fail(409, 'conflict', 'Stale schema version')
        try:
            edited = review.edit_schema(schema, data['edits'], data['version'])
        except ValueError as exc:
            fail(400, 'invalid_request', str(exc))
        next_value = review.review_request(edited, documents)
        next_value['parsed_sha256'] = review.digest(documents)
        self.persist(uid, pid, self.projects.get(uid, pid), next_value, schema['version'])
        return edited

    def approve(self, uid, pid, data):
        if (not isinstance(data, dict) or set(data)-{'version', 'review_authority'} or 'version' not in data
                or type(data['version']) is not int):
            fail(400, 'invalid_request', 'Expected schema version')
        value, documents = self.current(uid, pid)
        schema = value['schema']
        if schema['status'] == 'approved' and data['version'] in (schema['version'], value['previous']['base_version']):
            self.dispatch(uid, pid, value)
            return schema
        if schema['version'] != data['version']:
            fail(409, 'conflict', 'Stale schema version')
        try:
            approved = review.approve(value, schema, documents, schema['version'], uid)
        except ValueError as exc:
            fail(409, 'conflict', str(exc))
        approved['parsed_sha256'] = review.digest(documents)
        if 'review_authority' in data:
            note = data['review_authority']
            if not isinstance(note, str) or not 1 <= len(note) <= 1000:
                fail(400, 'invalid_request', 'Invalid review authority note')
            approved['review_authority'] = note  # Explicit caller attestation, not expert certification.
        self.persist(uid, pid, self.projects.get(uid, pid), approved, schema['version'], dispatch=True)
        self.dispatch(uid, pid, approved)
        return approved['schema']

    def dispatch(self, uid, pid, approval):
        parent = self.projects.get(uid, pid)
        if not parent.get('extraction_dispatch_pending'):
            return
        self.sqs.send_message(QueueUrl=self.queue, MessageBody=json.dumps({'version': 1, 'action': 'extract',
            'uid': uid, 'project_id': pid, 'schema_version': approval['schema']['version'],
            'schema_sha256': approval['schema_sha256']}))
        self.table.update_item(Key={'PK': 'U#'+uid, 'SK': 'P#'+pid},
            UpdateExpression='SET extraction_dispatch_pending = :false',
            ConditionExpression='schema_version = :version',
            ExpressionAttributeValues={':false': False, ':version': approval['schema']['version']})


def service(projects):
    import boto3
    return Schemas(projects, projects.table, boto3.client('dynamodb'), boto3.client('s3'),
                   os.environ['CORPUS_BUCKET'], boto3.client('sqs'), os.environ['INGEST_QUEUE_URL'])
