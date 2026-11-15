"""T33 reservations, metadata confirmation and durable/retryable queue dispatch.

Disabled unless configured. Only a worker verifies the actual source hash.
"""
from dataclasses import dataclass
import base64
import hashlib
import json
import os
import re
import time
import uuid

from boto3.dynamodb.types import TypeSerializer

try:
    from .projects import fail, stamp
except ImportError:
    from projects import fail, stamp


@dataclass(frozen=True)
class Limits:
    max_bytes: int
    max_pages: int
    max_documents: int

    @classmethod
    def configured(cls):
        if os.environ.get('UPLOADS_ENABLED') != 'true':
            fail(503, 'not_configured', 'Uploads are not enabled')
        try:
            data = json.loads(os.environ['UPLOAD_LIMITS_JSON'])
            if (not isinstance(data, dict) or set(data) != {'max_bytes', 'max_pages', 'max_documents'}
                    or any(type(v) is not int or v <= 0 for v in data.values())):
                raise ValueError()
            return cls(**data)
        except (KeyError, TypeError, ValueError):
            fail(503, 'not_configured', 'Reviewed upload limits are required')


def validate(data, limits):
    if not isinstance(data, dict) or set(data) != {'name', 'media_type', 'bytes'}:
        fail(400, 'invalid_request', 'Expected name, media_type and bytes')
    name = data['name']
    if (not isinstance(name, str) or not 1 <= len(name.strip()) <= 255
            or any(ord(c) < 32 or c in '/\\' for c in name)):
        fail(400, 'invalid_request', 'Invalid document name')
    if data['media_type'] not in ('text/csv', 'application/pdf'):
        fail(400, 'invalid_request', 'Only CSV and PDF are accepted')
    if type(data['bytes']) is not int or data['bytes'] <= 0:
        fail(400, 'invalid_request', 'Invalid document size')
    if data['bytes'] > limits.max_bytes:
        fail(413, 'limit_exceeded', 'File exceeds configured limit',
             {'limit': limits.max_bytes, 'value': data['bytes'], 'field': 'bytes'})
    return {**data, 'name': name.strip()}


DOC_FIELDS = ('id', 'name', 'kind', 'media_type', 'bytes', 'sha256', 'stage', 'status', 'uploaded_at')


def public_document(item):
    result = {key: item[key] for key in DOC_FIELDS}
    result['bytes'] = int(result['bytes'])
    for key in ('pages', 'rows', 'error_code'):
        if key in item:
            result[key] = int(item[key]) if key != 'error_code' else item[key]
    return result


class UploadTickets:
    def __init__(self, projects, table, transaction_client, s3, bucket, limits, sqs=None, queue_url=None):
        self.projects, self.table, self.transaction_client = projects, table, transaction_client
        self.s3, self.bucket, self.limits = s3, bucket, limits
        self.sqs, self.queue_url = sqs, queue_url

    def get(self, pid, did):
        return self.table.get_item(Key={'PK': 'P#'+pid, 'SK': 'D#'+did}, ConsistentRead=True).get('Item')

    def reserve(self, uid, pid, data, key=None):
        parent = self.projects.get(uid, pid)  # Ownership before any signing or mutation.
        data = validate(data, self.limits)
        if key is not None and (not isinstance(key, str) or not re.fullmatch(r'[A-Za-z0-9_.:-]{1,128}', key)):
            fail(400, 'invalid_request', 'Invalid Idempotency-Key')
        did = 'doc_' + (hashlib.sha256((uid+'\0'+pid+'\0'+key).encode()).hexdigest() if key else uuid.uuid4().hex)
        if key:
            old = self.get(pid, did)
            if old:
                return self.replay(old, data, parent)
        if parent['status'] != 'draft':
            fail(409, 'conflict', 'Only draft projects accept new upload reservations')
        if parent['counts']['documents'] >= self.limits.max_documents:
            fail(422, 'limit_exceeded', 'Project document limit reached',
                 {'limit': self.limits.max_documents, 'value': int(parent['counts']['documents'])+1,
                  'field': 'documents'})
        now = stamp()
        item = {'PK': 'P#'+pid, 'SK': 'D#'+did, 'id': did, **data,
                'kind': 'paper' if data['media_type'] == 'application/pdf' else 'table',
                'sha256': None, 'stage': 'upload', 'status': 'queued', 'uploaded_at': now,
                'object_key': f'u/{uid}/p/{pid}/raw/{did}', 'upload_request': data}
        # Sign first: signing failure must not consume a slot. URL never returned on transaction failure.
        ticket = self.ticket(item)
        serialize = TypeSerializer().serialize
        values = {':one': 1, ':revision': parent['revision'], ':draft': 'draft',
                  ':limit': self.limits.max_documents, ':now': now}
        try:
            self.transaction_client.transact_write_items(TransactItems=[
                {'Update': {'TableName': self.table.name,
                    'Key': {k: serialize(v) for k, v in {'PK': 'U#'+uid, 'SK': 'P#'+pid}.items()},
                    'UpdateExpression': 'SET counts.#documents = counts.#documents + :one, revision = revision + :one, updated_at = :now',
                    'ConditionExpression': '#status = :draft AND revision = :revision AND counts.#documents < :limit',
                    'ExpressionAttributeNames': {'#documents': 'documents', '#status': 'status'},
                    'ExpressionAttributeValues': {k: serialize(v) for k, v in values.items()}}},
                {'Put': {'TableName': self.table.name, 'Item': {k: serialize(v) for k, v in item.items()},
                         'ConditionExpression': 'attribute_not_exists(PK)'}}])
        except Exception as exc:
            error = getattr(exc, 'response', {}).get('Error', {}).get('Code')
            if error != 'TransactionCanceledException':
                raise
            if key:
                old = self.get(pid, did)
                if old:
                    return self.replay(old, data, self.projects.get(uid, pid))
            fail(409, 'conflict', 'Project changed; retry the reservation')
        return ticket

    def replay(self, item, data, parent):
        if (item['upload_request'] != data or item['stage'] != 'upload'
                or parent['status'] != 'draft'):
            fail(409, 'conflict', 'Reservation cannot be reused in its current state')
        return self.ticket(item)

    def ticket(self, item):
        url = self.s3.generate_presigned_url('put_object', Params={
            'Bucket': self.bucket, 'Key': item['object_key'], 'ContentType': item['media_type'],
            'ContentLength': int(item['bytes']), 'IfNoneMatch': '*'}, ExpiresIn=300, HttpMethod='PUT')
        return {'doc_id': item['id'], 'upload': {'url': url, 'method': 'PUT',
                'headers': {'content-type': item['media_type'], 'if-none-match': '*'}, 'expires_in': 300}}

    def list(self, uid, pid, query):
        self.projects.get(uid, pid)
        if set(query) - {'limit', 'cursor'}:
            fail(400, 'invalid_request', 'Unknown query parameter')
        from boto3.dynamodb.conditions import Key
        try:
            limit = int(query.get('limit', '20'))
            if not 1 <= limit <= 100:
                raise ValueError()
            args = {'KeyConditionExpression': Key('PK').eq('P#'+pid) & Key('SK').begins_with('D#'),
                    'Limit': limit, 'ConsistentRead': True}
            if 'cursor' in query:
                cursor = query['cursor']
                if not isinstance(cursor, str) or len(cursor) > 1024:
                    raise ValueError()
                key = json.loads(base64.b64decode(cursor, altchars=b'-_', validate=True))
                if (set(key) != {'PK', 'SK'} or key['PK'] != 'P#'+pid
                        or not re.fullmatch(r'D#doc_[a-f0-9]{32,64}', key['SK'])):
                    raise ValueError()
                args['ExclusiveStartKey'] = key
        except (ValueError, TypeError, UnicodeError):
            fail(400, 'invalid_request', 'Invalid pagination')
        result = self.table.query(**args)
        last = result.get('LastEvaluatedKey')
        return {'items': [public_document(i) for i in result.get('Items', [])],
                'next_cursor': base64.urlsafe_b64encode(json.dumps(last).encode()).decode() if last else None}

    def complete(self, uid, pid, did, data):
        parent = self.projects.get(uid, pid)
        if (not isinstance(data, dict) or set(data) != {'sha256'}
                or not isinstance(data['sha256'], str) or not re.fullmatch(r'[a-f0-9]{64}', data['sha256'])):
            fail(400, 'invalid_request', 'Expected SHA-256 in lowercase hex')
        item = self.get(pid, did)
        if not item:
            fail(404, 'not_found', 'Document not found')
        if item.get('expected_sha256'):
            if item['expected_sha256'] != data['sha256']:
                fail(409, 'conflict', 'Document was completed with another hash')
            self.dispatch(uid, pid, item)
            return public_document(self.get(pid, did))
        if parent['status'] not in ('draft', 'processing'):
            fail(409, 'conflict', 'Project cannot confirm uploads in this state')
        try:
            head = self.s3.head_object(Bucket=self.bucket, Key=item['object_key'])
        except Exception as exc:
            code = getattr(exc, 'response', {}).get('Error', {}).get('Code')
            if code in ('404', 'NoSuchKey', 'NotFound'):
                fail(409, 'conflict', 'Upload has not arrived')
            raise
        if head['ContentLength'] != item['bytes'] or head.get('ContentType') != item['media_type']:
            fail(409, 'conflict', 'Uploaded size or media type does not match reservation')
        updated = {**item, 'expected_sha256': data['sha256'], 'object_etag': head['ETag'],
                   'dispatch_pending': True, 'stage': 'parse', 'status': 'queued', 'uploaded_at': stamp()}
        # sha256 remains null until a worker reads and hashes the actual original.
        serialize = TypeSerializer().serialize
        try:
            self.transaction_client.transact_write_items(TransactItems=[
                {'Update': {'TableName': self.table.name,
                    'Key': {k: serialize(v) for k, v in {'PK': 'U#'+uid, 'SK': 'P#'+pid}.items()},
                    'UpdateExpression': 'SET #status = :processing, revision = revision + :one, updated_at = :now',
                    'ConditionExpression': 'revision = :revision AND (#status = :draft OR #status = :processing)',
                    'ExpressionAttributeNames': {'#status': 'status'},
                    'ExpressionAttributeValues': {k: serialize(v) for k, v in {
                        ':processing': 'processing', ':draft': 'draft', ':one': 1,
                        ':revision': parent['revision'], ':now': stamp()}.items()}}},
                {'Put': {'TableName': self.table.name, 'Item': {k: serialize(v) for k, v in updated.items()},
                         'ConditionExpression': 'attribute_not_exists(expected_sha256) AND #stage = :upload',
                         'ExpressionAttributeNames': {'#stage': 'stage'},
                         'ExpressionAttributeValues': {':upload': serialize('upload')}}}])
        except Exception as exc:
            if getattr(exc, 'response', {}).get('Error', {}).get('Code') != 'TransactionCanceledException':
                raise
            fail(409, 'conflict', 'Document or project changed; retry confirmation')
        self.dispatch(uid, pid, updated)
        return public_document(self.get(pid, did))

    def dispatch(self, uid, pid, item):
        if not item.get('dispatch_pending'):
            return
        if self.sqs is None or not self.queue_url:
            fail(503, 'not_configured', 'Ingestion queue is not configured')
        self.sqs.send_message(QueueUrl=self.queue_url, MessageBody=json.dumps({
            'version': 1, 'uid': uid, 'project_id': pid, 'doc_id': item['id']}))
        # Crash after send can produce duplicate deliveries; worker must be idempotent.
        self.table.update_item(Key={'PK': 'P#'+pid, 'SK': 'D#'+item['id']},
            UpdateExpression='SET dispatch_pending = :false',
            ConditionExpression='expected_sha256 = :hash',
            ExpressionAttributeValues={':false': False, ':hash': item['expected_sha256']})

    def jobs(self, uid, pid):
        parent = self.projects.get(uid, pid)
        from boto3.dynamodb.conditions import Key
        items, start = [], None
        while True:
            args = {'KeyConditionExpression': Key('PK').eq('P#'+pid) & Key('SK').begins_with('D#'), 'ConsistentRead': True}
            if start:
                args['ExclusiveStartKey'] = start
            result = self.table.query(**args)
            items.extend(result.get('Items', []))
            start = result.get('LastEvaluatedKey')
            if not start:
                break
        totals = dict.fromkeys(('queued', 'running', 'done', 'failed', 'skipped'), 0)
        jobs = []
        for item in items:
            if item['status'] == 'deleting':  # T33 DELETE in progress: already gone for the owner.
                continue
            totals[item['status']] += 1
            jobs.append({'doc_id': item['id'], 'name': item['name'], 'stage': item['stage'],
                'status': item['status'], 'updated_at': item.get('updated_at', item['uploaded_at']),
                **({'error_code': item['error_code']} if item.get('error_code') else {})})
        return {'project_status': parent['status'], 'jobs': jobs, 'totals': totals}

    def resume(self, uid, pid):
        parent = self.projects.get(uid, pid)
        if parent['status'] not in ('processing', 'failed'):
            fail(409, 'conflict', 'Only failed or processing projects can resume ingestion')
        # Full ownership-checked listing; pending dispatch is durable even after a failed send.
        listing = self.jobs(uid, pid)
        count = 0
        for job in listing['jobs']:
            item = self.get(pid, job['doc_id'])
            if (item['stage'] == 'upload' or item['status'] in ('done', 'skipped')
                    or item['status'] == 'running' and item.get('worker_until', 0) >= time.time()):
                continue
            item['dispatch_pending'] = True
            self.dispatch(uid, pid, item)
            count += 1
        return {'reenqueued': count}


def service(projects):
    # Explicit gate, no production default for proposed D3 limits.
    limits = Limits.configured()
    import boto3
    from botocore.config import Config
    return UploadTickets(projects, projects.table, boto3.client('dynamodb'),
                         boto3.client('s3', config=Config(signature_version='s3v4')),
                         os.environ['CORPUS_BUCKET'], limits, boto3.client('sqs'), os.environ['INGEST_QUEUE_URL'])
