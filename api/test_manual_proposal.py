"""Manual recovery keeps model rejection and never grants approval."""
import copy
import json

import pytest
from api.projects import ApiError
from api.test_schema_review import Memory, DOC, DID, PID


class Table:
    def __init__(self, service):
        self.service = service
        self.item = {'id': DID, 'status': 'failed', 'stage': 'propose', 'worker_until': 0, 'sha256': DOC['sha256'],
            'expected_sha256': DOC['sha256'], 'bytes': 10, 'object_etag': 'etag', 'failure_reason': 'rejected model citation',
            'object_key': f'u/owner/p/{PID}/raw/{DID}'}
    def get_item(self, **kw): return {'Item': copy.deepcopy(self.item)}
    def update_item(self, **kw):
        if kw['Key']['SK'].startswith('D#'):
            self.item.update(proposal_key=kw['ExpressionAttributeValues'][':key'], proposal_origin='manual', status='done')
        else: self.service.parent.update(status='awaiting_review')


class Storage:
    def __init__(self, service): self.service = service
    def head_object(self, **kw): return {'ETag': 'etag', 'ContentLength': 10}
    def put_object(self, **kw): self.service.artifacts[kw['Key']] = json.loads(kw['Body'])


def test_manual_recovery_validates_citations_preserves_rejection_and_owner():
    service = Memory(); service.parent['status'] = 'failed'
    service.table = Table(service); service.s3 = Storage(service); service.bucket = 'fixture'
    service.artifacts[f'u/owner/p/{PID}/text/{DID}/parsed.json'] = {'document': copy.deepcopy(DOC)}
    proposal = {'doc_id': DID, 'variables': [], 'columns': [{'column': 'value', 'variable': None, 'unit': None, 'convert': None}]}
    with pytest.raises(ApiError) as exc: service.manual('intruder', PID, DID, {'proposal': proposal, 'reason': 'Fixture'})
    assert exc.value.status == 404
    false = {**proposal, 'variables': [{'id': 'value', 'label': 'Fixture', 'type': 'num', 'unit': 'm',
        'evidence': [{'kind': 'table', 'doc_id': DID, 'row': 2, 'column': 'value', 'text': 'false'}]}]}
    with pytest.raises(ApiError): service.manual('owner', PID, DID, {'proposal': false, 'reason': 'Fixture'})
    result = service.manual('owner', PID, DID, {'proposal': proposal, 'reason': 'Explicit fixture exclusion of uncertain columns'})
    assert result['status'] == 'proposed' and result['origin'] == 'manual'
    artifact = service.artifacts[service.table.item['proposal_key']]
    assert artifact['rejected_model_reason'] == 'rejected model citation' and artifact['by'] == 'owner'
    assert artifact['schemas'][0]['status'] == 'proposed' and not service.sent
    assert service.manual('owner', PID, DID, {'proposal': proposal, 'reason': 'Explicit fixture exclusion of uncertain columns'}) == result


def test_raw_response_requires_owner_and_exact_document_local_filename():
    service = Memory(); service.table = Table(service)
    name = 'paper-'+'a'*64+'-raw.json'
    service.optional = lambda key: {'content': [{'type': 'text', 'text': 'Synthetic response'}], 'usage': {}, 'stop_reason': 'end_turn'}
    assert service.diagnostics('owner', PID, {'doc_id': DID, 'response': name})['text'] == 'Synthetic response'
    with pytest.raises(ApiError) as exc: service.diagnostics('intruder', PID, {'doc_id': DID, 'response': name})
    assert exc.value.status == 404
    with pytest.raises(ApiError): service.diagnostics('owner', PID, {'doc_id': DID, 'response': '../raw.json'})
