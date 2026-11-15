"""Local doubles: neither Cognito JWT verification nor real DynamoDB evidence."""
import copy
import json
import time

import pytest
from botocore.exceptions import ClientError
from api import projects
from api.handler import handler


def collision():
    return ClientError({'Error': {'Code': 'ConditionalCheckFailedException'}}, 'PutItem')


class Table:
    def __init__(self):
        self.items = {}
        self.query_args = None
        self.race = False

    def get_item(self, Key, **kwargs):
        item = self.items.get((Key['PK'], Key['SK']))
        return {'Item': copy.deepcopy(item)} if item else {}

    def put_item(self, Item, ConditionExpression, **kwargs):
        key = Item['PK'], Item['SK']
        old = self.items.get(key)
        if ConditionExpression == 'attribute_not_exists(PK)' and old:
            raise collision()
        if ConditionExpression == 'revision = :rev' and (
                self.race or not old or old['revision'] != kwargs['ExpressionAttributeValues'][':rev']):
            raise collision()
        self.items[key] = copy.deepcopy(Item)

    def query(self, **kwargs):
        self.query_args = kwargs
        # Evaluate actual boto3 condition values, including the owner partition.
        expr = kwargs['KeyConditionExpression'].get_expression()
        owner = expr['values'][0].get_expression()['values'][1]
        rows = sorted((v for (pk, _), v in self.items.items() if pk == owner), key=lambda i: i['SK'])
        start = kwargs.get('ExclusiveStartKey', {}).get('SK', '')
        rows = [r for r in rows if r['SK'] > start]
        limit = kwargs['Limit']
        result = {'Items': copy.deepcopy(rows[:limit])}
        if len(rows) > limit:
            result['LastEvaluatedKey'] = {k: rows[limit-1][k] for k in ('PK', 'SK')}
        return result


@pytest.fixture
def setup(monkeypatch):
    table = Table()
    service = projects.Projects(table)
    monkeypatch.setenv('COGNITO_ISSUER', 'https://issuer.test/pool')
    monkeypatch.setenv('USER_POOL_CLIENT_ID', 'client-test')
    monkeypatch.setenv('CF_URL', 'https://web.test')
    monkeypatch.setattr(projects, 'store', lambda: service)
    return service, table


def event(uid='user-a', method='POST', path='/projects', data=None):
    return {'requestContext': {'http': {'method': method}, 'authorizer': {'jwt': {'claims': {
        'sub': uid, 'iss': 'https://issuer.test/pool', 'aud': 'client-test', 'token_use': 'id',
        'exp': str(time.time()+600)}}}}, 'rawPath': path, 'headers': {'origin': 'https://web.test'},
        'body': json.dumps(data if data is not None else {'name': 'Project A', 'intent': 'Review corpus'})}


def request(e):
    result = handler(e)
    return result['statusCode'], json.loads(result['body'])


def test_isolation_read_write_list_and_no_internal_fields(setup):
    _, table = setup
    status, a = request(event())
    assert status == 201 and a['status'] == 'draft'
    assert not {'PK', 'SK', 'revision', 'create_request'} & a.keys()
    assert request(event('user-b', 'GET', '/projects/'+a['id']))[0] == 404
    assert request(event('user-b', 'PATCH', '/projects/'+a['id'], {'name': 'Changed'}))[0] == 404
    assert request(event('user-b', 'GET'))[1]['items'] == []
    assert request(event(method='GET'))[1]['items'] == [a]
    assert next(iter(table.items))[0] == 'U#user-a'


@pytest.mark.parametrize('change', ['missing', 'expired', 'issuer', 'audience', 'access', 'nan'])
def test_reject_untrusted_identity(setup, change):
    e = event()
    c = e['requestContext']['authorizer']['jwt']['claims']
    if change == 'missing':
        del e['requestContext']['authorizer']
    else:
        c.update({'expired': {'exp': '0'}, 'issuer': {'iss': 'elsewhere'},
                  'audience': {'aud': 'other-client'}, 'access': {'token_use': 'access'},
                  'nan': {'exp': 'nan'}}[change])
    assert request(e)[0] == 401


def test_fail_closed_when_not_configured(setup, monkeypatch):
    monkeypatch.delenv('COGNITO_ISSUER')
    assert request(event())[0] == 503


@pytest.mark.parametrize('data', [{}, {'name': 'x'}, {'name': ' ', 'intent': 'x'},
                               {'name': 'x', 'intent': 'x', 'uid': 'user-b'},
                               {'name': 'x', 'intent': 7}, {'name': 'x'*201, 'intent': 'x'}])
def test_validation(setup, data):
    assert request(event(data=data))[0] == 400


def test_idempotency_scoped_to_owner_and_payload(setup):
    e = event()
    e['headers']['Idempotency-Key'] = 'request-1'
    first = request(e)
    assert request(e) == first
    e['body'] = json.dumps({'name': 'different', 'intent': 'Review corpus'})
    assert request(e)[0] == 409
    e['requestContext']['authorizer']['jwt']['claims']['sub'] = 'user-b'
    assert request(e)[1]['id'] != first[1]['id']


def test_patch_repeated_and_concurrent_and_processed(setup):
    _, table = setup
    _, a = request(event())
    e = event(method='PATCH', path='/projects/'+a['id'], data={'intent': 'New intent'})
    first = request(e)
    assert first[1]['name'] == a['name'] and first[1]['lens_version'] is None
    assert request(e) == first
    table.race = True
    e['body'] = json.dumps({'name': 'Another name'})
    assert request(e)[0] == 409
    table.race = False
    next(iter(table.items.values()))['status'] = 'published'
    assert request(e)[0] == 409


def test_pagination_and_cross_owner_cursor(setup):
    for i in range(3):
        request(event(data={'name': str(i), 'intent': 'Test pagination'}))
    e = event(method='GET')
    e['queryStringParameters'] = {'limit': '2'}
    _, page = request(e)
    assert len(page['items']) == 2 and page['next_cursor']
    e['queryStringParameters']['cursor'] = page['next_cursor']
    assert len(request(e)[1]['items']) == 1
    e['requestContext']['authorizer']['jwt']['claims']['sub'] = 'user-b'
    assert request(e)[0] == 400
    e['queryStringParameters'] = {'cursor': 'not-json'}
    assert request(e)[0] == 400


def test_malformed_body_routes_and_cors(setup):
    e = event()
    e['body'] = 'not-json'
    assert request(e)[0] == 400
    e['isBase64Encoded'] = True
    assert request(e)[0] == 400
    assert request(event(method='DELETE'))[0] == 405
    assert request(event(path='/projects/prj_bad'))[0] == 404
    assert request(event(path='/projects/prj_'+'a'*32+'/documents'))[0] == 404
    response = handler(event())
    assert 'authorization' in response['headers']['access-control-allow-headers']


def test_storage_failure_is_sanitized(setup, monkeypatch):
    def broken():
        raise RuntimeError('sensitive details')
    monkeypatch.setattr(projects, 'store', broken)
    code, output = request(event())
    assert code == 500 and 'sensitive' not in str(output)
