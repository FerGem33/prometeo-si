"""Local T33 upload reservations. Disabled unless explicitly configured after D3.

Does not confirm files, validate scientific data, or enqueue processing.
"""
from dataclasses import dataclass
import hashlib
import json
import os
import re
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


class UploadTickets:
    def __init__(self, projects, table, transaction_client, s3, bucket, limits):
        self.projects, self.table, self.transaction_client = projects, table, transaction_client
        self.s3, self.bucket, self.limits = s3, bucket, limits

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
            'ContentLength': int(item['bytes'])}, ExpiresIn=300, HttpMethod='PUT')
        return {'doc_id': item['id'], 'upload': {'url': url, 'method': 'PUT',
                'headers': {'content-type': item['media_type']}, 'expires_in': 300}}


def service(projects):
    # Explicit gate, no production default for proposed D3 limits.
    limits = Limits.configured()
    import boto3
    from botocore.config import Config
    return UploadTickets(projects, projects.table, boto3.client('dynamodb'),
                         boto3.client('s3', config=Config(signature_version='s3v4')),
                         os.environ['CORPUS_BUCKET'], limits)
