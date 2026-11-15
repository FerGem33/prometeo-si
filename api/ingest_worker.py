"""T34 proposals and T35 explicitly approved extraction. Never grants approval or publishes.

Source bytes are read only by this worker. The API records expected_sha256;
verified sha256 is written here after comparison. SQS retries use checkpoints.
"""
import hashlib
import io
import json
import os
from pathlib import Path
import re
import tempfile
import time
from datetime import datetime, timezone

try:
    from pipeline import ingest as core
except ImportError:
    import ingest_core as core
try:
    from . import ingest_propose as adapter
except ImportError:
    import ingest_propose as adapter


VERSION = 'worker-proposal-v1'


class DocumentFailure(ValueError):
    pass


def parse(raw, item, max_pages):
    digest = hashlib.sha256(raw).hexdigest()
    if digest != item['expected_sha256']:
        raise DocumentFailure('hash_mismatch')
    if len(raw) != item['bytes']:
        raise DocumentFailure('size_mismatch')
    doc = {'id': item['id'], 'name': item['name'], 'kind': item['kind'], 'bytes': len(raw),
           'sha256': digest, 'stage': 'parse', 'status': 'done'}
    if item['kind'] == 'table':
        try:
            doc.update(core.parse_csv(raw))
        except core.ParseError as exc:
            raise DocumentFailure('unreadable') from exc
        doc['parser'] = 'pipeline.ingest.parse_csv-v1'
    else:
        from pypdf import PdfReader, __version__
        try:
            reader = PdfReader(io.BytesIO(raw), strict=True)
            if reader.is_encrypted:
                raise DocumentFailure('unreadable')
            if len(reader.pages) > max_pages:
                raise DocumentFailure('too_many_pages')
            pages = []
            size = 0
            for number, page in enumerate(reader.pages, 1):
                # Plain extraction includes rotated text; layout mode strips it by default.
                text = page.extract_text() or ''
                size += len(text)
                if size > 3000000:
                    raise DocumentFailure('text_too_large')
                pages.append({'page': number, 'text': text})
            if not any(p['text'].strip() for p in pages):
                raise DocumentFailure('no_text_layer')
        except DocumentFailure:
            raise
        except Exception as exc:
            raise DocumentFailure('unreadable') from exc
        doc.update(pages=pages, parser='pypdf-'+__version__+'-plain')
    return doc


def requests(doc):
    profile = core.profile_document(doc)
    artifact = {'documents': [doc], 'profiles': [profile]}
    if doc['kind'] == 'table':
        return [adapter.request_data(artifact, doc['id'], [])]
    # Every original page is considered; do not silently truncate oversized pages.
    result, chosen = [], []
    for page in doc['pages']:
        try:
            adapter.request_data(artifact, doc['id'], chosen+[page['page']])
        except ValueError:
            if not chosen:
                raise DocumentFailure('page_request_too_large')
            result.append(adapter.request_data(artifact, doc['id'], chosen))
            chosen = []
        chosen.append(page['page'])
        try:
            adapter.request_data(artifact, doc['id'], chosen)
        except ValueError as exc:
            raise DocumentFailure('page_request_too_large') from exc
    if chosen:
        result.append(adapter.request_data(artifact, doc['id'], chosen))
    return result


class Worker:
    def __init__(self, table, s3, bucket, client, model, limits):
        self.table, self.s3, self.bucket = table, s3, bucket
        self.client, self.model, self.limits = client, model, limits

    def read_json(self, key):
        try:
            obj = self.s3.get_object(Bucket=self.bucket, Key=key)
        except Exception as exc:
            if getattr(exc, 'response', {}).get('Error', {}).get('Code') in ('NoSuchKey', '404'):
                return None
            raise
        with obj['Body'] as stream:
            return json.loads(stream.read())

    def save(self, key, value):
        self.s3.put_object(Bucket=self.bucket, Key=key,
            Body=json.dumps(value, ensure_ascii=False, allow_nan=False).encode(), ContentType='application/json')

    def update(self, key, fields, lease=None):
        fields = {**fields, 'updated_at': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')}
        args = {'Key': key, 'UpdateExpression': 'SET '+', '.join(f'#k{i} = :v{i}' for i in range(len(fields))),
            'ExpressionAttributeNames': {f'#k{i}': k for i, k in enumerate(fields)},
            'ExpressionAttributeValues': {f':v{i}': v for i, v in enumerate(fields.values())}}
        if lease is not None:
            args['ConditionExpression'] = 'worker_lease = :lease'
            args['ExpressionAttributeValues'][':lease'] = lease
        if fields.get('status') == 'done':
            args['UpdateExpression'] += ' REMOVE #old_error, #old_reason'
            args['ExpressionAttributeNames'].update({'#old_error': 'error_code', '#old_reason': 'failure_reason'})
        self.table.update_item(**args)

    def process(self, message, lease):
        if (not isinstance(message, dict) or set(message) != {'version', 'uid', 'project_id', 'doc_id'}
                or message['version'] != 1 or not isinstance(message['uid'], str)
                or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', message['uid'])
                or not re.fullmatch(r'prj_[a-f0-9]{32,64}', message.get('project_id', ''))
                or not re.fullmatch(r'doc_[a-f0-9]{32,64}', message.get('doc_id', ''))):
            raise DocumentFailure('invalid_message')
        uid, pid, did = message['uid'], message['project_id'], message['doc_id']
        parent = self.table.get_item(Key={'PK': 'U#'+uid, 'SK': 'P#'+pid}, ConsistentRead=True).get('Item')
        key = {'PK': 'P#'+pid, 'SK': 'D#'+did}
        item = self.table.get_item(Key=key, ConsistentRead=True).get('Item')
        if item and item.get('object_key') != f'u/{uid}/p/{pid}/raw/{did}':
            raise DocumentFailure('invalid_document')
        if not parent or parent.get('status') == 'deleting' or not item or item.get('status') == 'deleting':
            return  # Removed by the owner (T33 DELETE) after the message was queued: nothing to process.
        if not item.get('expected_sha256'):
            raise DocumentFailure('invalid_document')
        if item['status'] in ('done', 'skipped'):
            if item.get('worker_version') != VERSION or item.get('sha256') != item['expected_sha256']:
                raise DocumentFailure('completed_document_requires_review')
            return
        now = int(time.time())
        self.table.update_item(Key=key, UpdateExpression='SET worker_lease = :lease, worker_until = :until, #status = :running',
            ConditionExpression=('(attribute_not_exists(worker_until) OR worker_until < :now) '
                                 'AND #status <> :done AND #status <> :skipped AND #status <> :deleting'),
            ExpressionAttributeNames={'#status': 'status'}, ExpressionAttributeValues={
                ':lease': lease, ':until': now+150, ':now': now, ':running': 'running', ':done': 'done',
                ':skipped': 'skipped', ':deleting': 'deleting'})
        try:
            if item['bytes'] > self.limits['max_bytes']:
                raise DocumentFailure('too_large')
            obj = self.s3.get_object(Bucket=self.bucket, Key=item['object_key'], IfMatch=item['object_etag'])
            with obj['Body'] as stream:
                raw = stream.read(self.limits['max_bytes']+1)
            doc = parse(raw, item, self.limits['max_pages'])
            hash_key = {'PK': 'P#'+pid, 'SK': 'H#'+doc['sha256']}
            try:
                self.table.put_item(Item={**hash_key, 'doc_id': did}, ConditionExpression='attribute_not_exists(PK)')
            except Exception as exc:
                if getattr(exc, 'response', {}).get('Error', {}).get('Code') != 'ConditionalCheckFailedException':
                    raise
                original = self.table.get_item(Key=hash_key, ConsistentRead=True)['Item']
                if original['doc_id'] != did:
                    self.update(key, {'sha256': doc['sha256'], 'status': 'skipped', 'error_code': 'duplicate',
                        'worker_version': VERSION, 'worker_until': 0, 'dispatch_pending': False}, lease)
                    self.finish_project(uid, pid)
                    return
            prefix = f'u/{uid}/p/{pid}/text/{did}/'
            self.save(prefix+'parsed.json', {'document': doc, 'profile': core.profile_document(doc), 'worker_version': VERSION})
            self.update(key, {'sha256': doc['sha256'], 'stage': 'propose',
                **({'pages': len(doc['pages'])} if doc['kind'] == 'paper' else {'rows': len(doc['rows'])})}, lease)
            schemas = []
            for content in requests(doc):
                request_hash = hashlib.sha256(json.dumps({'source': doc['sha256'], 'parser': doc['parser'],
                    'model': self.model, 'system': adapter.SYSTEM, 'content': content, 'version': VERSION}, sort_keys=True).encode()).hexdigest()
                raw_key = prefix+request_hash+'-raw.json'
                response = self.read_json(raw_key)
                if response is None:
                    # Durable, per-document call budget also bounds retries after failures.
                    self.table.update_item(Key=key, UpdateExpression='SET model_calls = if_not_exists(model_calls, :zero) + :one',
                        ConditionExpression='worker_lease = :lease AND (attribute_not_exists(model_calls) OR model_calls < :max)',
                        ExpressionAttributeValues={':lease': lease, ':zero': 0, ':one': 1, ':max': 20})
                    with tempfile.TemporaryDirectory() as temporary:
                        path = Path(temporary)/'raw.json'
                        try:
                            adapter.propose(self.client, self.model, content, raw_output=path)
                        finally:
                            if path.exists():
                                saved = json.loads(path.read_text())
                                self.save(raw_key, saved)
                                print(json.dumps({'event': 'bedrock_usage', 'doc_id': did,
                                    'request_sha256': request_hash, 'usage': saved.get('usage', {})}), flush=True)
                    response = self.read_json(raw_key)
                if response.get('stop_reason') != 'end_turn':
                    raise DocumentFailure('model_unavailable')
                text = ''.join(b['text'] for b in response['content'] if b['type'] == 'text')
                proposal = adapter.parse_response(text)
                schemas.append(core.validate_proposal(proposal, {did: doc}))
            self.save(prefix+'proposals.json', {'schemas': schemas, 'status': 'proposed', 'source_sha256': doc['sha256'],
                'parser': doc['parser'], 'model': self.model,
                'limitations': ['Literal citations do not prove semantic support.', 'Human approval is required.']})
            self.update(key, {'stage': 'propose', 'status': 'done', 'proposal_key': prefix+'proposals.json',
                'worker_version': VERSION, 'worker_until': 0, 'dispatch_pending': False}, lease)
            self.finish_project(uid, pid)
        except Exception as exc:
            reason = str(exc)[:400] if isinstance(exc, (DocumentFailure, ValueError)) else type(exc).__name__
            public_code = reason if reason in ('too_large', 'too_many_pages', 'no_text_layer', 'model_unavailable') else 'unreadable'
            self.update(key, {'status': 'failed', 'error_code': public_code, 'failure_reason': reason,
                              'worker_until': 0}, lease)
            self.finish_project(uid, pid)
            print(json.dumps({'event': 'document_failed', 'doc_id': did, 'stage': 'ingest',
                              'reason': reason}), flush=True)
            raise

    def finish_project(self, uid, pid):
        from boto3.dynamodb.conditions import Key
        rows, start = [], None
        while True:
            args = {'KeyConditionExpression': Key('PK').eq('P#'+pid) & Key('SK').begins_with('D#'), 'ConsistentRead': True}
            if start:
                args['ExclusiveStartKey'] = start
            result = self.table.query(**args)
            rows.extend(result.get('Items', []))
            start = result.get('LastEvaluatedKey')
            if not start:
                break
        if rows and all(r['status'] in ('done', 'skipped', 'failed') for r in rows):
            target = 'failed' if any(r['status'] == 'failed' for r in rows) else 'awaiting_review'
            try:
                self.table.update_item(Key={'PK': 'U#'+uid, 'SK': 'P#'+pid},
                    UpdateExpression='SET #status = :review, revision = revision + :one',
                    ConditionExpression='#status = :processing OR #status = :failed', ExpressionAttributeNames={'#status': 'status'},
                    ExpressionAttributeValues={':review': target, ':processing': 'processing', ':failed': 'failed', ':one': 1})
            except Exception as exc:
                if getattr(exc, 'response', {}).get('Error', {}).get('Code') != 'ConditionalCheckFailedException':
                    raise


def handler(event, context=None):
    import boto3
    from anthropic import AnthropicBedrock
    worker = Worker(boto3.resource('dynamodb').Table(os.environ['DATA_TABLE']), boto3.client('s3'),
        os.environ['CORPUS_BUCKET'], AnthropicBedrock(aws_region='us-east-1', timeout=20, max_retries=0),
        os.environ['MODEL_ID'], json.loads(os.environ['UPLOAD_LIMITS_JSON']))
    failures = []
    for record in event['Records']:
        try:
            message = json.loads(record['body'])
            if message.get('action') in ('extract', 'paper_extract'):
                try:
                    from . import extract_worker, schema_review
                    from .projects import Projects
                except ImportError:
                    import extract_worker, schema_review
                    from projects import Projects
                repository = schema_review.service(Projects(worker.table))
                if message['action'] == 'paper_extract':
                    try:
                        from . import paper_worker
                    except ImportError:
                        import paper_worker
                    paper_worker.process(message, record['messageId'], repository, worker.client, worker.model)
                else:
                    extract_worker.process(message, record['messageId'], repository)
            else:
                worker.process(message, record['messageId'])
        except Exception:
            failures.append({'itemIdentifier': record['messageId']})
    return {'batchItemFailures': failures}
