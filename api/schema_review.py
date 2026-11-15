"""T35: source-bound, versioned schema review. No automatic scientific approval."""
import copy
import hashlib
import json
import os
import re
import time

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

    def optional(self, key):
        # Prefix-scoped ListBucket also distinguishes a missing object without
        # interpreting an S3 access denial as a cache miss.
        listed = self.s3.list_objects_v2(Bucket=self.bucket, Prefix=key, MaxKeys=1)
        if not any(item['Key'] == key for item in listed.get('Contents', [])): return None
        try:
            return self.load(key)
        except Exception as exc:
            if getattr(exc, 'response', {}).get('Error', {}).get('Code') in ('NoSuchKey', '404'): return None
            raise

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
            if (item['proposal_key'] != expected+'proposals.json' and not
                    (item.get('proposal_origin') == 'manual' and re.fullmatch(re.escape(expected)+r'manual-[a-f0-9]{64}\.json', item['proposal_key']))):
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

    def source_text(self, uid, pid, did, query):
        self.projects.get(uid, pid)
        item = self.table.get_item(Key={'PK': 'P#'+pid, 'SK': 'D#'+did}, ConsistentRead=True).get('Item')
        if not item: fail(404, 'not_found', 'Document not found')
        if item.get('object_key') != f'u/{uid}/p/{pid}/raw/{did}': fail(409, 'conflict', 'Unexpected source location')
        value = self.optional(f'u/{uid}/p/{pid}/text/{did}/parsed.json')
        if value is None: fail(409, 'conflict', 'Wait for document parsing')
        doc = value['document']
        head = self.s3.head_object(Bucket=self.bucket, Key=item['object_key'])
        if (doc['id'] != did or doc['sha256'] != item.get('expected_sha256') or head['ETag'] != item.get('object_etag')
                or head['ContentLength'] != item['bytes']): fail(409, 'conflict', 'Source changed; reprocess before review')
        try:
            if doc['kind'] == 'paper':
                if set(query)-{'page'}: raise ValueError()
                page = int(query.get('page', '1'))
                selected = next((p for p in doc['pages'] if p['page'] == page), None)
                if selected is None: raise ValueError()
                return {'doc_id': did, 'sha256': doc['sha256'], 'kind': 'paper', 'pages': len(doc['pages']), **selected}
            if set(query)-{'cursor', 'limit'}: raise ValueError()
            offset, limit = int(query.get('cursor', '0')), int(query.get('limit', '50'))
            if offset < 0 or not 1 <= limit <= 50: raise ValueError()
            return {'doc_id': did, 'sha256': doc['sha256'], 'kind': 'table', 'headers': doc['headers'],
                    'rows': doc['rows'][offset:offset+limit], 'next_cursor': str(offset+limit) if offset+limit < len(doc['rows']) else None}
        except (ValueError, TypeError): fail(400, 'invalid_request', 'Invalid source-text pagination')

    def manual(self, uid, pid, did, data):
        parent = self.projects.get(uid, pid)
        if parent.get('schema_version') or parent['status'] == 'deleting':
            fail(409, 'conflict', 'Manual proposal recovery is available before schema review')
        if (not isinstance(data, dict) or set(data) != {'proposal', 'reason'} or not isinstance(data['reason'], str)
                or not 1 <= len(data['reason'].strip()) <= 4000):
            fail(400, 'invalid_request', 'Expected reviewed proposal and reason')
        item = self.table.get_item(Key={'PK': 'P#'+pid, 'SK': 'D#'+did}, ConsistentRead=True).get('Item')
        if not item: fail(404, 'not_found', 'Document not found')
        repeated = item['status'] == 'done' and item.get('proposal_origin') == 'manual'
        if (not (item['status'] == 'failed' or repeated) or item['stage'] != 'propose'
                or int(item.get('worker_until', 0)) >= int(time.time())):
            fail(409, 'conflict', 'Only a parsed document with a rejected proposal can be recovered')
        prefix = f'u/{uid}/p/{pid}/text/{did}/'
        document = self.load(prefix+'parsed.json')['document']
        head = self.s3.head_object(Bucket=self.bucket, Key=item['object_key'])
        if (item['object_key'] != f'u/{uid}/p/{pid}/raw/{did}' or document['id'] != did
                or document['sha256'] != item.get('sha256') or item['sha256'] != item['expected_sha256']
                or head['ETag'] != item['object_etag'] or head['ContentLength'] != item['bytes']):
            fail(409, 'conflict', 'Source changed; reprocess before manual review')
        try:
            proposed = review.ingest.validate_proposal(data['proposal'], {did: document})
        except (ValueError, KeyError, TypeError) as exc:
            fail(400, 'invalid_request', str(exc))
        if repeated:
            previous = self.load(item['proposal_key'])
            if previous['schemas'] != [proposed] or previous['reason'] != data['reason'].strip():
                fail(409, 'conflict', 'Manual proposal already saved; edit the versioned schema instead')
            return {'doc_id': did, 'origin': 'manual', 'status': 'proposed',
                    'note': 'Model rejection retained. Manual proposal still requires explicit schema approval.'}
        value = {'schemas': [proposed], 'status': 'proposed', 'source_sha256': document['sha256'],
                 'origin': 'manual', 'by': uid, 'at': stamp(), 'reason': data['reason'].strip(),
                 'rejected_model_reason': item.get('failure_reason')}
        key = prefix+'manual-'+review.digest(value)+'.json'
        self.s3.put_object(Bucket=self.bucket, Key=key, Body=json.dumps(value).encode(), ContentType='application/json')
        self.table.update_item(Key={'PK': 'P#'+pid, 'SK': 'D#'+did},
            UpdateExpression='SET proposal_key = :key, proposal_origin = :manual, #status = :done, updated_at = :at',
            ConditionExpression='#status = :failed AND expected_sha256 = :sha AND (attribute_not_exists(worker_until) OR worker_until < :now)',
            ExpressionAttributeNames={'#status': 'status'}, ExpressionAttributeValues={':key': key, ':manual': 'manual',
                ':done': 'done', ':failed': 'failed', ':sha': document['sha256'], ':at': stamp(), ':now': int(time.time())})
        try:
            self.corpus(uid, pid)
        except Exception as exc:
            if getattr(exc, 'status', None) != 409: raise
        else:
            self.table.update_item(Key={'PK': 'U#'+uid, 'SK': 'P#'+pid},
                UpdateExpression='SET #status = :review, revision = revision + :one',
                ConditionExpression='attribute_not_exists(schema_version) AND #status <> :deleting',
                ExpressionAttributeNames={'#status': 'status'},
                ExpressionAttributeValues={':review': 'awaiting_review', ':one': 1, ':deleting': 'deleting'})
        return {'doc_id': did, 'origin': 'manual', 'status': 'proposed',
                'note': 'Model rejection retained. Manual proposal still requires explicit schema approval.'}

    def diagnostics(self, uid, pid):
        self.projects.get(uid, pid)
        from boto3.dynamodb.conditions import Key
        items, start = [], None
        while True:
            args = {'KeyConditionExpression': Key('PK').eq('P#'+pid) & Key('SK').begins_with('D#'), 'ConsistentRead': True}
            if start: args['ExclusiveStartKey'] = start
            response = self.table.query(**args)
            items.extend(response.get('Items', [])); start = response.get('LastEvaluatedKey')
            if not start: break
        results = []
        for item in items:
            prefix = f'u/{uid}/p/{pid}/text/{item["id"]}/'
            entry = {'doc_id': item['id'], 'name': item['name'], 'status': item['status'],
                     'stage': item['stage'], 'reason': item.get('failure_reason'), 'responses': []}
            listed = self.s3.list_objects_v2(Bucket=self.bucket, Prefix=prefix)
            if listed.get('IsTruncated'): fail(409, 'conflict', 'Diagnostic listing exceeds expected call budget')
            raw_keys = [o['Key'] for o in listed.get('Contents', []) if o['Key'].endswith('-raw.json')]
            parsed_key = prefix+'parsed.json'
            doc = self.load(parsed_key)['document'] if any(o['Key'] == parsed_key for o in listed.get('Contents', [])) else None
            try:
                from . import ingest_propose as adapter
            except ImportError:
                import ingest_propose as adapter
            for key in raw_keys:
                raw = self.load(key)
                info = {'request': key.rsplit('/', 1)[-1], 'stop_reason': raw.get('stop_reason'), 'usage': raw.get('usage', {})}
                if doc:
                    try:
                        payload = adapter.parse_response(''.join(b['text'] for b in raw['content'] if b['type'] == 'text'))
                        review.ingest.validate_proposal(payload, {doc['id']: doc})
                        info['validation'] = 'valid'
                    except (ValueError, KeyError, TypeError) as exc:
                        info['validation'] = type(exc).__name__+': '+str(exc)[:400]
                entry['responses'].append(info)
            results.append(entry)
        return {'items': results, 'note': 'Owner-only processing diagnostics. No signed URLs or raw source/model text.'}

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
            review.require(isinstance(data['edits'], list) and bool(data['edits']), 'Nonempty edits required')
            for edit in data['edits']:
                review.require(isinstance(edit, dict), 'Invalid edit')
                if edit.get('op') == 'add_variable':
                    variable = edit.get('variable')
                    review.require(isinstance(variable, dict), 'Invalid reviewed variable')
                    for citation in variable.get('evidence', []):
                        review.require(review.ingest.verify_citation(citation, documents)['verified'], 'Reviewed variable citation rejected')
            edited = review.edit_schema(schema, data['edits'], data['version'])
        except ValueError as exc:
            fail(400, 'invalid_request', str(exc))
        next_value = review.review_request(edited, documents)
        next_value['parsed_sha256'] = review.digest(documents)
        self.persist(uid, pid, self.projects.get(uid, pid), next_value, schema['version'])
        return edited

    def approve(self, uid, pid, data):
        if (not isinstance(data, dict) or set(data)-{'version', 'review_authority', 'metadata'} or 'version' not in data
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
        if 'metadata' in data:
            try:
                try:
                    from pipeline import publish_bundle as publisher
                except ImportError:
                    import publish_bundle as publisher
                approved['corpus_metadata'] = publisher.approve_metadata(data['metadata'], documents, uid,
                    approved['schema']['approved_at'], data.get('review_authority', 'Authenticated project owner'))
                # Validate the prospective bundle now, before committing a metadata approval.
                draft = review.extract_tables(approved, documents)
                if draft['records'] and not draft['conflicts']:
                    publisher.build(approved, documents, draft, approved['corpus_metadata'], 1, 1)
            except (ValueError, KeyError, TypeError) as exc:
                fail(400, 'invalid_request', 'Metadata review: '+str(exc))
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
        documents, _ = self.corpus(uid, pid)
        for did, document in documents.items():
            if document['kind'] == 'paper':
                self.sqs.send_message(QueueUrl=self.queue, MessageBody=json.dumps({'version': 1, 'action': 'paper_extract',
                    'uid': uid, 'project_id': pid, 'doc_id': did, 'schema_version': approval['schema']['version'],
                    'schema_sha256': approval['schema_sha256']}))
        self.table.update_item(Key={'PK': 'U#'+uid, 'SK': 'P#'+pid},
            UpdateExpression='SET extraction_dispatch_pending = :false',
            ConditionExpression='schema_version = :version',
            ExpressionAttributeValues={':false': False, ':version': approval['schema']['version']})


def service(projects):
    import boto3
    return Schemas(projects, projects.table, boto3.client('dynamodb'), boto3.client('s3'),
                   os.environ['CORPUS_BUCKET'], boto3.client('sqs'), os.environ['INGEST_QUEUE_URL'])
