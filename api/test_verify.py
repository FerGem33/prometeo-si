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
    # T17: an answer with no usable condition is a limit of the question (200 unsupported), not an outage (502).
    # Nothing invalid reaches the scenario: unknown variables, out-of-range numbers and unknown categories are dropped.
    monkeypatch.setattr(h, 'model_json', lambda *args: {'values':values,'active':active,'filters':{}})
    response = call('/ask', case('ask'))
    assert response['statusCode'] == 200
    body = json.loads(response['body'])
    assert body == {'unsupported': 'Only scenario changes are supported.'} or (set(body['values']) <= {'p'} and body['values'].get('p') == .5)


def ask_with(monkeypatch, conditions, **extra):
    monkeypatch.setattr(h, 'model_json', lambda *args: {'conditions': conditions})
    return json.loads(call('/ask', {**case('ask'), **extra})['body'])


def test_ask_converts_units_in_code(monkeypatch):
    # 10.2 psi / 14.6959 = 0.6941 atm; 70.3 kPa / 101.325 = 0.6938 atm (factors from schema display_units)
    out = ask_with(monkeypatch, [{'variable':'o2','value':30,'unit':'%'}, {'variable':'p','value':10.2,'unit':'psi'}, {'variable':'material','value':'pmma','unit':''}])
    assert out == {'values': {'o2': 30, 'p': 0.6941, 'material': 'PMMA'}, 'active': ['o2','p','material'], 'filters': {}}
    assert ask_with(monkeypatch, [{'variable':'p','value':'70.3','unit':'kPa'}])['values'] == {'p': 0.6938}


def test_ask_prompt_explicitly_maps_gravity_g(monkeypatch):
    data = case('ask'); data['question'] = 'What if the base used PMMA at 0.17 g?'
    prompts = []
    def model(system, user):
        prompts.append(system)
        return {'conditions': [{'variable':'g','value':0.17,'unit':'g'}]}
    monkeypatch.setattr(h, 'model_json', model)
    body = json.loads(call('/ask', data)['body'])
    assert body['values'] == {'g': 0.17}
    assert '"0.17 g" is variable "g", value 0.17, unit "g"' in prompts[0]


def test_ask_keeps_gravity_and_flow(monkeypatch):
    out = ask_with(monkeypatch, [{'variable':'g','value':0.17,'unit':'g'}, {'variable':'flow','value':5,'unit':'cm/s'}])
    assert out['values'] == {'g': 0.17, 'flow': 5} and out['active'] == ['g', 'flow']


def test_ask_drops_invalid_items_and_reports_them_to_version_2(monkeypatch):
    conditions = [{'variable':'o2','value':30,'unit':'%'}, {'variable':'p','value':500,'unit':'mmHg'}, {'variable':'material','value':'Cotton','unit':''},
                  {'variable':'humidity','value':40,'unit':'%'}, {'variable':'o2','value':21,'unit':'%'}, {'variable':'flow','value':900,'unit':'cm/s'}]
    assert ask_with(monkeypatch, conditions) == {'values': {'o2': 30}, 'active': ['o2'], 'filters': {}}
    notes = ask_with(monkeypatch, conditions, version=2)['notes']
    assert [n['code'] for n in notes] == ['unknown_unit', 'unknown_category', 'unknown_variable', 'duplicate', 'out_of_range']
    none = ask_with(monkeypatch, [{'variable':'material','value':'Cotton','unit':''}], version=2)
    assert none['unsupported'] and none['notes'][0]['code'] == 'unknown_category'


def test_ask_model_marks_unsupported_or_answers_garbage(monkeypatch):
    for answer in ({'unsupported': True}, {'conditions': 'x'}, [], {'text': 'hello'}):
        monkeypatch.setattr(h, 'model_json', lambda *args, a=answer: a)
        response = call('/ask', case('ask'))
        assert response['statusCode'] == 200 and json.loads(response['body']) == {'unsupported': 'Only scenario changes are supported.'}


def test_ask_502_only_when_the_model_call_fails(monkeypatch):
    def fail(*args): raise RuntimeError('secret')
    monkeypatch.setattr(h, 'model_json', fail)
    response = call('/ask', case('ask'))
    assert response['statusCode'] == 502 and 'secret' not in response['body']


def test_model_json_tolerates_fence_and_prose():
    assert h.parse_model_json('```json\n{"conditions": []}\n```') == {'conditions': []}
    assert h.parse_model_json('Here it is:\n{"conditions": [{"variable": "p"}]}\nDone.') == {'conditions': [{'variable': 'p'}]}
    with pytest.raises(ValueError):
        h.parse_model_json('no json here')


def lunar_allowed():
    refs = {r['id'] for r in h.pack()['records']} | {s['id'] for s in h.pack()['studies']}
    return candidates(case('analysis_lunar')['findings'], h.schema(), refs)


def test_analysis_candidates_include_context_and_edge():
    # analysis_lunar.json is what the page sends for the default preset (web/src/report/events.test.ts)
    texts = {a['finding']: a['text'] for a in lunar_allowed()}
    assert texts['above_tested:o2'] == 'Oxygen concentration is 7.8 percentage points above the tested range; the highest recorded value is 22.2 %.'
    assert texts['tested_elsewhere:p'].startswith('107 tests in other partitions')
    assert texts['tested_elsewhere:o2'].startswith('36 tests in other partitions')
    assert list(texts) == ['never_measured:p', 'above_tested:o2', 'tested_elsewhere:o2', 'tested_elsewhere:p', 'category_tested:material']


def test_lunar_analysis_end_to_end(monkeypatch):
    a = lunar_allowed()
    monkeypatch.setattr(h, 'model_json', lambda *args: {'sentences': [{'finding': x['finding'], 'text': x['text']} for x in a[:4]]})
    body = json.loads(call('/analysis', case('analysis_lunar'))['body'])
    assert body['mode'] == 'ai' and len(body['sentences']) == 4 and body['dropped'] == 0


def test_fabricated_context_count_rejected(monkeypatch):
    data = case('analysis_lunar')
    f = next(x for x in data['findings'] if x['id'] == 'tested_elsewhere:p'); f['params']['n'] = 500
    monkeypatch.setattr(h, 'model_json', lambda *args: pytest.fail('Must reject before model'))
    assert call('/analysis', data)['statusCode'] == 400


def test_fabricated_edge_rejected(monkeypatch):
    data = case('analysis_lunar')
    f = next(x for x in data['findings'] if x['id'] == 'above_tested:o2'); f['params']['edge'] = 29
    monkeypatch.setattr(h, 'model_json', lambda *args: pytest.fail('Must reject before model'))
    assert call('/analysis', data)['statusCode'] == 400


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
