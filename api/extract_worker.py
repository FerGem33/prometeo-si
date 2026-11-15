"""T35 deterministic extraction, only from a source-bound explicit approval."""
import json
import re
import time

try:
    from .schema_review import review
    from .projects import stamp
except ImportError:
    from schema_review import review
    from projects import stamp


def process(message, lease, schemas):
    required = {'version', 'action', 'uid', 'project_id', 'schema_version', 'schema_sha256'}
    if (not isinstance(message, dict) or set(message) != required or message['version'] != 1
            or message['action'] != 'extract' or type(message['schema_version']) is not int
            or not isinstance(message['uid'], str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', message['uid'])
            or not re.fullmatch(r'prj_[a-f0-9]{32,64}', message.get('project_id', ''))
            or not re.fullmatch(r'[a-f0-9]{64}', message.get('schema_sha256', ''))):
        raise ValueError('Invalid extraction message')
    uid, pid, version = message['uid'], message['project_id'], message['schema_version']
    table = schemas.table
    parent_key = {'PK': 'U#'+uid, 'SK': 'P#'+pid}
    parent = table.get_item(Key=parent_key, ConsistentRead=True).get('Item')
    if not parent or parent['status'] == 'deleting' or parent.get('schema_version') != version:
        return
    approval, documents = schemas.current(uid, pid)
    if approval.get('stage') != 'approved' or approval['schema_sha256'] != message['schema_sha256']:
        raise ValueError('Approved version/hash required')
    review.checked_approval(approval, documents)
    key = {'PK': 'P#'+pid, 'SK': 'S#'+str(version)}
    meta = schemas.metadata(pid, version)
    artifact_key = f'u/{uid}/p/{pid}/text/extractions/v{version}-{approval["schema_sha256"]}.json'
    if meta.get('extract_state') == 'done':
        return
    table.update_item(Key=key, UpdateExpression='SET extract_lease = :lease, extract_until = :until, extract_state = :running',
        ConditionExpression='(attribute_not_exists(extract_until) OR extract_until < :now) AND (attribute_not_exists(extract_state) OR extract_state <> :done)',
        ExpressionAttributeValues={':lease': lease, ':until': int(time.time())+150, ':now': int(time.time()), ':running': 'running', ':done': 'done'})
    claimed = []
    try:
        for did in documents:
            doc_key = {'PK': 'P#'+pid, 'SK': 'D#'+did}
            table.update_item(Key=doc_key,
                UpdateExpression='SET worker_lease = :lease, worker_until = :until, #stage = :extract, #status = :running',
                ConditionExpression='attribute_exists(PK) AND #status <> :deleting AND (attribute_not_exists(worker_until) OR worker_until < :now)',
                ExpressionAttributeNames={'#stage': 'stage', '#status': 'status'},
                ExpressionAttributeValues={':lease': lease, ':until': int(time.time())+150, ':now': int(time.time()),
                    ':extract': 'extract', ':running': 'running', ':deleting': 'deleting'})
            claimed.append(doc_key)
        result = review.extract_tables(approval, documents)
        result.update(schema_version=version, source_snapshot=review.snapshot(documents),
                      approval_authority=approval.get('review_authority', 'Authenticated project owner'))
        schemas.s3.put_object(Bucket=schemas.bucket, Key=artifact_key, Body=json.dumps(result, ensure_ascii=False).encode(),
                              ContentType='application/json')
        for did in documents:
            table.update_item(Key={'PK': 'P#'+pid, 'SK': 'D#'+did},
                UpdateExpression='SET #stage = :verify, #status = :done, updated_at = :now, worker_until = :zero',
                ConditionExpression='attribute_exists(PK) AND #status <> :deleting AND worker_lease = :lease',
                ExpressionAttributeNames={'#stage': 'stage', '#status': 'status'},
                ExpressionAttributeValues={':verify': 'verify', ':done': 'done', ':deleting': 'deleting', ':now': stamp(), ':zero': 0, ':lease': lease})
        table.update_item(Key=parent_key,
            UpdateExpression='SET #status = :ready, extraction_key = :key, counts.#records = :records, counts.#variables = :variables, counts.#conflicts = :conflicts, revision = revision + :one, updated_at = :now',
            ConditionExpression='schema_version = :version AND #status <> :deleting',
            ExpressionAttributeNames={'#status': 'status', '#records': 'records', '#variables': 'variables', '#conflicts': 'conflicts_open'},
            ExpressionAttributeValues={':ready': 'ready_to_publish', ':key': artifact_key, ':records': len(result['records']),
                ':variables': sum(v['status'] != 'rejected' for v in approval['schema']['variables']),
                ':conflicts': len(result['conflicts']), ':one': 1, ':now': stamp(), ':version': version, ':deleting': 'deleting'})
        table.update_item(Key=key, UpdateExpression='SET extract_state = :done, extract_until = :zero, extraction_key = :key',
            ConditionExpression='extract_lease = :lease',
            ExpressionAttributeValues={':done': 'done', ':zero': 0, ':key': artifact_key, ':lease': lease})
    except Exception:
        for doc_key in claimed:
            try:
                table.update_item(Key=doc_key, UpdateExpression='SET worker_until = :zero',
                    ConditionExpression='worker_lease = :lease',
                    ExpressionAttributeValues={':zero': 0, ':lease': lease})
            except Exception:
                pass  # Do not clear a lease taken by another invocation or recreate a deleted row.
        table.update_item(Key=key, UpdateExpression='SET extract_state = :failed, extract_until = :zero',
            ConditionExpression='extract_lease = :lease',
            ExpressionAttributeValues={':failed': 'failed', ':zero': 0, ':lease': lease})
        raise
