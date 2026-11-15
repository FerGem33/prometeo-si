import json
from pathlib import Path
import pytest
from api import handler as h
from api.verify import candidates, verify


def case(name):
    return json.loads((Path(__file__).parent / 'events' / f'{name}.json').read_text())


def allowed():
    refs = {r['id'] for r in h.pack()['records']} | {s['id'] for s in h.pack()['studies']}
    return candidates(case('analysis')['findings'], h.schema(), refs)


def call(path, data, **extra):
    return h.handler({'rawPath': path, 'requestContext': {'http': {'method': 'POST'}},
                      'body': json.dumps(data), **extra})


def test_real_evidence():
    a = allowed()
    assert '268' in a[0]['text']
    result = verify({'sentences': [{'finding': a[0]['finding'], 'text': a[0]['text']}]}, a)
    assert result['mode'] == 'ai' and result['sentences'][0]['sources']


@pytest.mark.parametrize('text', ['Pressure is recorded in 268 tests.', 'Pressure is safe.',
                                  'Pressure is not recorded in 999 tests.', 'Invented study: pressure is not recorded.'])
def test_invented_sentence_rejected(text):
    assert verify({'sentences': [{'finding': allowed()[0]['finding'], 'text': text}]}, allowed())['mode'] == 'template'


def test_unknown_source():
    f = case('analysis')['findings']; f[0]['sources'] = ['invented']
    with pytest.raises(ValueError):
        candidates(f, h.schema(), set())


def test_ask_valid(monkeypatch):
    result = {'values': {'o2': 25, 'p': .5, 'material': 'Nomex'}, 'active': ['o2','p','material'], 'filters': {}}
    monkeypatch.setattr(h, 'model_json', lambda *args: result)
    assert json.loads(call('/ask', case('ask'))['body']) == result


def test_ask_rejects_outcome_question_without_model(monkeypatch):
    data = case('ask'); data['question'] = 'Which material will ignite first?'
    monkeypatch.setattr(h, 'model_json', lambda *args: pytest.fail('Should not call model'))
    response = call('/ask', data)
    assert response['statusCode'] == 200
    assert json.loads(response['body']) == {'unsupported': 'Only scenario changes are supported.'}


def test_ask_rejects_closest_conditions_query_without_model(monkeypatch):
    data = case('ask'); data['question'] = 'Which conditions are closest to a spacesuit at 100% O₂ and 4.3 psi?'
    monkeypatch.setattr(h, 'model_json', lambda *args: pytest.fail('Should not call model'))
    response = call('/ask', data)
    assert response['statusCode'] == 200
    assert json.loads(response['body']) == {'unsupported': 'Only scenario changes are supported.'}


@pytest.mark.parametrize('values,active', [({'o2': 999}, ['o2']), ({'material':'Cotton'},['material']),
    ({'o2':True},['o2']), ({'unknown':1},['unknown']), ({'p':.5},['o2']), ({'p':.5},['p','p'])])
def test_invalid_model_scenario(monkeypatch, values, active):
    monkeypatch.setattr(h, 'model_json', lambda *args: {'values':values,'active':active,'filters':{}})
    assert call('/ask', case('ask'))['statusCode'] == 502


def test_schema_tampering(monkeypatch):
    data = case('ask'); data['schema']['variables'][0]['range'] = [0, 999]
    monkeypatch.setattr(h, 'model_json', lambda *args: pytest.fail('Should not call model'))
    assert call('/ask', data)['statusCode'] == 400


def test_unsupported_sanitized(monkeypatch):
    monkeypatch.setattr(h, 'model_json', lambda *args: {'unsupported':'unsafe model text'})
    assert 'unsafe model text' not in call('/ask', case('ask'))['body']


def test_failure_fallback(monkeypatch):
    def fail(*args): raise RuntimeError('secret')
    monkeypatch.setattr(h, 'model_json', fail)
    response = call('/analysis', case('analysis'))
    assert response['statusCode'] == 200
    assert json.loads(response['body'])['mode'] == 'template'
    assert 'secret' not in response['body']


def test_analysis_and_cors(monkeypatch):
    a = allowed()
    monkeypatch.setenv('CF_URL', 'https://example.invalid')
    monkeypatch.setattr(h, 'model_json', lambda *args: {'sentences':[{'finding':a[0]['finding'],'text':a[0]['text']}]})
    response = call('/analysis', case('analysis'), headers={'origin':'https://example.invalid'})
    assert response['headers']['access-control-allow-origin'] == 'https://example.invalid'
    assert json.loads(response['body'])['mode'] == 'ai'
    assert 'access-control-allow-origin' not in call('/analysis', case('analysis'), headers={'origin':'https://other.invalid'})['headers']


@pytest.mark.parametrize('raw', ['null', '{', 'NaN', 'x'*180001])
def test_bad_bodies(raw):
    event={'rawPath':'/ask','requestContext':{'http':{'method':'POST'}},'body':raw}
    assert h.handler(event)['statusCode'] == 400


def test_fabricated_count_with_real_sources(monkeypatch):
    data = case('analysis'); data['findings'][0]['params']['n'] = 999
    monkeypatch.setattr(h, 'model_json', lambda *args: pytest.fail('Must reject before model'))
    assert call('/analysis', data)['statusCode'] == 400


@pytest.mark.parametrize('event', [None, {}, {'requestContext':None}, {'requestContext':{'http':None}}])
def test_invalid_event(event):
    assert h.handler(event)['statusCode'] == 400
