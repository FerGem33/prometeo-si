"""One approved PDF per queue message; cached candidates never become table cells."""
import json
import os
import re
import tempfile
import time
from pathlib import Path

try:
    from .schema_review import review
    from . import ingest_propose as adapter
    from .evaluate_papers import SYSTEM
except ImportError:
    from schema_review import review
    import ingest_propose as adapter
    from evaluate_papers import SYSTEM


EXTRACTOR_VERSION = 'paper-context-v2'


def parse_candidates(text):
    # Some real responses append commentary after a single JSON fence. Only the
    # fenced object is data; prose never supplies values or evidence. All schema,
    # literal citation, unit and semantic-review gates remain mandatory.
    fenced = re.fullmatch(r'\s*```(?:json)?[ \t]*\n(.*?)\n```([^`{}]*)\s*', text, re.DOTALL)
    return json.loads(fenced.group(1) if fenced else text)


def artifact_key(uid, pid, did, approval, model=None, pages=None):
    extractor = review.digest([EXTRACTOR_VERSION, SYSTEM, model if model is not None else os.environ.get('MODEL_ID', ''), [int(p) for p in (pages or [])]])
    return f'u/{uid}/p/{pid}/text/papers/{did}/v{approval["schema"]["version"]}-{approval["schema_sha256"]}-{extractor}.json'


def release(schemas, key, lease):
    try:
        schemas.table.update_item(Key=key, UpdateExpression='SET worker_until = :zero',
            ConditionExpression='worker_lease = :lease', ExpressionAttributeValues={':zero': 0, ':lease': lease})
    except Exception as exc:
        if getattr(exc, 'response', {}).get('Error', {}).get('Code') != 'ConditionalCheckFailedException': raise


def request(document, variables, selected=None):
    # Bound a call; retain physical page numbers and expose the selection to reviewers.
    terms = [str(v.get('unit') or '') for v in variables] + [v['label'] for v in variables]
    matching = [p for p in document['pages'] if any(t and t.casefold() in p['text'].casefold() for t in terms)]
    if selected:
        if (not isinstance(selected, list) or not 1 <= len(selected) <= 4 or any(type(p) is not int for p in selected)
                or len(set(selected)) != len(selected)): raise ValueError('Select one to four unique physical pages')
        pages = [p for p in document['pages'] if p['page'] in selected]
        if len(pages) != len(selected): raise ValueError('Physical page outside source')
    else:
        pages = (matching or document['pages'])[:4]
    data = {'doc_id': document['id'], 'approved_variables': variables, 'pages': pages}
    text = json.dumps(data, ensure_ascii=True).replace('<', '\\u003c').replace('>', '\\u003e')
    if len(text) > 60000: raise ValueError('Selected PDF pages exceed technical call limit; manual review required')
    return '<untrusted_data>\n'+text+'\n</untrusted_data>', [p['page'] for p in pages]


def process(message, lease, schemas, client, model):
    expected = {'version', 'action', 'uid', 'project_id', 'doc_id', 'schema_version', 'schema_sha256'}
    if (not isinstance(message, dict) or not expected <= set(message) or set(message)-expected-{'pages', 'selection_sha256'} or message['version'] != 1
            or message['action'] != 'paper_extract' or type(message['schema_version']) is not int
            or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', message.get('uid', ''))
            or not re.fullmatch(r'prj_[a-f0-9]{32,64}', message.get('project_id', ''))
            or not re.fullmatch(r'doc_[a-f0-9]{32,64}', message.get('doc_id', ''))):
        raise ValueError('Invalid paper extraction message')
    uid, pid, did = message['uid'], message['project_id'], message['doc_id']
    parent = schemas.table.get_item(Key={'PK': 'U#'+uid, 'SK': 'P#'+pid}, ConsistentRead=True).get('Item')
    if not parent or parent['status'] == 'deleting' or parent.get('schema_version') != message['schema_version']: return
    approval, documents = schemas.current(uid, pid)
    if approval['schema_sha256'] != message['schema_sha256']: raise ValueError('Stale schema hash')
    variables = list(review.checked_approval(approval, documents).values())
    document = documents.get(did)
    if not document or document['kind'] != 'paper': raise ValueError('Approved paper source required')
    selected = message.get('pages', [])
    if 'pages' in message:
        if (message.get('selection_sha256') != review.digest([approval['schema_sha256'], did, selected])
                or selected not in parent.get('paper_page_sets', {}).get(did, [[]])): raise ValueError('Unregistered PDF page selection')
    key = artifact_key(uid, pid, did, approval, model, selected)
    if schemas.optional(key) is not None: return
    doc_key = {'PK': 'P#'+pid, 'SK': 'D#'+did}
    schemas.table.update_item(Key=doc_key,
        UpdateExpression='SET worker_lease = :lease, worker_until = :until',
        ConditionExpression='attribute_exists(PK) AND #status <> :deleting AND (attribute_not_exists(worker_until) OR worker_until < :now)',
        ExpressionAttributeNames={'#status': 'status'}, ExpressionAttributeValues={':lease': lease, ':until': int(time.time())+150,
            ':now': int(time.time()), ':deleting': 'deleting'})
    result = {'schema_sha256': approval['schema_sha256'], 'source_sha256': document['sha256'],
              'doc_id': did, 'model': model, 'candidates': [], 'rejected': [], 'published': False}
    try:
        content, pages = request(document, variables, selected)
        result['pages'] = pages
        request_hash = review.digest([document, approval['schema_sha256'], SYSTEM, content, model])
        raw_key = f'u/{uid}/p/{pid}/text/{did}/paper-{request_hash}-raw.json'
        raw = schemas.optional(raw_key)
        if raw is None:
            schemas.table.update_item(Key=doc_key,
                UpdateExpression='SET model_calls = if_not_exists(model_calls, :zero) + :one',
                ConditionExpression='worker_lease = :lease AND (attribute_not_exists(model_calls) OR model_calls < :max)',
                ExpressionAttributeValues={':zero': 0, ':one': 1, ':max': 20, ':lease': lease})
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory)/'raw.json'
                try:
                    adapter.propose(client, model, content, raw_output=path, system=SYSTEM, response_parser=parse_candidates)
                finally:
                    if path.exists():
                        raw = json.loads(path.read_text())
                        # Keep each paid attempt even if another attempt won the cache race.
                        attempt = raw_key.replace('-raw.json', '-'+review.digest(lease)[:16]+'-attempt.json')
                        schemas.s3.put_object(Bucket=schemas.bucket, Key=attempt, Body=json.dumps(raw).encode(), ContentType='application/json')
                        try:
                            schemas.s3.put_object(Bucket=schemas.bucket, Key=raw_key, Body=json.dumps(raw).encode(), ContentType='application/json', IfNoneMatch='*')
                        except Exception as exc:
                            if getattr(exc, 'response', {}).get('Error', {}).get('Code') not in ('PreconditionFailed', '412'): raise
                        print(json.dumps({'event': 'paper_usage', 'doc_id': did, 'usage': raw.get('usage', {})}), flush=True)
        if raw.get('stop_reason') != 'end_turn': raise ValueError('Incomplete model response')
        response = parse_candidates(''.join(b['text'] for b in raw['content'] if b['type'] == 'text'))
        result.update(review.verify_paper_candidates(response, approval, documents, did, pages))
        result['usage'] = raw.get('usage', {})
    except (ValueError, KeyError, TypeError) as exc:
        result['failure'] = str(exc)[:400]
    except Exception:
        # Transient service errors retry via SQS; no permanent empty success artifact.
        release(schemas, doc_key, lease)
        raise
    try:
        schemas.table.update_item(Key=doc_key, UpdateExpression='SET worker_until = :until',
            ConditionExpression='worker_lease = :lease AND worker_until > :now',
            ExpressionAttributeValues={':lease': lease, ':until': int(time.time())+150, ':now': int(time.time())})
        result['selection'] = selected
        result['artifact_sha256'] = review.digest(result)
        schemas.s3.put_object(Bucket=schemas.bucket, Key=key, Body=json.dumps(result, allow_nan=False).encode(), ContentType='application/json', IfNoneMatch='*')
    except Exception as exc:
        if getattr(exc, 'response', {}).get('Error', {}).get('Code') not in ('PreconditionFailed', '412'): raise
    finally:
        release(schemas, doc_key, lease)
