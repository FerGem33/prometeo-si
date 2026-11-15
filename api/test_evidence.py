"""Essential publication/review invariants; storage doubles and explicit synthetic source."""
import copy
import json

from botocore.exceptions import ClientError
import pytest

from api.evidence import Evidence, publisher, review
from api.projects import ApiError


class Storage:
    def __init__(self): self.data = {}
    def put_object(self, **kw): self.data[kw['Key']] = json.loads(kw['Body'])
    def generate_presigned_url(self, operation, **kw):
        assert operation == 'get_object' and kw['ExpiresIn'] == 300
        return 'signed:'+kw['Params']['Key']


class Table:
    name = 'fixture-table'
    def __init__(self):
        self.parent = {'PK': 'U#owner', 'SK': 'P#project', 'revision': 1, 'status': 'ready_to_publish', 'counts': {'conflicts_open': 0},
                       'id': 'project', 'name': 'Fixture', 'intent': 'Fixture intent', 'pack_version': None,
                       'lens_version': None, 'created_at': '2026-01-01T00:00:00Z', 'updated_at': '2026-01-01T00:00:00Z'}
        self.items = {}
        self.race = False
    def get_item(self, **kw):
        item = self.items.get(tuple(kw['Key'].values()))
        return {'Item': copy.deepcopy(item)} if item else {}
    def put_item(self, **kw):
        item = kw['Item']; key = (item['PK'], item['SK'])
        if self.race: raise ClientError({'Error': {'Code': 'ConditionalCheckFailedException'}}, 'PutItem')
        if item['PK'].startswith('U#'): self.parent = copy.deepcopy(item)
        else: self.items[key] = copy.deepcopy(item)
    def delete_item(self, **kw): self.items.pop(tuple(kw['Key'].values()), None)
    def query(self, **kw): return {'Items': list(self.items.values())}
    def update_item(self, **kw):
        v = kw['ExpressionAttributeValues']
        if self.race or v[':revision'] != self.parent['revision']:
            raise ClientError({'Error': {'Code': 'ConditionalCheckFailedException'}}, 'UpdateItem')
        if ':files' in v:
            self.parent.update(pack_version=v[':pack'], lens_version=v[':lens'], published_files=v[':files'],
                published_signature=v[':signature'], published_base_signature=v[':base'], status='published')
        elif ':hash' in v and ':schema' not in v:
            self.parent.update(lens_override_key=v[':key'], lens_request_sha256=v[':hash'], status='ready_to_publish')
        else:
            self.parent.update(review_key=v[':key'], review_sha256=v[':hash'], review_schema=v[':schema'], status='ready_to_publish')
        self.parent['revision'] += 1


class Schemas:
    def __init__(self, approval, docs, extraction):
        self.approval, self.docs = approval, docs
        self.table, self.s3, self.bucket = Table(), Storage(), 'fixture-bucket'
        self.projects = self
        self.tx = Transactions(self.table)
        key = 'u/owner/p/project/text/extractions/v'+str(approval['schema']['version'])+'-'+approval['schema_sha256']+'.json'
        self.table.parent['extraction_key'] = key
        self.s3.data[key] = extraction
    def get(self, uid, pid):
        if uid != 'owner' or pid != 'project': raise ApiError(404, 'not_found', 'Not found')
        return copy.deepcopy(self.table.parent)
    def current(self, uid, pid):
        self.get(uid, pid)
        return copy.deepcopy(self.approval), copy.deepcopy(self.docs)
    def load(self, key): return copy.deepcopy(self.s3.data[key])
    def optional(self, key): return copy.deepcopy(self.s3.data.get(key))


class Transactions:
    def __init__(self, table): self.table = table
    def transact_write_items(self, **kw):
        from boto3.dynamodb.types import TypeDeserializer
        decode = TypeDeserializer().deserialize
        update, operation = kw['TransactItems']
        values = {k: decode(v) for k, v in update['Update']['ExpressionAttributeValues'].items()}
        if self.table.race or values[':revision'] != self.table.parent['revision']:
            raise ClientError({'Error': {'Code': 'TransactionCanceledException'}}, 'TransactWriteItems')
        name, data = next(iter(operation.items())); data = copy.deepcopy(data)
        data.pop('TableName')
        for key in ('Key', 'Item', 'ExpressionAttributeValues'):
            if key in data: data[key] = {k: decode(v) for k, v in data[key].items()}
        getattr(self.table, 'put_item' if name == 'Put' else 'delete_item')(**data)
        self.table.parent['revision'] += 1


@pytest.fixture
def evidence(tmp_path):
    path = tmp_path/'fixture.csv'
    path.write_text('value\n1\n2\n')
    doc = review.ingest.parse_document(path)
    did = doc['id']; docs = {did: doc}
    schema = {'version': 1, 'status': 'proposed', 'variables': [
        {'id': 'value', 'label': 'Fixture value', 'type': 'num', 'unit': 'm', 'sigma': 1, 'status': 'approved'}],
        'columns': [{'doc_id': did, 'column': 'value', 'variable': 'value', 'unit': 'm', 'convert': None, 'status': 'approved'}], 'constants': []}
    approval = review.approve(review.review_request(schema, docs), schema, docs, 1, 'owner')
    extraction = review.extract_tables(approval, docs)
    meta = {'id': 'fixture', 'documents': {did: {'sha256': doc['sha256'], 'study': 'fixture-study', 'title': 'Fixture',
        'doi': '10.1234/fixture', 'kind': 'test', 'kind_note': 'Synthetic test only',
        'kind_evidence': extraction['records'][0]['citations']['value']}},
        'thresholds': {'grade_a': 1, 'tolerance': 0.25, 'closeness_reach': 3},
        'lens': {'title': 'Fixture', 'default_axes': ['value'], 'evidence': {'min_studies': 2}, 'presets': [
            {'id': 'observed', 'label': 'Observed fixture', 'blurb': '', 'values': {'value': 1}, 'active': ['value'], 'source': extraction['records'][0]['id']}]}}
    approval['corpus_metadata'] = publisher.approve_metadata(meta, docs, 'owner', approval['schema']['approved_at'], 'Unit-test fixture')
    return Evidence(Schemas(approval, docs, extraction))


def test_corrected_versions_preserve_original_and_previously_published_bytes(evidence):
    first = evidence.publish('owner', 'project', {})
    saved = copy.deepcopy(evidence.s3.data)
    assert evidence.publish('owner', 'project', {}) == first
    row = evidence.list_records('owner', 'project', {})['items'][1]
    changed = evidence.change('owner', 'project', row['id'], {'variable': 'value', 'value': [3, 3], 'reason': 'Fixture correction'})
    assert changed['corrections']['value']['from'] == [2, 2]
    assert changed['original_citations']['value']['text'] == '2'
    second = evidence.publish('owner', 'project', {})
    assert second['pack_version'] == 2
    assert all(evidence.s3.data[k] == v for k, v in saved.items())
    pack = evidence.schemas.load(evidence.table.parent['published_files']['pack'])
    assert pack['records'][1]['values']['value'] == [3, 3]
    assert pack['records'][1]['orig']['value']['text'] == '2'


def test_exclusion_filters_records_and_synthesis_quotes_original_sources(evidence, monkeypatch):
    monkeypatch.setattr('api.handler.model_json', lambda *a: (_ for _ in ()).throw(RuntimeError('explicit offline double')))
    rows = evidence.list_records('owner', 'project', {})['items']
    evidence.change('owner', 'project', rows[1]['id'], {'reason': 'Fixture exclusion'}, exclude=True)
    assert len(evidence.list_records('owner', 'project', {})['items']) == 1
    evidence.publish('owner', 'project', {})
    result = evidence.synthesis('owner', 'project', {'study_ids': ['fixture-study']})
    assert result['mode'] == 'template' and result['sentences'][0]['text'] == 'value: 1'
    assert result['sentences'][0]['citations'][0]['text'] == '1'


def test_ownership_and_concurrent_publication_are_enforced(evidence):
    with pytest.raises(ApiError) as exc: evidence.publish('intruder', 'project', {})
    assert exc.value.status == 404 and not evidence.table.parent.get('published_files')
    evidence.table.race = True
    with pytest.raises(ApiError) as exc: evidence.publish('owner', 'project', {})
    assert exc.value.status == 409 and not evidence.table.parent.get('published_files')


def test_proposals_preserve_versions_validate_scenarios_and_isolate_owners(evidence):
    evidence.publish('owner', 'project', {})
    data = {'name': 'Fixture proposal', 'scenario': {'values': {'value': 1}, 'active': ['value']}}
    saved = evidence.proposals('owner', 'project', 'variant', data)
    assert saved == evidence.proposals('owner', 'project', 'variant', data)
    assert saved['pack_version'] == 1 and saved['lens_version'] == 1
    assert evidence.proposals('owner', 'project')['items'] == [saved]
    evidence.table.race = True
    with pytest.raises(ApiError) as exc: evidence.proposals('owner', 'project', 'variant', {**data, 'name': 'Concurrent change'})
    assert exc.value.status == 409
    evidence.table.race = False
    assert evidence.proposals('owner', 'project', 'variant') == saved
    with pytest.raises(ApiError): evidence.proposals('owner', 'project', 'invalid', {**data, 'scenario': {'values': {'value': 999}, 'active': ['value']}})
    with pytest.raises(ApiError) as exc: evidence.proposals('intruder', 'project', 'variant')
    assert exc.value.status == 404
    evidence.proposals('owner', 'project', 'variant', delete=True)
    assert evidence.proposals('owner', 'project')['items'] == []


def test_intent_regenerates_only_lens_and_publish_replay_is_idempotent(evidence):
    first = evidence.publish('owner', 'project', {})
    original = evidence.schemas.load(evidence.table.parent['published_files']['pack'])
    changed = evidence.patch_project('owner', 'project', {'intent': 'Compare Fixture value'})
    assert changed['pack_version'] == first['pack_version'] and changed['lens_version'] == 2
    assert evidence.schemas.load(evidence.table.parent['published_files']['pack']) == original
    assert evidence.schemas.load(evidence.table.parent['published_files']['lens'])['title'] == 'Compare Fixture value'
    replay = evidence.publish('owner', 'project', {})
    assert replay['pack_version'] == 1 and replay['lens_version'] == 2


def test_project_inference_uses_published_schema_and_rejects_forged_facts(evidence, monkeypatch):
    evidence.publish('owner', 'project', {})
    captured = []
    def model(system, data):
        captured.append(data)
        return {'conditions': [{'variable': 'value', 'value': 1, 'unit': 'm'}]}
    monkeypatch.setattr('api.handler.model_json', model)
    assert evidence.inference('owner', 'project', 'ask', {'question': 'Fixture value 1 m', 'version': 2})['values'] == {'value': 1}
    assert captured[0]['schema']['variables'][0]['id'] == 'value'
    with pytest.raises(ApiError):
        evidence.inference('owner', 'project', 'analysis', {'scenario': {'values': {'value': 1}, 'active': ['value']},
            'levels': [], 'findings': [{'id': 'never_measured:value', 'code': 'never_measured', 'variable': 'value', 'params': {'n': 2}, 'sources': ['fixture-study']}]})


def test_synthesis_validates_ids_and_reuses_successful_selection(evidence, monkeypatch):
    evidence.publish('owner', 'project', {})
    calls = []
    def model(*args): calls.append(args); return {'selected': ['excerpt_0']}
    monkeypatch.setattr('api.handler.model_json', model)
    result = evidence.synthesis('owner', 'project', {'study_ids': ['fixture-study']})
    assert result['mode'] == 'ai' and result['sentences'][0]['text'] == 'value: 1'
    assert evidence.synthesis('owner', 'project', {'study_ids': ['fixture-study']}) == result and len(calls) == 1
    monkeypatch.setattr('api.handler.model_json', lambda *args: {'selected': ['unknown']})
    result = evidence.synthesis('owner', 'project', {'study_ids': ['fixture-study'], 'focus': 'value'})
    assert result['mode'] == 'template' and result['fallback_reason'] == 'invalid_model_selection'


def test_reviewed_lens_can_update_sourced_preset_after_correction_without_changing_original(evidence):
    evidence.publish('owner', 'project', {})
    row = evidence.list_records('owner', 'project', {})['items'][0]
    evidence.change('owner', 'project', row['id'], {'variable': 'value', 'value': [3, 3], 'reason': 'Synthetic fixture correction'})
    with pytest.raises(ApiError): evidence.publish('owner', 'project', {})
    current = evidence.lens('owner', 'project')
    changed = copy.deepcopy(current['lens']); changed['presets'][0]['values']['value'] = 3
    evidence.lens('owner', 'project', {'version': current['lens_version'], 'lens': changed, 'reason': 'Fixture preset now follows reviewed correction'})
    evidence.publish('owner', 'project', {})
    pack = evidence.schemas.load(evidence.table.parent['published_files']['pack'])
    assert pack['records'][0]['values']['value'] == [3, 3]
    assert pack['records'][0]['original_citations']['value']['text'] == '1'
    assert evidence.schemas.load(evidence.table.parent['published_files']['lens'])['presets'][0]['values']['value'] == 3


def with_paper(evidence):
    docs = copy.deepcopy(evidence.schemas.docs)
    did = 'doc_'+'e'*32
    docs[did] = {'id': did, 'kind': 'paper', 'status': 'done', 'name': 'fixture.pdf', 'sha256': 'e'*64,
                 'pages': [{'page': 1, 'text': 'The fixture reports a value of 1 m. Further measurements are needed.'}]}
    schema = evidence.schemas.approval['schema']
    approval = review.approve(review.review_request(schema, docs), schema, docs, schema['version'], 'owner')
    meta = {k: copy.deepcopy(evidence.schemas.approval['corpus_metadata'][k]) for k in ('id', 'documents', 'lens', 'thresholds')}
    meta['documents'][did] = {'sha256': docs[did]['sha256'], 'study': 'fixture-paper', 'title': 'Fixture paper', 'doi': '10.1234/fixture-paper',
        'kind': 'campaign', 'kind_note': 'Context only', 'kind_evidence': {'kind': 'paper', 'doc_id': did, 'page': 1, 'quote': 'The fixture reports a value of 1 m.'}}
    approval['corpus_metadata'] = publisher.approve_metadata(meta, docs, 'owner', approval['schema']['approved_at'], 'Fixture only')
    return Evidence(Schemas(approval, docs, review.extract_tables(approval, docs))), did


def test_pdf_review_and_claims_never_propagate_measurements_to_tables(evidence):
    evidence, did = with_paper(evidence)
    with pytest.raises(ApiError, match='') as exc: evidence.publish('owner', 'project', {})
    assert exc.value.status == 409
    candidate = {'variable': 'value', 'value': [1, 1], 'unit': 'm', 'scope': 'Synthetic fixture context',
        'citation': {'kind': 'paper', 'doc_id': did, 'page': 1, 'quote': 'The fixture reports a value of 1 m.'}}
    with pytest.raises(ApiError):
        evidence.papers('owner', 'project', {'candidate': {**candidate, 'citation': {**candidate['citation'], 'quote': 'False quote'}}, 'reason': 'Fixture'})
    item = evidence.papers('owner', 'project', {'candidate': candidate, 'reason': 'Manual fixture evidence'})
    with pytest.raises(ApiError): evidence.papers('owner', 'project', {'status': 'contextual', 'reason': 'Missing attestation'}, item['id'])
    evidence.papers('owner', 'project', {'status': 'contextual', 'reason': 'Fixture semantic review', 'scope': 'Fixture only', 'supports_value': True}, item['id'])
    # Explicitly exclude the pending automated extraction; manual evidence is also excluded
    # until that exclusion is removed. For this fixture supply a completed empty model artifact.
    from api.paper_worker import artifact_key
    approval = evidence.schemas.approval
    raw = {'schema_sha256': approval['schema_sha256'], 'source_sha256': 'e'*64, 'doc_id': did, 'candidates': [], 'rejected': []}
    raw['artifact_sha256'] = review.digest(raw)
    evidence.s3.data[artifact_key('owner', 'project', did, approval)] = raw
    claim = {'id': 'fixture-gap', 'kind': 'gap', 'variables': ['value'], 'statement': 'Further measurements are needed.',
        'study': 'fixture-paper', 'citation': {'kind': 'paper', 'doc_id': did, 'page': 1, 'quote': 'Further measurements are needed.'}}
    evidence.claims('owner', 'project', {'claim': claim, 'reason': 'Fixture author statement reviewed'})
    evidence.publish('owner', 'project', {})
    pack = evidence.schemas.load(evidence.table.parent['published_files']['pack'])
    assert len(pack['records']) == 2 and all(r['source']['id'] != did for r in pack['records'])
    assert len(pack['contextual_evidence']) == 1 and pack['contextual_evidence'][0]['scope'] == 'Fixture only'
    assert pack['contextual_evidence'][0]['proposed_scope'] == 'Synthetic fixture context'
    assert pack['claims'][0]['statement'] == claim['statement']
    evidence.claims('owner', 'project', {'reason': 'Fixture withdrawal'}, claim['id'])
    assert evidence.claims('owner', 'project')['items'] == []
