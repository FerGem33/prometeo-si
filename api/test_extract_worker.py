"""Extraction worker gates and retry behavior; AWS storage is doubled."""
import copy
import json

import pytest

from api import extract_worker
from api.test_schema_review import DID, PID, Memory, prepare


class Table:
    def __init__(self, service):
        self.service = service
        self.writes = []
        self.fail_document = False

    def get_item(self, **kwargs):
        return {'Item': copy.deepcopy(self.service.parent)}

    def update_item(self, **kwargs):
        self.writes.append(kwargs)
        if self.fail_document and kwargs['Key']['SK'].startswith('D#'):
            raise RuntimeError('Document was deleted or is leased')


class S3:
    def __init__(self):
        self.objects = {}

    def put_object(self, **kwargs):
        self.objects[kwargs['Key']] = json.loads(kwargs['Body'])


def setup():
    service = Memory()
    schema = prepare(service)
    service.approve('owner', PID, {'version': schema['version']})
    approval = service.sent[-1]
    service.table, service.s3, service.bucket = Table(service), S3(), 'private-corpus'
    return service, {'version': 1, 'action': 'extract', 'uid': 'owner', 'project_id': PID,
                     'schema_version': approval['schema']['version'], 'schema_sha256': approval['schema_sha256']}


def test_extracts_only_explicitly_approved_cells_with_source_snapshot():
    service, message = setup()
    extract_worker.process(message, 'lease1', service)
    assert len(service.s3.objects) == 1
    result = next(iter(service.s3.objects.values()))
    assert len(result['records']) == 1
    assert result['published'] is False
    assert result['source_snapshot'][DID] == service.docs[DID]['sha256']
    assert result['schema_version'] == message['schema_version']
    assert any(':ready' in call['ExpressionAttributeValues'] for call in service.table.writes)


def test_proposal_and_changed_sources_never_reach_storage():
    service, message = setup()
    artifact = service.artifacts['version-'+str(message['schema_version'])]
    artifact['stage'] = 'review'
    service.versions[message['schema_version']]['artifact_sha256'] = extract_worker.review.digest(artifact)
    with pytest.raises(ValueError, match='Approved'):
        extract_worker.process(message, 'lease2', service)
    assert not service.s3.objects and not service.table.writes
    service, message = setup()
    service.docs[DID]['sha256'] = 'f'*64
    with pytest.raises(Exception, match='changed'):
        extract_worker.process(message, 'lease3', service)
    assert not service.s3.objects and not service.table.writes


def test_stale_or_completed_messages_are_idempotent():
    service, message = setup()
    service.parent['schema_version'] += 1
    extract_worker.process(message, 'lease4', service)
    assert not service.table.writes
    service.parent['schema_version'] -= 1
    service.versions[message['schema_version']]['extract_state'] = 'done'
    extract_worker.process(message, 'lease5', service)
    assert not service.s3.objects and not service.table.writes


def test_deletion_or_lease_conflict_stops_extraction_and_allows_retry():
    service, message = setup()
    service.table.fail_document = True
    with pytest.raises(RuntimeError, match='deleted or is leased'):
        extract_worker.process(message, 'lease6', service)
    assert not service.s3.objects
    assert service.table.writes[-1]['ExpressionAttributeValues'][':failed'] == 'failed'
    service.table.fail_document = False
    extract_worker.process(message, 'lease7', service)
    assert len(service.s3.objects) == 1


@pytest.mark.parametrize('field,value', [('schema_version', True), ('schema_sha256', 'invalid'), ('uid', '../other')])
def test_malformed_messages_are_rejected_before_io(field, value):
    service, message = setup()
    message[field] = value
    with pytest.raises(ValueError, match='Invalid'):
        extract_worker.process(message, 'lease8', service)
    assert not service.table.writes
