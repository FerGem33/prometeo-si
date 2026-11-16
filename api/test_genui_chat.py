import json
from api import handler as h


def call(path, data=None, method='POST'):
    return h.handler({
        'rawPath': path,
        'requestContext': {'http': {'method': method}},
        'headers': {'content-type': 'application/json'},
        'body': json.dumps(data),
    })


SNIPPETS = [
    {'docId': 'd1', 'docName': 'Paper One', 'page': 3,
     'text': 'The  limiting oxygen index reached 22.2% in the “BASS-II” tests.'},
    {'docId': 'd2', 'docName': 'Table', 'row': 5, 'text': 'Pressure was not recorded for these solid samples.'},
]


def chat(monkeypatch, output, **extra):
    monkeypatch.setattr(h, 'model_json', lambda system, data: output)
    return call('/chat', {'question': 'What oxygen was tested?', 'snippets': SNIPPETS, **extra})


def test_chat_happy_path(monkeypatch):
    res = chat(monkeypatch, {'sentences': [{'text': 'Oxygen reached 22.2%.', 'cites': [
        {'docId': 'd1', 'page': 3, 'quote': 'limiting oxygen index reached 22.2% in the "bass-ii"'}]}]},
        history=[{'role': 'user', 'text': 'hi'}],
        variables=[{'id': 'o2', 'label': 'O2', 'unit': '%', 'min': 0, 'max': 100}])
    body = json.loads(res['body'])
    assert res['statusCode'] == 200 and body['mode'] == 'ai' and body['dropped'] == 0
    assert body['sentences'][0]['cites'][0]['docId'] == 'd1'


def test_chat_invented_quote_and_wrong_doc_dropped(monkeypatch):
    res = chat(monkeypatch, {'sentences': [
        {'text': 'Good.', 'cites': [{'docId': 'd2', 'row': 5, 'quote': 'Pressure was not recorded'}]},
        {'text': 'Invented.', 'cites': [{'docId': 'd1', 'quote': 'oxygen index reached 99% in space'}]},
        {'text': 'Wrong doc.', 'cites': [{'docId': 'd2', 'quote': 'limiting oxygen index reached'}]},
        {'text': 'Short.', 'cites': [{'docId': 'd1', 'quote': 'oxygen'}]},
    ]})
    body = json.loads(res['body'])
    assert [s['text'] for s in body['sentences']] == ['Good.']
    assert body['dropped'] == 3 and body['mode'] == 'ai'


def test_chat_all_dropped_is_template(monkeypatch):
    body = json.loads(chat(monkeypatch, {'sentences': [{'text': 'x', 'cites': []}]})['body'])
    assert body == {'mode': 'template', 'sentences': [], 'dropped': 1}
    assert json.loads(chat(monkeypatch, {'sentences': []})['body'])['mode'] == 'template'


def test_chat_invalid_payloads_400():
    ok = {'question': 'q', 'snippets': SNIPPETS}
    assert call('/chat', {'question': 'q'})['statusCode'] == 400
    assert call('/chat', {**ok, 'extra': 1})['statusCode'] == 400
    assert call('/chat', {**ok, 'question': ''})['statusCode'] == 400
    assert call('/chat', {**ok, 'question': 'x' * 2001})['statusCode'] == 400
    assert call('/chat', {**ok, 'snippets': SNIPPETS[:1] * 13})['statusCode'] == 400
    assert call('/chat', {**ok, 'snippets': [{'docId': 'a', 'docName': 'b', 'text': 'x' * 801}]})['statusCode'] == 400
    assert call('/chat', {**ok, 'history': [{'role': 'system', 'text': 'x'}]})['statusCode'] == 400
    assert call('/chat', {**ok, 'history': [{'role': 'user', 'text': 'x'}] * 7})['statusCode'] == 400
    assert call('/chat', {**ok, 'variables': [{'id': 'a', 'label': 'b'}] * 31})['statusCode'] == 400


def test_chat_model_failure_no_leak(monkeypatch):
    def fail(system, data):
        raise RuntimeError('secret ABC123')
    monkeypatch.setattr(h, 'model_json', fail)
    res = call('/chat', {'question': 'q', 'snippets': SNIPPETS})
    assert res['statusCode'] == 502 and 'ABC123' not in res['body']
    assert json.loads(res['body']) == {'error': 'Chat service unavailable'}


def test_chat_options():
    assert call('/chat', method='OPTIONS')['statusCode'] == 204


V2 = {'version': 2, 'purpose': 'show values below 10', 'catalog': list(h.MODULE_TYPES), 'variables': [
    {'id': 'a', 'label': 'A', 'type': 'num'}, {'id': 'b', 'label': 'B', 'type': 'num'},
    {'id': 'c', 'label': 'C', 'type': 'cat'}]}


def test_design_v2_sanitizes(monkeypatch):
    mods = [
        {'id': 'm1', 'type': 'distribution', 'variable': 'a', 'title': 'T', 'caption': 'C'},
        {'id': 'm2', 'type': 'distribution', 'variable': 'c'},
        {'id': 'm3', 'type': 'scatter', 'x': 'a', 'y': 'zzz'},
        {'id': 'm4', 'type': 'bogus'},
        {'id': 'm5', 'type': 'answer_filter', 'variable': 'a', 'op': 'between', 'bounds': [5, 1]},
        {'id': 'm6', 'type': 'answer_filter', 'variable': 'b', 'op': '<', 'bounds': [10]},
        {'id': 'm7', 'type': 'key_papers', 'limit': 21},
        {'id': 'm8', 'type': 'key_papers', 'limit': 5, 'title': 'x' * 300},
        {'id': 'm9', 'type': 'coverage_matrix', 'variables': ['a', 'c']},
    ]
    monkeypatch.setattr(h, 'model_json', lambda s, d: {'modules': mods})
    res = call('/design', V2)
    out = json.loads(res['body'])['modules']
    assert res['statusCode'] == 200
    assert [m['id'] for m in out] == ['m1', 'm6', 'm8', 'm9']
    assert all(m['origin'] == 'ai' for m in out) and len(out[2]['title']) == 160


def test_design_v2_caps_8(monkeypatch):
    monkeypatch.setattr(h, 'model_json',
                        lambda s, d: {'modules': [{'id': f'm{i}', 'type': 'doc_summaries'} for i in range(12)]})
    assert len(json.loads(call('/design', V2)['body'])['modules']) == 8


def test_design_v2_new_forms_and_layout(monkeypatch):
    mods = [
        {'id': 'k', 'type': 'key_figures', 'variables': ['a', 'b', 'a'], 'section': 'highlights'},
        {'id': 'k2', 'type': 'key_figures', 'variables': ['c']},
        {'id': 'cb', 'type': 'category_bars', 'variable': 'c', 'span': 'half', 'section': 'footer'},
        {'id': 'cb2', 'type': 'category_bars', 'variable': 'a'},
        {'id': 'gr', 'type': 'group_ranges', 'variable': 'a', 'by': 'c'},
        {'id': 'gr2', 'type': 'group_ranges', 'variable': 'a'},
        {'id': 'gr3', 'type': 'group_ranges', 'variable': 'a', 'by': 'b'},
        {'id': 'bx', 'type': 'box_summary', 'variables': ['a', 'c']},
        {'id': 'ct', 'type': 'cross_tab', 'row': 'c', 'column': 'a'},
        {'id': 'ct2', 'type': 'cross_tab', 'row': 'c', 'column': 'c'},
        {'id': 'cp', 'type': 'completeness', 'variables': ['a', 'c'], 'span': 'wide'},
        {'id': 'rt', 'type': 'records_table', 'sort': 'a', 'order': 'desc', 'columns': ['b', 'c'], 'limit': 5},
        {'id': 'rt2', 'type': 'records_table', 'sort': 'c', 'order': 'desc', 'limit': 5},
        {'id': 'rt3', 'type': 'records_table', 'sort': 'a', 'order': 'down', 'limit': 5},
    ]
    monkeypatch.setattr(h, 'model_json', lambda s, d: {
        'modules': mods, 'sections': ['coverage', 'ads', 'case', 'coverage', 7, 'patterns']})
    body = json.loads(call('/design', {**V2, 'catalog': list(h.MODULE_TYPES)})['body'])
    out = {m['id']: m for m in body['modules']}
    assert list(out) == ['k', 'cb', 'gr', 'gr2', 'ct', 'cp', 'rt']
    assert out['k']['variables'] == ['a', 'b'] and out['k']['section'] == 'highlights'
    assert out['cb']['span'] == 'half' and 'section' not in out['cb']
    assert out['gr']['by'] == 'c' and 'by' not in out['gr2']
    assert 'span' not in out['cp']
    assert out['rt']['columns'] == ['b', 'c'] and out['rt']['order'] == 'desc'
    assert body['sections'] == ['coverage', 'case', 'patterns']


def test_design_v2_old_catalog_keeps_old_types(monkeypatch):
    old = ['answer_stat', 'answer_filter', 'distribution', 'scatter', 'coverage_matrix',
           'key_papers', 'doc_summaries', 'variable_scores']
    monkeypatch.setattr(h, 'model_json', lambda s, d: {'modules': [
        {'id': 'k', 'type': 'key_figures', 'variables': ['a']}, {'id': 'd', 'type': 'distribution', 'variable': 'a'}]})
    body = json.loads(call('/design', {**V2, 'catalog': old})['body'])
    assert [m['id'] for m in body['modules']] == ['d'] and body['sections'] == []


def test_design_v2_invalid_400():
    assert call('/design', {**V2, 'catalog': 'x'})['statusCode'] == 400


def test_design_v1_unchanged(monkeypatch):
    monkeypatch.setattr(h, 'model_json', lambda s, d: {'title': 'T', 'sectionOrder': ['map']})
    res = call('/design', {'instruction': 'x', 'variables': []})
    assert res['statusCode'] == 200 and 'sectionOrder' in json.loads(res['body'])
