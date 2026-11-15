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
    def __init__(self):
        self.parent = {'revision': 1, 'status': 'ready_to_publish', 'counts': {'conflicts_open': 0}}
        self.race = False
    def update_item(self, **kw):
        v = kw['ExpressionAttributeValues']
        if self.race or v[':revision'] != self.parent['revision']:
            raise ClientError({'Error': {'Code': 'ConditionalCheckFailedException'}}, 'UpdateItem')
        if ':files' in v:
            self.parent.update(pack_version=v[':pack'], lens_version=v[':lens'], published_files=v[':files'],
                published_signature=v[':signature'], status='published')
        else:
            self.parent.update(review_key=v[':key'], review_sha256=v[':hash'], review_schema=v[':schema'], status='ready_to_publish')
        self.parent['revision'] += 1


class Schemas:
    def __init__(self, approval, docs, extraction):
        self.approval, self.docs = approval, docs
        self.table, self.s3, self.bucket = Table(), Storage(), 'fixture-bucket'
        self.projects = self
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
