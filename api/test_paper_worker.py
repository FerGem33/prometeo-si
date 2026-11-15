"""PDF queue/cache invariants using explicit synthetic source and SDK doubles."""
import copy
import io
import json

import pytest

from api import paper_worker
from api.schema_review import Schemas, review

UID, PID, DID = 'owner', 'prj_'+'b'*32, 'doc_'+'c'*32


class Storage:
    def __init__(self): self.data = {}
    def list_objects_v2(self, **kw):
        return {'Contents': [{'Key': k} for k in sorted(self.data) if k.startswith(kw['Prefix'])][:kw.get('MaxKeys', 1000)]}
    def get_object(self, **kw): return {'Body': io.BytesIO(self.data[kw['Key']])}
    def put_object(self, **kw): self.data[kw['Key']] = kw['Body']


class Table:
    def __init__(self, version): self.parent = {'status': 'processing', 'schema_version': version}; self.calls = []
    def get_item(self, **kw): return {'Item': copy.deepcopy(self.parent)} if kw['Key']['PK'] == 'U#owner' else {}
    def update_item(self, **kw): self.calls.append(kw)


def service():
    doc = {'id': DID, 'kind': 'paper', 'status': 'done', 'sha256': 'c'*64, 'name': 'fixture.pdf',
           'pages': [{'page': 1, 'text': 'The synthetic sample measures 1 m.'}]}
    docs = {DID: doc}
    schema = {'version': 1, 'status': 'proposed', 'variables': [
        {'id': 'quantity', 'label': 'Fixture quantity', 'type': 'num', 'unit': 'm', 'sigma': 1, 'status': 'approved'}],
        'columns': [], 'constants': []}
    approval = review.approve(review.review_request(schema, docs), schema, docs, 1, 'fixture reviewer')
    result = Schemas(None, Table(approval['schema']['version']), None, Storage(), 'fixture', None, None)
    result.current = lambda uid, pid: (approval, docs)
    message = {'version': 1, 'action': 'paper_extract', 'uid': UID, 'project_id': PID, 'doc_id': DID,
               'schema_version': approval['schema']['version'], 'schema_sha256': approval['schema_sha256']}
    return result, message, approval, docs


def test_false_quote_is_retained_as_rejection_and_success_checkpoint_does_not_repeat_sdk(monkeypatch):
    schemas, message, approval, docs = service()
    calls = []
    def model(client, model, content, raw_output, system):
        calls.append(content)
        payload = {'candidates': [{'variable': 'quantity', 'value': [1, 1], 'unit': 'm', 'scope': 'Fixture only',
            'citation': {'kind': 'paper', 'doc_id': DID, 'page': 1, 'quote': 'A fabricated quote'}}]}
        raw_output.write_text(json.dumps({'content': [{'type': 'text', 'text': json.dumps(payload)}],
            'usage': {'input_tokens': 10, 'output_tokens': 10}, 'stop_reason': 'end_turn'}))
        return payload
    monkeypatch.setattr(paper_worker.adapter, 'propose', model)
    paper_worker.process(message, 'lease', schemas, None, 'fixture-model')
    key = paper_worker.artifact_key(UID, PID, DID, approval, 'fixture-model')
    result = schemas.load(key)
    assert result['candidates'] == [] and len(result['rejected']) == 1
    assert result['published'] is False and 'records' not in result
    assert result['source_sha256'] == docs[DID]['sha256']
    paper_worker.process(message, 'next-lease', schemas, None, 'fixture-model')
    assert len(calls) == 1 and any(k.endswith('-raw.json') for k in schemas.s3.data)
    original = schemas.s3.data[key]
    paper_worker.process(message, 'new-extractor-lease', schemas, None, 'fixture-model-B')
    assert len(calls) == 2 and schemas.s3.data[key] == original


def test_paper_message_stale_or_foreign_owner_cannot_call_model():
    schemas, message, approval, docs = service()
    paper_worker.process({**message, 'schema_version': 99}, 'lease', schemas, None, 'fixture-model')
    paper_worker.process({**message, 'uid': 'intruder'}, 'lease', schemas, None, 'fixture-model')
    assert not schemas.table.calls and not schemas.s3.data
    docs[DID]['pages'][0]['text'] = 'Changed parser output'
    # Approval snapshot includes source hashes; current() normally checks parsed hashes too.
    docs[DID]['sha256'] = 'd'*64
    with pytest.raises(ValueError): paper_worker.process(message, 'lease', schemas, None, 'fixture-model')
    assert not schemas.table.calls
