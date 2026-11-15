import json
import pytest
from api import handler as h


def call(path, data=None, raw_body=None, method='POST', **extra):
    body = raw_body if raw_body is not None else json.dumps(data)
    return h.handler({
        'rawPath': path,
        'requestContext': {'http': {'method': method}},
        'headers': {'content-type': 'application/json'},
        'body': body,
        **extra,
    })


# --- POST /propose Tests ---

def test_propose_happy_path_with_verified_quotes(monkeypatch):
    doc_payload = {
        'documents': [
            {
                'id': 'paper_1',
                'name': 'PMMA Microgravity Combustion.pdf',
                'kind': 'paper',
                'pages': [
                    {'page': 1, 'text': 'We measured flame spread rate at 2.5 mm/s under 21% O2.'},
                    {'page': 2, 'text': 'The extinction limit occurred at 16.5% oxygen concentration.'},
                ],
            },
            {
                'id': 'table_1',
                'name': 'sample_runs.csv',
                'kind': 'table',
                'headers': ['Run_ID', 'Pressure_kPa', 'O2_Pct'],
                'sample': [
                    ['R1', '101.3', '21.0'],
                    ['R2', '50.6', '30.0'],
                ],
            },
        ]
    }

    def mock_model(system, user):
        # Return proposed variables: some verified, some hallucinated
        return {
            'proposals': [
                {
                    'id': 'flame_spread_rate',
                    'label': 'Flame Spread Rate',
                    'type': 'numeric',
                    'unit': 'mm/s',
                    'docId': 'paper_1',
                    'page': 1,
                    'quote': 'flame spread rate at 2.5 mm/s',
                },
                {
                    'id': 'extinction_limit',
                    'label': 'Extinction Limit',
                    'type': 'numeric',
                    'unit': '%',
                    'docId': 'paper_1',
                    'page': 2,
                    'quote': 'extinction limit occurred at 16.5% oxygen concentration',
                },
                {
                    'id': 'pressure',
                    'label': 'Pressure',
                    'type': 'numeric',
                    'unit': 'kPa',
                    'docId': 'table_1',
                    'row': 1,
                    'quote': '101.3',
                },
                # Hallucinated quote not in the document!
                {
                    'id': 'toxic_cyanide',
                    'label': 'Cyanide Level',
                    'type': 'numeric',
                    'unit': 'ppm',
                    'docId': 'paper_1',
                    'page': 1,
                    'quote': 'cyanide concentration reached 500 ppm lethal limit',
                },
                # Unknown docId
                {
                    'id': 'solar_flux',
                    'label': 'Solar Flux',
                    'type': 'numeric',
                    'unit': 'W/m2',
                    'docId': 'non_existent_doc',
                    'page': 1,
                    'quote': 'flux',
                },
                # Empty quote
                {
                    'id': 'empty_quote_var',
                    'label': 'Empty Quote Var',
                    'type': 'numeric',
                    'unit': None,
                    'docId': 'paper_1',
                    'page': 1,
                    'quote': '',
                },
            ]
        }

    monkeypatch.setattr(h, 'model_json', mock_model)
    res = call('/propose', doc_payload)
    assert res['statusCode'] == 200
    body = json.loads(res['body'])
    assert 'proposals' in body
    proposals = body['proposals']

    ids = [p['id'] for p in proposals]
    assert 'flame_spread_rate' in ids
    assert 'extinction_limit' in ids
    assert 'pressure' in ids
    assert 'toxic_cyanide' not in ids
    assert 'solar_flux' not in ids
    assert 'empty_quote_var' not in ids
    assert len(proposals) == 3


def test_propose_rejects_unverified_table_evidence(monkeypatch):
    doc_payload = {
        'documents': [
            {
                'id': 't1',
                'name': 'data.csv',
                'kind': 'table',
                'headers': ['Sample', 'Temperature_C'],
                'sample': [['S1', '350']],
            }
        ]
    }

    def mock_model(system, user):
        return {
            'proposals': [
                {
                    'id': 'temp',
                    'label': 'Temperature',
                    'type': 'numeric',
                    'unit': 'C',
                    'docId': 't1',
                    'quote': 'Temperature_C',
                },
                {
                    'id': 'invented_humidity',
                    'label': 'Humidity',
                    'type': 'numeric',
                    'unit': '%',
                    'docId': 't1',
                    'quote': 'Relative_Humidity_Pct',
                },
            ]
        }

    monkeypatch.setattr(h, 'model_json', mock_model)
    res = call('/propose', doc_payload)
    assert res['statusCode'] == 200
    body = json.loads(res['body'])
    proposals = body['proposals']
    assert len(proposals) == 1
    assert proposals[0]['id'] == 'temp'


def test_propose_rejects_quote_misattributed_to_wrong_page(monkeypatch):
    doc_payload = {
        'documents': [
            {
                'id': 'p1',
                'name': 'paper.pdf',
                'kind': 'paper',
                'pages': [
                    {'page': 1, 'text': 'Introductory text without any numbers.'},
                    {'page': 2, 'text': 'Burn velocity reached 4.2 mm/s in pure oxygen.'},
                ],
            }
        ]
    }

    def mock_model(system, user):
        return {
            'proposals': [
                # The text is genuinely on page 2, but the model falsely claims it is on page 1
                {
                    'id': 'burn_velocity_wrong_page',
                    'label': 'Burn Velocity',
                    'type': 'numeric',
                    'unit': 'mm/s',
                    'docId': 'p1',
                    'page': 1,
                    'quote': 'Burn velocity reached 4.2 mm/s',
                },
                # When claiming page 99 which does not exist in pages
                {
                    'id': 'burn_velocity_nonexistent_page',
                    'label': 'Burn Velocity 99',
                    'type': 'numeric',
                    'unit': 'mm/s',
                    'docId': 'p1',
                    'page': 99,
                    'quote': 'Burn velocity reached 4.2 mm/s',
                },
                # Correctly citing page 2: must be accepted!
                {
                    'id': 'burn_velocity_correct_page',
                    'label': 'Burn Velocity OK',
                    'type': 'numeric',
                    'unit': 'mm/s',
                    'docId': 'p1',
                    'page': 2,
                    'quote': 'Burn velocity reached 4.2 mm/s',
                },
            ]
        }

    monkeypatch.setattr(h, 'model_json', mock_model)
    res = call('/propose', doc_payload)
    assert res['statusCode'] == 200
    body = json.loads(res['body'])
    proposals = body['proposals']
    ids = [p['id'] for p in proposals]
    assert 'burn_velocity_wrong_page' not in ids
    assert 'burn_velocity_nonexistent_page' not in ids
    assert 'burn_velocity_correct_page' in ids
    assert len(proposals) == 1


def test_propose_oversized_payload_returns_400():
    large_text = 'A' * 135000
    res = call('/propose', raw_body=json.dumps({'documents': [{'id': 'd1', 'kind': 'paper', 'text': large_text}]}))
    assert res['statusCode'] == 400


def test_propose_invalid_payload_shape_returns_400():
    assert call('/propose', {'not_documents': 123})['statusCode'] == 400
    assert call('/propose', {'documents': 'not a list'})['statusCode'] == 400
    assert call('/propose', {'documents': [{'invalid': True}]})['statusCode'] == 400


def test_propose_model_failure_does_not_leak_internals(monkeypatch):
    def fail(system, user):
        raise RuntimeError('Bedrock Auth failed with AWS_SECRET_KEY=ABC12345XYZ')

    monkeypatch.setattr(h, 'model_json', fail)
    res = call('/propose', {'documents': [{'id': 'd1', 'name': 'test.csv', 'kind': 'table', 'headers': ['a']}]})
    assert res['statusCode'] == 502
    assert 'ABC12345XYZ' not in res['body']
    assert 'Bedrock Auth failed' not in res['body']


# --- POST /design Tests ---

def test_design_happy_path_and_filters_invalid_variable_ids(monkeypatch):
    design_payload = {
        'instruction': 'Prioritize flammability limits and show gap analysis first.',
        'variables': [
            {'id': 'o2_conc', 'label': 'Oxygen Concentration', 'type': 'numeric', 'unit': '%'},
            {'id': 'pressure', 'label': 'Ambient Pressure', 'type': 'numeric', 'unit': 'kPa'},
            {'id': 'material', 'label': 'Material Sample', 'type': 'categorical', 'unit': None},
        ],
        'stats': {'docCount': 2, 'varCount': 3},
    }

    def mock_model(system, user):
        return {
            'title': 'Lunar Habitat Flammability Evaluation',
            'kicker': 'SAFETY ASSESSMENT',
            'density': 'compact',
            'variablesLayout': 'grid',
            'sectionOrder': ['gaps', 'heat', 'graph', 'map', 'data_methods', 'graphical_abstract', 'fake_section'],
            # Model hallucinated 'invented_var' and 'unknown_toxic'
            'highlightedVariables': ['o2_conc', 'invented_var', 'pressure'],
            'variableGroups': [
                {'id': 'grp_env', 'label': 'Environmental Factors', 'variables': ['o2_conc', 'pressure', 'fake_var_1']},
                {'id': 'grp_mat', 'label': 'Materials', 'variables': ['material', 'fake_var_2']},
            ],
            # Model put material (categorical) and fake_axis into defaultAxes
            'defaultAxes': ['o2_conc', 'material', 'fake_axis', 'pressure'],
            'hideMlCard': True,
            'rationale': 'Prioritizing gaps due to sparse oxygen measurements at low pressure.',
        }

    monkeypatch.setattr(h, 'model_json', mock_model)
    res = call('/design', design_payload)
    assert res['statusCode'] == 200
    bp = json.loads(res['body'])

    assert bp['title'] == 'Lunar Habitat Flammability Evaluation'
    assert bp['density'] == 'compact'
    assert bp['variablesLayout'] == 'grid'
    assert bp['hideMlCard'] is True
    assert 'sparse oxygen measurements' in bp['rationale']

    # Fake section must be filtered out
    assert 'fake_section' not in bp['sectionOrder']
    assert bp['sectionOrder'][0] == 'gaps'

    # Hallucinated variable IDs stripped from highlightedVariables
    assert bp['highlightedVariables'] == ['o2_conc', 'pressure']

    # Hallucinated variable IDs stripped from variableGroups
    assert bp['variableGroups'][0]['variables'] == ['o2_conc', 'pressure']
    assert bp['variableGroups'][1]['variables'] == ['material']

    # defaultAxes must ONLY contain numeric variables from submitted list and at most 2 IDs!
    # 'material' is categorical -> stripped. 'fake_axis' -> stripped.
    # Allowed numeric vars were: 'o2_conc', 'pressure'
    assert bp['defaultAxes'] == ['o2_conc', 'pressure']
    assert len(bp['defaultAxes']) <= 2


def test_design_enforces_numeric_type_and_0_to_2_ids_for_default_axes(monkeypatch):
    design_payload = {
        'instruction': 'Default dashboard',
        'variables': [
            {'id': 'flow', 'label': 'Flow Velocity', 'type': 'numeric', 'unit': 'cm/s'},
            {'id': 'cat_var', 'label': 'Sample Type', 'type': 'categorical', 'unit': None},
        ],
    }

    def mock_model(system, user):
        return {
            'title': 'Test Dashboard',
            'sectionOrder': ['map', 'graph'],
            'highlightedVariables': ['flow'],
            'variableGroups': [],
            # cat_var is categorical, should be stripped; flow is numeric
            'defaultAxes': ['cat_var', 'flow'],
        }

    monkeypatch.setattr(h, 'model_json', mock_model)
    res = call('/design', design_payload)
    assert res['statusCode'] == 200
    bp = json.loads(res['body'])
    assert bp['defaultAxes'] == ['flow']


def test_design_oversized_payload_returns_400():
    large_instruction = 'X' * 135000
    res = call('/design', raw_body=json.dumps({'instruction': large_instruction, 'variables': []}))
    assert res['statusCode'] == 400


def test_design_invalid_payload_returns_400():
    assert call('/design', {'instruction': 123})['statusCode'] == 400
    assert call('/design', {'instruction': 'hello', 'variables': 'not a list'})['statusCode'] == 400


def test_design_model_failure_does_not_leak_internals(monkeypatch):
    def fail(system, user):
        raise RuntimeError('Internal Bedrock Exception with API_KEY_SECRET')

    monkeypatch.setattr(h, 'model_json', fail)
    res = call('/design', {'instruction': 'test', 'variables': []})
    assert res['statusCode'] == 502
    assert 'API_KEY_SECRET' not in res['body']


def test_routes_options_and_methods():
    for route in ('/propose', '/design'):
        opts = call(route, method='OPTIONS')
        assert opts['statusCode'] == 204
        get_res = call(route, method='GET')
        assert get_res['statusCode'] == 405


def test_propose_accepts_batch_of_30_and_rejects_31():
    doc = lambda i: {'id': f'd{i}', 'name': f't{i}.csv', 'kind': 'table', 'headers': ['a']}
    h.validate_propose_request({'documents': [doc(i) for i in range(30)]})
    with pytest.raises(ValueError):
        h.validate_propose_request({'documents': [doc(i) for i in range(31)]})


def test_purpose_modules_are_declarative_and_invalid_modules_are_discarded():
    variables = [{'id': 'o2', 'type': 'numeric'}, {'id': 'p', 'type': 'numeric'}]
    valid = {'id': 'case', 'type': 'scenario_input', 'title': 'Describe your case',
             'description': 'User inputs only.', 'variables': ['o2', 'p']}
    invalid = [dict(valid, id='script', type='script'),
               dict(valid, id='unknown', variables=['missing']),
               dict(valid, id='execute', code='alert(1)'),
               dict(valid)]
    result = h.sanitize_design_blueprint({'purpose': 'untrusted rewrite', 'modules': [valid, *invalid]},
                                         variables, 'Compare documented conditions')
    assert result['purpose'] == 'Compare documented conditions'
    assert result['modules'] == [valid]
    assert len(result['discardedModules']) == len(invalid)
    assert result['sectionOrder']


def test_malformed_modules_preserve_the_base_blueprint():
    result = h.sanitize_design_blueprint({'modules': 'not-an-array'}, [])
    assert result['modules'] == []
    assert result['discardedModules']
    assert result['sectionOrder']


def test_private_preflight_keeps_localhost_authorization_headers(monkeypatch):
    monkeypatch.setenv('CF_URL', 'https://example.com')
    monkeypatch.setenv('EXTRA_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173')
    for origin in ('http://localhost:5173', 'http://127.0.0.1:5173'):
        event = {'rawPath': '/projects', 'requestContext': {'http': {'method': 'OPTIONS'}}, 'headers': {'origin': origin}}
        response = h.handler(event)
        assert response['statusCode'] == 204
        assert response['headers']['access-control-allow-origin'] == origin
        assert 'authorization' in response['headers']['access-control-allow-headers']
        assert 'GET' in response['headers']['access-control-allow-methods']
