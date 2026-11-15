"""T33 DELETE with local doubles; not evidence of real S3/DynamoDB/IAM behavior."""
import copy
import json
import time

from boto3.dynamodb.types import TypeDeserializer
from botocore.exceptions import ClientError
import pytest

from api import projects
from api.deletions import Deletions
from api.handler import handler
from api.ingest_worker import Worker
from api.upload_tickets import Limits, UploadTickets

PID, OTHER = 'prj_' + 'a' * 32, 'prj_' + 'f' * 32
DOC, DOC2 = 'doc_' + 'b' * 32, 'doc_' + 'c' * 32
NOW = 1_000_000


def error(code):
    return ClientError({'Error': {'Code': code}}, 'test')


def key_condition(cond):
    expr = cond.get_expression()
    if expr['operator'] == 'AND':
        return {**key_condition(expr['values'][0]), **key_condition(expr['values'][1])}
    return {(expr['values'][0].name, expr['operator']): expr['values'][1]}


class Store:
    """DynamoDB table + transaction client double for the expressions used by Deletions."""
    name = 'table-test'

    def __init__(self):
        self.items = {}
        self.cancel_next_transaction = False

    def put(self, **item):
        self.items[item['PK'], item['SK']] = item

    def get_item(self, Key, **kwargs):
        item = self.items.get((Key['PK'], Key['SK']))
        return {'Item': copy.deepcopy(item)} if item else {}

    def query(self, KeyConditionExpression, **kwargs):
        cond = key_condition(KeyConditionExpression)
        pk, prefix = cond[('PK', '=')], cond.get(('SK', 'begins_with'), '')
        rows = sorted((v for (p, s), v in self.items.items() if p == pk and s.startswith(prefix)), key=lambda i: i['SK'])
        start = kwargs.get('ExclusiveStartKey', {}).get('SK', '')
        rows = [r for r in rows if r['SK'] > start]
        result = {'Items': copy.deepcopy(rows[:2])}  # small pages to exercise pagination
        if len(rows) > 2:
            result['LastEvaluatedKey'] = {'PK': rows[1]['PK'], 'SK': rows[1]['SK']}
        return result

    def update_item(self, Key, UpdateExpression, ConditionExpression, ExpressionAttributeValues, **kwargs):
        item = self.items.get((Key['PK'], Key['SK']))
        v = ExpressionAttributeValues
        if 'worker_until < :t' in ConditionExpression:  # document tombstone
            if not item or (item['status'] == 'running' and item.get('worker_until', 0) >= v[':t']):
                raise error('ConditionalCheckFailedException')
            item.update(status='deleting')
        elif ConditionExpression == 'revision = :revision':  # project tombstone
            if not item or item['revision'] != v[':revision']:
                raise error('ConditionalCheckFailedException')
            item.update(status='deleting', revision=item['revision'] + 1)
        else:
            raise AssertionError(UpdateExpression)

    def delete_item(self, Key, ConditionExpression=None, ExpressionAttributeValues=None, **kwargs):
        item = self.items.get((Key['PK'], Key['SK']))
        if ConditionExpression == 'doc_id = :did' and (not item or item['doc_id'] != ExpressionAttributeValues[':did']):
            raise error('ConditionalCheckFailedException')
        if ConditionExpression == '#status = :deleting' and (not item or item['status'] != 'deleting'):
            raise error('ConditionalCheckFailedException')
        self.items.pop((Key['PK'], Key['SK']), None)

    def transact_write_items(self, TransactItems):
        if self.cancel_next_transaction:
            self.cancel_next_transaction = False
            raise error('TransactionCanceledException')
        decode = TypeDeserializer().deserialize
        delete, update = TransactItems[0]['Delete'], TransactItems[1]['Update']
        doc_key = tuple(decode(delete['Key'][k]) for k in ('PK', 'SK'))
        parent_key = tuple(decode(update['Key'][k]) for k in ('PK', 'SK'))
        values = {k: decode(x) for k, x in update['ExpressionAttributeValues'].items()}
        doc, parent = self.items.get(doc_key), self.items.get(parent_key)
        if (not doc or doc['status'] != 'deleting' or parent['revision'] != values[':revision']
                or parent['counts']['documents'] <= 0 or parent['status'] in ('published', 'deleting')):
            raise error('TransactionCanceledException')
        del self.items[doc_key]
        parent['counts']['documents'] -= 1
        parent.update(status=values[':status'], revision=parent['revision'] + 1)


class S3:
    def __init__(self):
        self.objects = {}

    def list_objects_v2(self, Bucket, Prefix, ContinuationToken=None):
        # Like S3: the continuation is key-based, so deleting listed objects does not shift pages.
        keys = sorted(k for k in self.objects if k.startswith(Prefix) and k > (ContinuationToken or ''))
        page, more = keys[:2], len(keys) > 2
        return {'Contents': [{'Key': k} for k in page], 'IsTruncated': more,
                **({'NextContinuationToken': page[-1]} if more else {})}

    def delete_objects(self, Bucket, Delete):
        for o in Delete['Objects']:
            self.objects.pop(o['Key'], None)
        return {}


def raw(uid, pid, did):
    return f'u/{uid}/p/{pid}/raw/{did}'


@pytest.fixture
def world():
    store, s3 = Store(), S3()
    store.put(PK='U#owner', SK='P#' + PID, id=PID, status='processing', revision=5,
              counts={'documents': 2, 'records': 0, 'variables': 0, 'conflicts_open': 0})
    for did, status in ((DOC, 'done'), (DOC2, 'done')):
        store.put(PK='P#' + PID, SK='D#' + did, id=did, name=did + '.csv', status=status, stage='propose',
                  object_key=raw('owner', PID, did), sha256=did[-1] * 64, uploaded_at='t')
        store.put(PK='P#' + PID, SK='H#' + did[-1] * 64, doc_id=did)
        s3.objects[raw('owner', PID, did)] = b'x'
        for name in ('parsed.json', 'proposals.json', 'r1-raw.json'):
            s3.objects[f'u/owner/p/{PID}/text/{did}/{name}'] = b'x'
    # Another project of the same user and another user's object: must never be touched.
    store.put(PK='U#owner', SK='P#' + OTHER, id=OTHER, status='draft', revision=1, counts={'documents': 0})
    s3.objects[f'u/owner/p/{OTHER}/raw/doc_x'] = b'x'
    s3.objects[f'u/intruder/p/{PID}/raw/{DOC}'] = b'x'
    deletions = Deletions(projects.Projects(store), store, store, s3, 'bucket-test', now=lambda: NOW)
    return deletions, store, s3


def test_document_removed_with_artifacts_marker_and_quota(world):
    deletions, store, s3 = world
    deletions.delete_document('owner', PID, DOC)
    assert ('P#' + PID, 'D#' + DOC) not in store.items
    assert ('P#' + PID, 'H#' + 'b' * 64) not in store.items
    assert not any(DOC in k and k.startswith('u/owner/') for k in s3.objects)
    assert raw('owner', PID, DOC2) in s3.objects and f'u/intruder/p/{PID}/raw/{DOC}' in s3.objects
    parent = store.items['U#owner', 'P#' + PID]
    assert parent['counts']['documents'] == 1 and parent['status'] == 'awaiting_review'
    deletions.delete_document('owner', PID, DOC2)
    assert parent['counts']['documents'] == 0 and parent['status'] == 'draft'
    with pytest.raises(projects.ApiError) as e:
        deletions.delete_document('owner', PID, DOC)
    assert e.value.status == 404


def test_foreign_owner_gets_404_and_nothing_changes(world):
    deletions, store, s3 = world
    before = (copy.deepcopy(store.items), dict(s3.objects))
    for call in (lambda: deletions.delete_document('intruder', PID, DOC), lambda: deletions.delete_project('intruder', PID)):
        with pytest.raises(projects.ApiError) as e:
            call()
        assert e.value.status == 404
    assert (store.items, s3.objects) == before


def test_active_worker_lease_blocks_and_expired_lease_allows(world):
    deletions, store, s3 = world
    store.items['P#' + PID, 'D#' + DOC].update(status='running', worker_until=NOW + 60)
    for call in (lambda: deletions.delete_document('owner', PID, DOC), lambda: deletions.delete_project('owner', PID)):
        with pytest.raises(projects.ApiError) as e:
            call()
        assert e.value.status == 409
    assert raw('owner', PID, DOC) in s3.objects
    store.items['P#' + PID, 'D#' + DOC]['worker_until'] = NOW - 1
    deletions.delete_document('owner', PID, DOC)
    assert ('P#' + PID, 'D#' + DOC) not in store.items


def test_published_project_documents_are_kept(world):
    deletions, store, _ = world
    store.items['U#owner', 'P#' + PID]['status'] = 'published'
    with pytest.raises(projects.ApiError) as e:
        deletions.delete_document('owner', PID, DOC)
    assert e.value.status == 409 and store.items['P#' + PID, 'D#' + DOC]['status'] == 'done'


def test_interrupted_document_deletion_completes_on_retry_without_double_count(world):
    deletions, store, s3 = world
    store.cancel_next_transaction = True
    with pytest.raises(projects.ApiError) as e:
        deletions.delete_document('owner', PID, DOC)
    assert e.value.status == 409
    assert store.items['P#' + PID, 'D#' + DOC]['status'] == 'deleting'
    assert store.items['U#owner', 'P#' + PID]['counts']['documents'] == 2
    deletions.delete_document('owner', PID, DOC)
    assert store.items['U#owner', 'P#' + PID]['counts']['documents'] == 1


def test_duplicate_marker_of_another_document_is_kept(world):
    deletions, store, _ = world
    store.items['P#' + PID, 'H#' + 'b' * 64]['doc_id'] = DOC2
    deletions.delete_document('owner', PID, DOC)
    assert ('P#' + PID, 'H#' + 'b' * 64) in store.items


def test_project_deletion_removes_only_its_prefix_and_items(world):
    deletions, store, s3 = world
    deletions.delete_project('owner', PID)
    assert not any(pk in ('P#' + PID,) or sk == 'P#' + PID for pk, sk in store.items)
    assert ('U#owner', 'P#' + OTHER) in store.items
    assert sorted(s3.objects) == sorted([f'u/owner/p/{OTHER}/raw/doc_x', f'u/intruder/p/{PID}/raw/{DOC}'])
    with pytest.raises(projects.ApiError) as e:
        deletions.delete_project('owner', PID)
    assert e.value.status == 404


def test_interrupted_project_deletion_resumes(world, monkeypatch):
    deletions, store, s3 = world
    original = s3.delete_objects
    monkeypatch.setattr(s3, 'delete_objects', lambda **kw: {'Errors': [{'Key': 'x'}]})
    with pytest.raises(RuntimeError):
        deletions.delete_project('owner', PID)
    assert store.items['U#owner', 'P#' + PID]['status'] == 'deleting'
    monkeypatch.setattr(s3, 'delete_objects', original)
    deletions.delete_project('owner', PID)
    assert ('U#owner', 'P#' + PID) not in store.items


def test_routes_return_204_without_body_and_advertise_delete(monkeypatch):
    calls = []

    class Stub:
        def delete_project(self, uid, pid):
            calls.append(('project', uid, pid))

        def delete_document(self, uid, pid, did):
            calls.append(('document', uid, pid, did))

    monkeypatch.setenv('COGNITO_ISSUER', 'https://issuer.test/pool')
    monkeypatch.setenv('USER_POOL_CLIENT_ID', 'client-test')
    monkeypatch.setenv('CF_URL', 'https://web.test')
    monkeypatch.setattr(projects, 'deletions', lambda: Stub())

    def event(path):
        return {'requestContext': {'http': {'method': 'DELETE'}, 'authorizer': {'jwt': {'claims': {
            'sub': 'user-a', 'iss': 'https://issuer.test/pool', 'aud': 'client-test', 'token_use': 'id',
            'exp': str(time.time() + 600)}}}}, 'rawPath': path, 'headers': {'origin': 'https://web.test'}}

    for path in (f'/projects/{PID}', f'/projects/{PID}/documents/{DOC}'):
        result = handler(event(path))
        assert result['statusCode'] == 204 and result['body'] == ''
        assert 'DELETE' in result['headers']['access-control-allow-methods']
    assert calls == [('project', 'user-a', PID), ('document', 'user-a', PID, DOC)]


def test_worker_drops_messages_for_deleted_documents(world):
    _, store, s3 = world

    class NoModel:
        messages = None

    worker = Worker(store, s3, 'bucket-test', NoModel(), 'model', {'max_bytes': 100, 'max_pages': 2})
    message = {'version': 1, 'uid': 'owner', 'project_id': PID, 'doc_id': 'doc_' + 'd' * 32}
    assert worker.process(message, 'lease') is None  # document no longer exists in an existing project
    store.items['P#' + PID, 'D#' + DOC]['status'] = 'deleting'
    assert worker.process({**message, 'doc_id': DOC}, 'lease') is None


def test_jobs_hide_documents_being_deleted(world):
    _, store, _ = world
    store.items['P#' + PID, 'D#' + DOC]['status'] = 'deleting'
    tickets = UploadTickets(projects.Projects(store), store, store, None, 'bucket-test', Limits(10, 10, 10))
    jobs = tickets.jobs('owner', PID)
    assert [j['doc_id'] for j in jobs['jobs']] == [DOC2] and jobs['totals']['done'] == 1
