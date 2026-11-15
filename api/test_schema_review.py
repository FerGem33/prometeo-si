"""T35 functional review tests with explicit in-memory persistence doubles."""
import copy
import json

import pytest
from api.projects import ApiError
from api.schema_review import Schemas, joint_schema, review


DID = 'doc_'+'a'*32
PID = 'prj_'+'b'*32
DOC = {'id': DID, 'kind': 'table', 'name': 'source.csv', 'sha256': 'a'*64, 'status': 'done',
       'headers': ['value'], 'rows': [{'row': 2, 'values': ['1']}]}
PROPOSAL = {'version': 1, 'status': 'proposed', 'variables': [
    {'id': 'value', 'label': 'Value', 'type': 'num', 'unit': 'm', 'status': 'proposed', 'records': 1,
     'merged_from': [], 'evidence': [{'kind': 'table', 'doc_id': DID, 'row': 2, 'column': 'value', 'text': '1'}]}],
    'columns': [{'doc_id': DID, 'column': 'value', 'variable': 'value', 'unit': 'm', 'convert': None,
                 'status': 'proposed', 'sample': ['1']}], 'constants': []}


class Memory(Schemas):
    def __init__(self):
        self.parent = {'revision': 1, 'status': 'awaiting_review', 'counts': {}}
        self.docs = {DID: copy.deepcopy(DOC)}
        self.proposals = {DID: {'schemas': [copy.deepcopy(PROPOSAL)]}}
        self.versions = {}
        self.artifacts = {}
        self.projects = self
        self.sent = []

    def get(self, uid, pid):
        if uid != 'owner':
            raise ApiError(404, 'not_found', 'Project not found')
        return copy.deepcopy(self.parent)

    def corpus(self, uid, pid):
        self.get(uid, pid)
        return copy.deepcopy(self.docs), copy.deepcopy(self.proposals)

    def metadata(self, pid, version):
        return copy.deepcopy(self.versions[version])

    def load(self, key):
        return copy.deepcopy(self.artifacts[key])

    def persist(self, uid, pid, parent, value, old_version, dispatch=False):
        if self.parent.get('schema_version') != old_version or parent['revision'] != self.parent['revision']:
            raise ApiError(409, 'conflict', 'Version changed')
        version = value['schema']['version']
        key = f'version-{version}'
        assert version not in self.versions
        self.versions[version] = {'artifact_key': key, 'artifact_sha256': review.digest(value)}
        self.artifacts[key] = copy.deepcopy(value)
        self.parent.update(schema_version=version, revision=parent['revision']+1,
                           extraction_dispatch_pending=dispatch, status='processing' if dispatch else 'awaiting_review')

    def dispatch(self, uid, pid, value):
        if self.parent.get('extraction_dispatch_pending'):
            self.sent.append(copy.deepcopy(value))
            self.parent['extraction_dispatch_pending'] = False


def prepare(service):
    schema = Schemas.get(service, 'owner', PID)
    variable = schema['variables'][0]['id']
    return service.patch('owner', PID, {'version': schema['version'], 'edits': [
        {'op': 'set_status', 'target': 'variable', 'id': variable, 'status': 'approved'},
        {'op': 'set_status', 'target': 'column', 'id': 'value', 'doc_id': DID, 'status': 'approved'}]})


def test_get_is_proposed_and_namespaces_without_merging():
    doc2 = {**DOC, 'id': 'doc_'+'c'*32}
    schema = joint_schema({DID: DOC, doc2['id']: doc2}, {DID: {'schemas': [PROPOSAL]}, doc2['id']: {'schemas': [PROPOSAL]}})
    assert len({v['id'] for v in schema['variables']}) == 2
    assert all(v['status'] == 'proposed' for v in schema['variables'])
    service = Memory()
    first = Schemas.get(service, 'owner', PID)
    assert Schemas.get(service, 'owner', PID) == first
    assert first['status'] == 'proposed' and not service.sent


def test_owner_isolation_and_pending_review_gate():
    service = Memory()
    with pytest.raises(ApiError) as exc:
        Schemas.get(service, 'intruder', PID)
    assert exc.value.status == 404
    Schemas.get(service, 'owner', PID)
    with pytest.raises(ApiError) as exc:
        service.approve('owner', PID, {'version': 1})
    assert exc.value.status == 409 and not service.sent


def test_edit_versions_are_immutable_and_stale_patch_fails():
    service = Memory()
    changed = prepare(service)
    assert changed['version'] == 2 and changed['status'] == 'proposed'
    assert service.artifacts['version-1']['schema']['variables'][0]['status'] == 'proposed'
    with pytest.raises(ApiError) as exc:
        service.patch('owner', PID, {'version': 1, 'edits': [{'op': 'unsupported'}]})
    assert exc.value.status == 409


def test_explicit_approval_delegation_and_replay():
    service = Memory()
    changed = prepare(service)
    result = service.approve('owner', PID, {'version': changed['version'],
        'review_authority': 'Delegated approval; no expert line-by-line review'})
    assert result['status'] == 'approved' and result['approved_by'] == 'owner'
    assert service.sent[0]['review_authority'].startswith('Delegated approval')
    assert review.extract_tables(service.sent[0], service.docs)['records'][0]['values']
    assert service.approve('owner', PID, {'version': changed['version']}) == result
    assert len(service.sent) == 1


def test_source_or_stored_schema_tampering_invalidates_approval():
    service = Memory()
    changed = prepare(service)
    service.docs[DID]['sha256'] = 'c'*64
    with pytest.raises(ApiError) as exc:
        service.approve('owner', PID, {'version': changed['version']})
    assert exc.value.status == 409
    service.docs[DID]['sha256'] = DOC['sha256']
    service.artifacts['version-2']['schema']['variables'][0]['label'] = 'Changed externally'
    with pytest.raises(ApiError):
        Schemas.get(service, 'owner', PID)


def test_editing_after_approval_revokes_it():
    service = Memory()
    changed = prepare(service)
    approved = service.approve('owner', PID, {'version': changed['version']})
    schema = service.patch('owner', PID, {'version': approved['version'], 'edits': [
        {'op': 'rename', 'variable': approved['variables'][0]['id'], 'label': 'Reviewed label'}]})
    assert schema['status'] == 'proposed' and 'approved_by' not in schema
    assert service.parent['extraction_dispatch_pending'] is False


def test_changed_parsed_values_invalidate_review_even_with_unchanged_source_hash():
    service = Memory()
    prepare(service)
    service.docs[DID]['rows'][0]['values'][0] = '99'
    with pytest.raises(ApiError) as exc:
        Schemas.get(service, 'owner', PID)
    assert exc.value.status == 409


def test_conversion_required_and_constants_with_unreviewed_scope_fail():
    service = Memory()
    changed = prepare(service)
    variable = changed['variables'][0]['id']
    changed = service.patch('owner', PID, {'version': changed['version'], 'edits': [
        {'op': 'set_unit', 'variable': variable, 'unit': 'cm'},
        {'op': 'set_status', 'target': 'variable', 'id': variable, 'status': 'approved'}]})
    with pytest.raises(ApiError):
        service.approve('owner', PID, {'version': changed['version']})
    changed = service.patch('owner', PID, {'version': changed['version'], 'edits': [
        {'op': 'set_convert', 'doc_id': DID, 'column': 'value', 'unit': 'm', 'convert': {'factor': 100, 'offset': 0}},
        {'op': 'set_status', 'target': 'column', 'id': 'value', 'doc_id': DID, 'status': 'approved'}]})
    approved = service.approve('owner', PID, {'version': changed['version']})
    extracted = review.extract_tables(service.sent[-1], service.docs)
    assert extracted['records'][0]['values'][variable] == [100, 100]
    invalid = copy.deepcopy(service.sent[-1])
    invalid['schema']['constants'] = [{'doc_id': DID, 'variable': variable, 'value': [1, 1], 'note': 'No scope'}]
    invalid['schema_sha256'] = review.digest(invalid['schema'])
    with pytest.raises(ValueError, match='scope'):
        review.checked_approval(invalid, service.docs)
