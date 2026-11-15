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
