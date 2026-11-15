import copy
import json
from urllib.parse import parse_qs, urlparse

import boto3
from boto3.dynamodb.types import TypeDeserializer
from botocore.config import Config
from botocore.exceptions import ClientError
import pytest

from api.projects import ApiError
from api.upload_tickets import Limits, UploadTickets, validate


class Repository:
    name = 'table-test'

    def __init__(self):
        self.parent = {'status': 'draft', 'revision': 1, 'counts': {'documents': 0}}
        self.items = {}
        self.race = False
        self.calls = 0

    def get(self, uid, pid):
        if uid != 'owner':
            raise ApiError(404, 'not_found', 'Project not found')
        return copy.deepcopy(self.parent)

    def get_item(self, Key, **kwargs):
        item = self.items.get((Key['PK'], Key['SK']))
        return {'Item': copy.deepcopy(item)} if item else {}

    def transact_write_items(self, TransactItems):
        self.calls += 1
        update, put = TransactItems[0]['Update'], TransactItems[1]['Put']
        decode = TypeDeserializer().deserialize
        values = {k: decode(v) for k, v in update['ExpressionAttributeValues'].items()}
        item = {k: decode(v) for k, v in put['Item'].items()}
        if (self.race or self.parent['revision'] != values[':revision']
                or self.parent['counts']['documents'] >= values[':limit']):
            raise ClientError({'Error': {'Code': 'TransactionCanceledException'}}, 'TransactWriteItems')
        self.items[item['PK'], item['SK']] = item
        self.parent['counts']['documents'] += 1
        self.parent['revision'] += 1


class S3:
    def __init__(self):
        self.calls = []

    def generate_presigned_url(self, *args, **kwargs):
        self.calls.append((args, kwargs))
        return 'https://upload.test/temporary'


@pytest.fixture
def upload():
    repo, s3 = Repository(), S3()
    return UploadTickets(repo, repo, repo, s3, 'bucket-test', Limits(100, 10, 2)), repo, s3


DATA = {'name': 'original.csv', 'media_type': 'text/csv', 'bytes': 20}


def original_fixture(upload, paper=True):
    service, repo, s3 = upload
    data = {**DATA, 'name': 'original.pdf', 'media_type': 'application/pdf'} if paper else DATA
    ticket = service.reserve('owner', 'prj_test', data, 'original')
    item = next(iter(repo.items.values()))
    item.update(expected_sha256='a'*64, object_etag='"etag"', status='done', pages=5)
    s3.calls.clear()
    return service, repo, s3, ticket['doc_id'], item


def test_original_url_is_owned_short_lived_and_opens_the_cited_page(upload):
    service, _, s3, did, _ = original_fixture(upload)
    result = service.original_url('owner', 'prj_test', did, {'page': 3})
    assert result == {'url': 'https://upload.test/temporary#page=3', 'expires_in': 300}
    args, kwargs = s3.calls[0]
    assert args == ('get_object',) and kwargs['ExpiresIn'] == 300 and kwargs['HttpMethod'] == 'GET'
    assert kwargs['Params']['Key'] == 'u/owner/p/prj_test/raw/'+did
    assert kwargs['Params']['ResponseContentType'] == 'application/pdf'
    assert service.original_url('owner', 'prj_test', did, {})['url'] == 'https://upload.test/temporary'


@pytest.mark.parametrize('data', [{'page': x} for x in (0, -1, True, None, '2', 6)] + [{'extra': 1}])
def test_invalid_original_page_never_signs(upload, data):
    service, _, s3, did, _ = original_fixture(upload)
    with pytest.raises(ApiError) as exc:
        service.original_url('owner', 'prj_test', did, data)
    assert exc.value.status == 400 and not s3.calls


def test_original_url_denies_foreign_missing_deleted_uncompleted_and_changed_keys(upload):
    service, _, s3, did, item = original_fixture(upload)
    for uid, document in [('other', did), ('owner', 'doc_'+'0'*32)]:
        with pytest.raises(ApiError) as exc:
            service.original_url(uid, 'prj_test', document, {})
        assert exc.value.status == 404 and not s3.calls
    item['status'] = 'deleting'
    with pytest.raises(ApiError) as exc:
        service.original_url('owner', 'prj_test', did, {})
    assert exc.value.status == 404
    item['status'] = 'done'
    item['object_key'] = 'u/other/p/prj_test/raw/'+did
    with pytest.raises(ApiError) as exc:
        service.original_url('owner', 'prj_test', did, {})
    assert exc.value.status == 409 and not s3.calls
    item['object_key'] = 'u/owner/p/prj_test/raw/'+did
    item.pop('object_etag')
    with pytest.raises(ApiError) as exc:
        service.original_url('owner', 'prj_test', did, {})
    assert exc.value.status == 409 and not s3.calls


def test_page_requires_parsed_pdf_but_csv_original_can_be_opened_without_page(upload):
    service, _, s3, did, item = original_fixture(upload, paper=False)
    with pytest.raises(ApiError) as exc:
        service.original_url('owner', 'prj_test', did, {'page': 1})
    assert exc.value.status == 400 and not s3.calls
    assert service.original_url('owner', 'prj_test', did, {})['expires_in'] == 300
    item['kind'] = 'paper'
    item.pop('pages')
    s3.calls.clear()
    with pytest.raises(ApiError) as exc:
        service.original_url('owner', 'prj_test', did, {'page': 1})
    assert exc.value.status == 409 and not s3.calls


def test_limits_no_implicit_defaults(monkeypatch):
    monkeypatch.delenv('UPLOADS_ENABLED', raising=False)
    with pytest.raises(ApiError) as e:
        Limits.configured()
    assert e.value.status == 503
    monkeypatch.setenv('UPLOADS_ENABLED', 'true')
    monkeypatch.setenv('UPLOAD_LIMITS_JSON', '{}')
    with pytest.raises(ApiError):
        Limits.configured()
    monkeypatch.setenv('UPLOAD_LIMITS_JSON', json.dumps({'max_bytes': 100, 'max_pages': 10, 'max_documents': 2}))
    assert Limits.configured() == Limits(100, 10, 2)


def test_reservation_atomic_and_replay_without_double_count(upload):
    service, repo, s3 = upload
    first = service.reserve('owner', 'prj_test', DATA, 'request-1')
    assert service.reserve('owner', 'prj_test', DATA, 'request-1') == first
    assert repo.calls == 1 and repo.parent['counts']['documents'] == 1
    params = s3.calls[0][1]
    assert params['ExpiresIn'] == 300 and params['HttpMethod'] == 'PUT'
    assert params['Params']['ContentLength'] == 20
    assert params['Params']['Key'] == 'u/owner/p/prj_test/raw/'+first['doc_id']
    stored = next(iter(repo.items.values()))
    assert stored['sha256'] is None and stored['stage'] == 'upload'


def test_idempotency_payload_conflict(upload):
    service, repo, _ = upload
    service.reserve('owner', 'prj_test', DATA, 'same-key')
    with pytest.raises(ApiError) as e:
        service.reserve('owner', 'prj_test', {**DATA, 'bytes': 21}, 'same-key')
    assert e.value.status == 409 and repo.calls == 1


def test_cross_owner_never_signs_or_mutates(upload):
    service, repo, s3 = upload
    with pytest.raises(ApiError) as e:
        service.reserve('intruder', 'prj_test', DATA)
    assert e.value.status == 404 and not s3.calls and not repo.calls


def test_last_slot_and_concurrent_update(upload):
    service, repo, _ = upload
    repo.parent['counts']['documents'] = 1
    service.reserve('owner', 'prj_test', DATA)
    with pytest.raises(ApiError) as e:
        service.reserve('owner', 'prj_test', DATA)
    assert e.value.status == 422 and e.value.details['limit'] == 2
    assert repo.parent['counts']['documents'] == 2
    repo.parent['counts']['documents'] = 1
    repo.race = True
    with pytest.raises(ApiError) as e:
        service.reserve('owner', 'prj_test', DATA)
    assert e.value.status == 409 and repo.parent['counts']['documents'] == 1


@pytest.mark.parametrize('change', [{'bytes': True}, {'bytes': 0}, {'media_type': 'text/html'},
    {'name': '../escape.csv'}, {'name': 'bad\n.csv'}, {'key': 'client/path'}, {'bytes': 101}])
def test_input_validation(upload, change):
    service, repo, s3 = upload
    with pytest.raises(ApiError) as e:
        service.reserve('owner', 'prj_test', {**DATA, **change})
    assert e.value.status in (400, 413)
    assert not s3.calls and not repo.calls


def test_closed_project_rejects_initial_and_replay(upload):
    service, repo, _ = upload
    service.reserve('owner', 'prj_test', DATA, 'one')
    repo.parent['status'] = 'published'
    with pytest.raises(ApiError):
        service.reserve('owner', 'prj_test', DATA, 'one')
    with pytest.raises(ApiError):
        service.reserve('owner', 'prj_test', DATA)


def test_actual_sdk_signs_type_length_and_expiry_without_network(upload):
    service, _, _ = upload
    service.s3 = boto3.client('s3', region_name='us-east-1', aws_access_key_id='test-only',
        aws_secret_access_key='test-only', config=Config(signature_version='s3v4'))
    ticket = service.reserve('owner', 'prj_test', DATA)
    query = parse_qs(urlparse(ticket['upload']['url']).query)
    assert query['X-Amz-Expires'] == ['300']
    assert 'content-length' in query['X-Amz-SignedHeaders'][0]
    assert 'content-type' in query['X-Amz-SignedHeaders'][0]
    assert 'if-none-match' in query['X-Amz-SignedHeaders'][0]
    assert ticket['upload']['headers']['if-none-match'] == '*'


class CompleteRepository(Repository):
    def transact_write_items(self, TransactItems):
        if '#documents' in TransactItems[0]['Update']['ExpressionAttributeNames']:
            return super().transact_write_items(TransactItems)
        decode = TypeDeserializer().deserialize
        item = {k: decode(v) for k, v in TransactItems[1]['Put']['Item'].items()}
        old = self.items[item['PK'], item['SK']]
        if old.get('expected_sha256') or self.race:
            raise ClientError({'Error': {'Code': 'TransactionCanceledException'}}, 'TransactWriteItems')
        self.items[item['PK'], item['SK']] = item
        self.parent['status'] = 'processing'
        self.parent['revision'] += 1

    def update_item(self, Key, **kwargs):
        if Key['PK'].startswith('U#'):
            self.parent['status'] = 'processing'; self.parent['revision'] += 1
        else:
            item = self.items[Key['PK'], Key['SK']]
            if ':queued' in kwargs['ExpressionAttributeValues']:
                item.update(dispatch_pending=True, status='queued', worker_until=0)
            else:
                item['dispatch_pending'] = False

    def query(self, **kwargs):
        return {'Items': list(self.items.values())}


class UploadedS3(S3):
    def head_object(self, **kwargs):
        return {'ContentLength': 20, 'ContentType': 'text/csv', 'ETag': 'object-etag'}


class Queue:
    def __init__(self):
        self.messages = []
        self.fail = False

    def send_message(self, **kwargs):
        if self.fail:
            raise RuntimeError('Queue unavailable')
        self.messages.append(json.loads(kwargs['MessageBody']))


@pytest.fixture
def completed_upload():
    repo, queue, s3 = CompleteRepository(), Queue(), UploadedS3()
    service = UploadTickets(repo, repo, repo, s3, 'bucket-test', Limits(100, 10, 2), queue, 'queue-url')
    ticket = service.reserve('owner', 'prj_test', DATA)
    return service, repo, queue, ticket['doc_id']


def test_complete_and_replay_do_not_trust_hash_or_duplicate_queue(completed_upload):
    service, repo, queue, did = completed_upload
    result = service.complete('owner', 'prj_test', did, {'sha256': 'a'*64})
    assert result['sha256'] is None and result['stage'] == 'parse'
    assert len(queue.messages) == 1 and repo.parent['status'] == 'processing'
    assert service.complete('owner', 'prj_test', did, {'sha256': 'a'*64}) == result
    assert len(queue.messages) == 1
    with pytest.raises(ApiError) as e:
        service.complete('owner', 'prj_test', did, {'sha256': 'b'*64})
    assert e.value.status == 409


def test_queue_failure_keeps_durable_pending_and_retry_sends(completed_upload):
    service, repo, queue, did = completed_upload
    queue.fail = True
    with pytest.raises(RuntimeError):
        service.complete('owner', 'prj_test', did, {'sha256': 'a'*64})
    assert service.get('prj_test', did)['dispatch_pending'] is True
    queue.fail = False
    service.complete('owner', 'prj_test', did, {'sha256': 'a'*64})
    assert len(queue.messages) == 1 and service.get('prj_test', did)['dispatch_pending'] is False


def test_complete_owner_and_metadata_checks(completed_upload, monkeypatch):
    service, _, queue, did = completed_upload
    with pytest.raises(ApiError) as e:
        service.complete('intruder', 'prj_test', did, {'sha256': 'a'*64})
    assert e.value.status == 404
    monkeypatch.setattr(service.s3, 'head_object', lambda **kw: {'ContentLength': 21, 'ContentType': 'text/csv', 'ETag': 'e'})
    with pytest.raises(ApiError) as e:
        service.complete('owner', 'prj_test', did, {'sha256': 'a'*64})
    assert e.value.status == 409 and not queue.messages


def test_complete_missing_object_and_invalid_hash(completed_upload, monkeypatch):
    service, _, _, did = completed_upload
    with pytest.raises(ApiError) as e:
        service.complete('owner', 'prj_test', did, {'sha256': 'bad'})
    assert e.value.status == 400
    def missing(**kwargs):
        raise ClientError({'Error': {'Code': 'NoSuchKey'}}, 'HeadObject')
    monkeypatch.setattr(service.s3, 'head_object', missing)
    with pytest.raises(ApiError) as e:
        service.complete('owner', 'prj_test', did, {'sha256': 'a'*64})
    assert e.value.status == 409


def test_list_projection_hides_pending_hash_and_internal_keys(completed_upload):
    service, _, _, _ = completed_upload
    result = service.list('owner', 'prj_test', {})
    assert len(result['items']) == 1
    assert not {'object_key', 'upload_request', 'PK', 'SK'} & result['items'][0].keys()
    with pytest.raises(ApiError) as e:
        service.list('intruder', 'prj_test', {})
    assert e.value.status == 404


def test_jobs_resume_only_unfinished_completed_uploads(completed_upload):
    service, repo, queue, did = completed_upload
    service.complete('owner', 'prj_test', did, {'sha256': 'a'*64})
    jobs = service.jobs('owner', 'prj_test')
    assert jobs['totals']['queued'] == 1 and jobs['jobs'][0]['stage'] == 'parse'
    assert service.resume('owner', 'prj_test') == {'reenqueued': 1}
    assert len(queue.messages) == 2
    repo.items['P#prj_test', 'D#'+did]['status'] = 'done'
    assert service.resume('owner', 'prj_test') == {'reenqueued': 0}


def test_expired_worker_lease_can_resume_but_active_cannot(completed_upload):
    service, repo, _, did = completed_upload
    service.complete('owner', 'prj_test', did, {'sha256': 'a'*64})
    item = repo.items['P#prj_test', 'D#'+did]
    item.update(status='running', worker_until=9999999999)
    assert service.resume('owner', 'prj_test')['reenqueued'] == 0
    item['worker_until'] = 0
    assert service.resume('owner', 'prj_test')['reenqueued'] == 1


def test_selected_resume_keeps_pending_durable_when_sqs_fails(completed_upload):
    service, repo, queue, did = completed_upload
    service.complete('owner', 'prj_test', did, {'sha256': 'a'*64})
    repo.items['P#prj_test', 'D#'+did].update(status='failed', worker_until=0)
    queue.fail = True
    with pytest.raises(RuntimeError):
        service.resume('owner', 'prj_test', {'doc_ids': [did]})
    assert service.get('prj_test', did)['status'] == 'queued'
    assert service.get('prj_test', did)['dispatch_pending'] is True


def test_full_batch_of_30_documents_then_limit():
    repo, s3 = Repository(), S3()
    service = UploadTickets(repo, repo, repo, s3, 'bucket-test', Limits(100, 60, 30))
    for i in range(30):
        service.reserve('owner', 'prj_test', {**DATA, 'name': f'doc{i}.csv'})
    assert repo.parent['counts']['documents'] == 30 and len(s3.calls) == 30
    with pytest.raises(ApiError) as e:
        service.reserve('owner', 'prj_test', {**DATA, 'name': 'doc30.csv'})
    assert e.value.status == 422 and e.value.details['limit'] == 30 and repo.parent['counts']['documents'] == 30
