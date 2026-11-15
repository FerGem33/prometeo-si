import copy
import hashlib
import io
import json
from types import SimpleNamespace

from botocore.exceptions import ClientError
import pytest
from api.ingest_worker import Worker, DocumentFailure, parse, requests


RAW = b'condition,value\nobserved,1\n'
PID, DID = 'prj_'+'a'*32, 'doc_'+'b'*32


def error(code):
    return ClientError({'Error': {'Code': code}}, 'test')


class Table:
    def __init__(self):
        self.items = {('U#owner', 'P#'+PID): {'status': 'processing', 'revision': 1},
            ('P#'+PID, 'D#'+DID): {'id': DID, 'name': 'test.csv', 'kind': 'table', 'bytes': len(RAW),
             'sha256': None, 'expected_sha256': hashlib.sha256(RAW).hexdigest(), 'object_etag': 'etag',
             'object_key': 'u/owner/p/'+PID+'/raw/'+DID, 'status': 'queued', 'stage': 'parse'}}

    def get_item(self, Key, **kwargs):
        value = self.items.get((Key['PK'], Key['SK']))
        return {'Item': copy.deepcopy(value)} if value else {}

    def put_item(self, Item, **kwargs):
        key = Item['PK'], Item['SK']
        if key in self.items:
            raise error('ConditionalCheckFailedException')
        self.items[key] = copy.deepcopy(Item)

    def update_item(self, Key, UpdateExpression, **kwargs):
        item = self.items[Key['PK'], Key['SK']]
        values = kwargs['ExpressionAttributeValues']
        if 'worker_lease = :lease, worker_until' in UpdateExpression:
            item.update(worker_lease=values[':lease'], worker_until=values[':until'], status='running')
        elif 'model_calls = if_not_exists' in UpdateExpression:
            if item.get('model_calls', 0) >= values[':max']:
                raise error('ConditionalCheckFailedException')
            item['model_calls'] = item.get('model_calls', 0)+1
        elif '#status = :review' in UpdateExpression:
            if item['status'] not in ('processing', 'failed'):
                raise error('ConditionalCheckFailedException')
            item['status'] = values[':review']
        else:
            assert item['worker_lease'] == values[':lease']
            for name, field in kwargs['ExpressionAttributeNames'].items():
                if name.startswith('#old'):
                    item.pop(field, None)
                else:
                    item[field] = values[name.replace('#k', ':v')]

    def query(self, **kwargs):
        return {'Items': [copy.deepcopy(v) for (pk, sk), v in self.items.items() if pk == 'P#'+PID and sk.startswith('D#')]}


class S3:
    def __init__(self):
        self.data = {'u/owner/p/'+PID+'/raw/'+DID: RAW}

    def get_object(self, Bucket, Key, **kwargs):
        if Key not in self.data:
            raise error('NoSuchKey')
        return {'Body': io.BytesIO(self.data[Key])}

    def put_object(self, Bucket, Key, Body, **kwargs):
        self.data[Key] = Body


class Model:
    def __init__(self):
        self.messages = self
        self.calls = 0

    def create(self, **kwargs):
        self.calls += 1
        proposal = {'doc_id': DID, 'variables': [], 'columns': [
            {'column': 'condition', 'variable': None, 'unit': None, 'convert': None},
            {'column': 'value', 'variable': None, 'unit': None, 'convert': None}]}
        data = {'stop_reason': 'end_turn', 'content': [{'type': 'text', 'text': json.dumps(proposal)}],
                'usage': {'input_tokens': 100, 'output_tokens': 50}}
        return SimpleNamespace(stop_reason='end_turn', content=[SimpleNamespace(type='text', text=json.dumps(proposal))],
                               model_dump_json=lambda **kw: json.dumps(data))


@pytest.fixture
def worker():
    table, s3, model = Table(), S3(), Model()
    return Worker(table, s3, 'test-bucket', model, 'configured-model', {'max_bytes': 1000, 'max_pages': 2})


def message(did=DID):
    return {'version': 1, 'uid': 'owner', 'project_id': PID, 'doc_id': did}


def test_old_proposal_message_acknowledges_only_source_bound_manual_recovery(worker):
    item = worker.table.items['P#'+PID, 'D#'+DID]
    item.update(status='done', proposal_origin='manual', sha256=item['expected_sha256'],
                proposal_key=f'u/owner/p/{PID}/text/{DID}/manual-'+('c'*64)+'.json')
    worker.process(message(), 'old-rejected-proposal')
    assert worker.client.calls == 0
    item['proposal_key'] = 'u/another-owner/manual.json'
    with pytest.raises(DocumentFailure): worker.process(message(), 'tampered')


def test_success_reaches_review_never_approval_and_retry_reuses(worker):
    worker.process(message(), 'lease1')
    item = worker.table.items['P#'+PID, 'D#'+DID]
    assert item['status'] == 'done' and item['stage'] == 'propose'
    assert worker.table.items['U#owner', 'P#'+PID]['status'] == 'awaiting_review'
    assert item['sha256'] == hashlib.sha256(RAW).hexdigest()
    artifact = json.loads(worker.s3.data[item['proposal_key']])
    assert artifact['status'] == 'proposed'
    worker.process(message(), 'lease2')
    assert worker.client.calls == 1


def test_hash_mismatch_fails_before_model(worker):
    worker.table.items['P#'+PID, 'D#'+DID]['expected_sha256'] = '0'*64
    with pytest.raises(DocumentFailure, match='hash_mismatch'):
        worker.process(message(), 'lease')
    assert worker.client.calls == 0
    assert worker.table.items['P#'+PID, 'D#'+DID]['sha256'] is None


def test_deleted_project_message_is_acknowledged_without_model_or_dlq_retry(worker):
    worker.table.items.pop(('U#owner', 'P#'+PID))
    worker.table.items.pop(('P#'+PID, 'D#'+DID))
    worker.process(message(), 'retired-project')
    assert worker.client.calls == 0


def test_resume_successful_model_after_checkpoint_failure(worker, monkeypatch):
    original = worker.update
    def fail_last(key, fields, lease=None):
        if fields.get('status') == 'done':
            raise RuntimeError('interrupted final checkpoint')
        return original(key, fields, lease)
    monkeypatch.setattr(worker, 'update', fail_last)
    with pytest.raises(RuntimeError):
        worker.process(message(), 'first')
    assert worker.client.calls == 1
    monkeypatch.setattr(worker, 'update', original)
    worker.process(message(), 'second')
    assert worker.client.calls == 1
    assert 'error_code' not in worker.table.items['P#'+PID, 'D#'+DID]


def test_duplicate_verified_source_is_skipped(worker):
    worker.process(message(), 'first')
    did = 'doc_'+'c'*32
    original = worker.table.items['P#'+PID, 'D#'+DID]
    worker.table.items['P#'+PID, 'D#'+did] = {**original, 'id': did, 'status': 'queued', 'sha256': None,
        'object_key': 'u/owner/p/'+PID+'/raw/'+did}
    worker.s3.data['u/owner/p/'+PID+'/raw/'+did] = RAW
    worker.process(message(did), 'second')
    assert worker.table.items['P#'+PID, 'D#'+did]['error_code'] == 'duplicate'
    assert worker.client.calls == 1


def test_bad_owner_message_and_corrupt_table(worker):
    with pytest.raises(DocumentFailure):
        worker.process({**message(), 'uid': 'another-owner'}, 'lease')
    item = worker.table.items['P#'+PID, 'D#'+DID]
    bad = b'a,a\n1,2\n'
    with pytest.raises(DocumentFailure, match='unreadable'):
        parse(bad, {**item, 'bytes': len(bad), 'expected_sha256': hashlib.sha256(bad).hexdigest()}, 2)


def test_pdf_page_limit_and_no_text():
    pypdf = pytest.importorskip('pypdf')
    writer = pypdf.PdfWriter()
    writer.add_blank_page(width=100, height=100)
    writer.add_blank_page(width=100, height=100)
    stream = io.BytesIO()
    writer.write(stream)
    raw = stream.getvalue()
    item = {'id': DID, 'name': 'blank.pdf', 'kind': 'paper', 'bytes': len(raw), 'expected_sha256': hashlib.sha256(raw).hexdigest()}
    with pytest.raises(DocumentFailure, match='too_many_pages'):
        parse(raw, item, 1)
    with pytest.raises(DocumentFailure, match='no_text_layer'):
        parse(raw, item, 2)
