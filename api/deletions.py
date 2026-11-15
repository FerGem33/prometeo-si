"""T33 DELETE routes (contract §5.3 and §5.4): remove a project or one of its documents.

Order makes an interrupted deletion finish on retry and keeps the worker out of the way:
  1. tombstone (status 'deleting', conditional, refused while a worker lease is active);
  2. S3 objects under the caller's own prefix (originals and worker artifacts);
  3. DynamoDB items; for a document, removal and the project counter change in one transaction.
The worker drops queued messages for tombstoned or removed documents.
"""
import time

from boto3.dynamodb.types import TypeSerializer

try:
    from .projects import conditional, fail, stamp
except ImportError:
    from projects import conditional, fail, stamp

TERMINAL = ('done', 'skipped', 'failed')


class Deletions:
    def __init__(self, projects, table, transaction_client, s3, bucket, now=time.time):
        self.projects, self.table, self.transaction_client = projects, table, transaction_client
        self.s3, self.bucket, self.now = s3, bucket, now

    def busy(self, item):
        return item.get('status') == 'running' and int(item.get('worker_until', 0)) >= self.now()

    def items(self, pid, prefix=''):
        from boto3.dynamodb.conditions import Key
        condition = Key('PK').eq('P#' + pid)
        if prefix:
            condition = condition & Key('SK').begins_with(prefix)
        found, start = [], None
        while True:
            args = {'KeyConditionExpression': condition, 'ConsistentRead': True}
            if start:
                args['ExclusiveStartKey'] = start
            result = self.table.query(**args)
            found.extend(result.get('Items', []))
            start = result.get('LastEvaluatedKey')
            if not start:
                return found

    def purge(self, prefix):
        """Delete every object under prefix (paginated). The prefix always belongs to the caller."""
        token = None
        while True:
            args = {'Bucket': self.bucket, 'Prefix': prefix}
            if token:
                args['ContinuationToken'] = token
            page = self.s3.list_objects_v2(**args)
            keys = [{'Key': o['Key']} for o in page.get('Contents', [])]
            if keys:
                result = self.s3.delete_objects(Bucket=self.bucket, Delete={'Objects': keys, 'Quiet': True})
                if result.get('Errors'):
                    raise RuntimeError('S3 deletion incomplete')
            token = page.get('NextContinuationToken')
            if not page.get('IsTruncated') or not token:
                return

    def delete_document(self, uid, pid, did):
        parent = self.projects.get(uid, pid)  # Ownership first: a foreign project is 404.
        if parent['status'] in ('published', 'deleting'):
            fail(409, 'conflict', 'Documents can only be deleted before publishing')
        key = {'PK': 'P#' + pid, 'SK': 'D#' + did}
        item = self.table.get_item(Key=key, ConsistentRead=True).get('Item')
        if not item:
            fail(404, 'not_found', 'Document not found')
        if item.get('object_key') != f'u/{uid}/p/{pid}/raw/{did}':
            fail(409, 'conflict', 'Document storage does not match its project; review manually')
        if self.busy(item):
            fail(409, 'conflict', 'Document is being processed; retry later')
        if item['status'] != 'deleting':
            try:
                self.table.update_item(Key=key, UpdateExpression='SET #status = :deleting, updated_at = :now',
                    ConditionExpression='attribute_exists(PK) AND (#status <> :running OR worker_until < :t)',
                    ExpressionAttributeNames={'#status': 'status'},
                    ExpressionAttributeValues={':deleting': 'deleting', ':running': 'running',
                                               ':t': int(self.now()), ':now': stamp()})
            except Exception as exc:
                if not conditional(exc):
                    raise
                fail(409, 'conflict', 'Document changed; retry the deletion')
        self.purge(item['object_key'])
        self.purge(f'u/{uid}/p/{pid}/text/{did}/')
        if item.get('sha256'):
            try:  # Duplicate marker only if it points at this document.
                self.table.delete_item(Key={'PK': 'P#' + pid, 'SK': 'H#' + item['sha256']},
                    ConditionExpression='doc_id = :did', ExpressionAttributeValues={':did': did})
            except Exception as exc:
                if not conditional(exc):
                    raise
        remaining = [d for d in self.items(pid, 'D#') if d['id'] != did and d['status'] != 'deleting']
        status = parent['status']
        if not remaining and status in ('processing', 'awaiting_review', 'failed'):
            status = 'draft'
        elif remaining and status in ('processing', 'failed') and all(d['status'] in TERMINAL for d in remaining):
            status = 'failed' if any(d['status'] == 'failed' for d in remaining) else 'awaiting_review'
        serialize = TypeSerializer().serialize
        values = {':one': 1, ':zero': 0, ':revision': parent['revision'], ':now': stamp(),
                  ':status': status, ':published': 'published', ':deleting': 'deleting'}
        try:
            self.transaction_client.transact_write_items(TransactItems=[
                {'Delete': {'TableName': self.table.name, 'Key': {k: serialize(v) for k, v in key.items()},
                    'ConditionExpression': '#status = :deleting', 'ExpressionAttributeNames': {'#status': 'status'},
                    'ExpressionAttributeValues': {':deleting': serialize('deleting')}}},
                {'Update': {'TableName': self.table.name,
                    'Key': {k: serialize(v) for k, v in {'PK': 'U#' + uid, 'SK': 'P#' + pid}.items()},
                    'UpdateExpression': ('SET counts.#documents = counts.#documents - :one, #status = :status, '
                                         'revision = revision + :one, updated_at = :now'),
                    'ConditionExpression': ('revision = :revision AND counts.#documents > :zero '
                                            'AND #status <> :published AND #status <> :deleting'),
                    'ExpressionAttributeNames': {'#documents': 'documents', '#status': 'status'},
                    'ExpressionAttributeValues': {k: serialize(v) for k, v in values.items()}}}])
        except Exception as exc:
            if getattr(exc, 'response', {}).get('Error', {}).get('Code') != 'TransactionCanceledException':
                raise
            # Tombstone and S3 removal persist; repeating the request completes the deletion.
            fail(409, 'conflict', 'Project changed; retry the deletion')

    def delete_project(self, uid, pid):
        parent = self.projects.get(uid, pid)
        documents = self.items(pid, 'D#')
        if any(self.busy(d) for d in documents):
            fail(409, 'conflict', 'A document is being processed; retry later')
        if parent['status'] != 'deleting':
            try:
                self.table.update_item(Key={'PK': 'U#' + uid, 'SK': 'P#' + pid},
                    UpdateExpression='SET #status = :deleting, revision = revision + :one, updated_at = :now',
                    ConditionExpression='revision = :revision', ExpressionAttributeNames={'#status': 'status'},
                    ExpressionAttributeValues={':deleting': 'deleting', ':one': 1, ':now': stamp(),
                                               ':revision': parent['revision']})
            except Exception as exc:
                if not conditional(exc):
                    raise
                fail(409, 'conflict', 'Project changed; retry the deletion')
        self.purge(f'u/{uid}/p/{pid}/')
        for item in self.items(pid):  # documents, duplicate markers and any later schema/records/proposals
            self.table.delete_item(Key={'PK': item['PK'], 'SK': item['SK']})
        try:
            self.table.delete_item(Key={'PK': 'U#' + uid, 'SK': 'P#' + pid},
                ConditionExpression='#status = :deleting', ExpressionAttributeNames={'#status': 'status'},
                ExpressionAttributeValues={':deleting': 'deleting'})
        except Exception as exc:
            if not conditional(exc):
                raise


def service(projects):
    import os
    import boto3
    bucket = os.environ.get('CORPUS_BUCKET')
    if not bucket:
        fail(503, 'not_configured', 'Project storage is not configured')
    return Deletions(projects, projects.table, boto3.client('dynamodb'), boto3.client('s3'), bucket)
