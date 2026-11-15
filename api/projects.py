"""T33 local project routes. Trust only a configured API Gateway JWT authorizer.

Routes are configured separately by deploy_projects.py. Never decode a caller-supplied JWT here.
"""
import base64
import hashlib
import json
import math
import os
import re
import time
import uuid
from datetime import datetime, timezone
from functools import lru_cache
from urllib.parse import unquote


class ApiError(Exception):
    def __init__(self, status, code, message, details=None):
        self.status, self.code, self.message = status, code, message
        self.details = details


def fail(status, code, message, details=None):
    raise ApiError(status, code, message, details)


def identity(event):
    issuer = os.environ.get('COGNITO_ISSUER')
    audience = os.environ.get('USER_POOL_CLIENT_ID')
    if not issuer or not audience:
        fail(503, 'not_configured', 'Project authentication is not configured')
    try:
        claims = event['requestContext']['authorizer']['jwt']['claims']
        uid = claims['sub']
        expires = float(claims['exp'])
        if (not isinstance(uid, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', uid)
                or claims.get('iss') != issuer or claims.get('aud') != audience
                or claims.get('token_use') != 'id' or not math.isfinite(expires) or expires <= time.time()):
            raise ValueError()
    except (KeyError, TypeError, ValueError, OverflowError):
        fail(401, 'unauthenticated', 'A valid session is required')
    return uid


def body(event):
    try:
        raw = event.get('body', '')
        if not isinstance(raw, str) or len(raw) > 64000:
            raise ValueError()
        if event.get('isBase64Encoded'):
            raw = base64.b64decode(raw, validate=True).decode('utf-8')
        if len(raw.encode('utf-8')) > 16000:
            raise ValueError()
        data = json.loads(raw, parse_constant=lambda _: (_ for _ in ()).throw(ValueError('Nonfinite JSON')))
        if not isinstance(data, dict):
            raise ValueError()
        return data
    except (ValueError, TypeError, UnicodeError):
        fail(400, 'invalid_request', 'Expected a JSON object within 16000 bytes')


def fields(data, create=False):
    if (not data or set(data) - {'name', 'intent'}
            or (create and set(data) != {'name', 'intent'})):
        fail(400, 'invalid_request', 'Expected name and intent')
    result = {}
    for key, value in data.items():
        if not isinstance(value, str) or not 1 <= len(value.strip()) <= (200 if key == 'name' else 4000):
            fail(400, 'invalid_request', 'Invalid ' + key)
        result[key] = value.strip()
    return result


def stamp():
    return datetime.now(timezone.utc).isoformat(timespec='microseconds').replace('+00:00', 'Z')


PUBLIC = ('id', 'name', 'intent', 'status', 'counts', 'pack_version',
          'lens_version', 'created_at', 'updated_at')


def project(item):
    result = {k: item[k] for k in PUBLIC}
    result['counts'] = {k: int(v) for k, v in result['counts'].items()}
    for key in ('pack_version', 'lens_version'):
        if result[key] is not None:
            result[key] = int(result[key])
    return result


class Projects:
    def __init__(self, table):
        self.table = table

    def get(self, uid, pid):
        item = self.table.get_item(Key={'PK': 'U#' + uid, 'SK': 'P#' + pid}, ConsistentRead=True).get('Item')
        if not item:
            fail(404, 'not_found', 'Project not found')
        return item

    def create(self, uid, data, key=None):
        data = fields(data, create=True)
        if key is not None and (not isinstance(key, str) or not re.fullmatch(r'[A-Za-z0-9_.:-]{1,128}', key)):
            fail(400, 'invalid_request', 'Invalid Idempotency-Key')
        pid = 'prj_' + (hashlib.sha256((uid + '\0' + key).encode()).hexdigest() if key else uuid.uuid4().hex)
        now = stamp()
        item = {'PK': 'U#' + uid, 'SK': 'P#' + pid, 'id': pid, **data,
                'status': 'draft', 'counts': dict.fromkeys(('documents', 'records', 'variables', 'conflicts_open'), 0),
                'pack_version': None, 'lens_version': None, 'created_at': now, 'updated_at': now,
                'revision': 1, 'create_request': data}
        try:
            self.table.put_item(Item=item, ConditionExpression='attribute_not_exists(PK)')
        except Exception as exc:
            if not conditional(exc):
                raise
            old = self.get(uid, pid)
            if not key or old.get('create_request') != data:
                fail(409, 'conflict', 'Idempotency-Key was used for another request')
            return project(old)
        return project(item)

    def list(self, uid, query):
        from boto3.dynamodb.conditions import Key
        if set(query) - {'cursor', 'limit'}:
            fail(400, 'invalid_request', 'Unknown query parameter')
        try:
            limit = int(query.get('limit', '20'))
            if not 1 <= limit <= 100:
                raise ValueError()
            args = {'KeyConditionExpression': Key('PK').eq('U#' + uid) & Key('SK').begins_with('P#'),
                    'Limit': limit, 'ConsistentRead': True}
            if 'cursor' in query:
                cursor = query['cursor']
                if not isinstance(cursor, str) or len(cursor) > 1024:
                    raise ValueError()
                key = json.loads(base64.b64decode(cursor, altchars=b'-_', validate=True))
                if (not isinstance(key, dict) or set(key) != {'PK', 'SK'} or key['PK'] != 'U#' + uid
                        or not isinstance(key['SK'], str) or not re.fullmatch(r'P#prj_[a-f0-9]{32,64}', key['SK'])):
                    raise ValueError()
                args['ExclusiveStartKey'] = key
        except (ValueError, TypeError, UnicodeError):
            fail(400, 'invalid_request', 'Invalid pagination')
        result = self.table.query(**args)
        last = result.get('LastEvaluatedKey')
        return {'items': [project(i) for i in result.get('Items', [])],
                'next_cursor': base64.urlsafe_b64encode(json.dumps(last).encode()).decode() if last else None}

    def patch(self, uid, pid, data):
        data = fields(data)
        item = self.get(uid, pid)
        if all(item[k] == v for k, v in data.items()):
            return project(item)
        if item['status'] in ('deleting', 'published') or item.get('published_files'):
            fail(409, 'conflict', 'Published intentions require lens regeneration')
        old_revision = item['revision']
        item.update(data)
        item['revision'] = old_revision + 1
        item['updated_at'] = stamp()
        try:
            self.table.put_item(Item=item, ConditionExpression='revision = :rev',
                                ExpressionAttributeValues={':rev': old_revision})
        except Exception as exc:
            if not conditional(exc):
                raise
            fail(409, 'conflict', 'Project changed; reload before editing')
        return project(item)


def conditional(exc):
    return getattr(exc, 'response', {}).get('Error', {}).get('Code') == 'ConditionalCheckFailedException'


@lru_cache(maxsize=1)
def store():
    import boto3
    return Projects(boto3.resource('dynamodb').Table(os.environ['DATA_TABLE']))


def deletions():
    try:
        from .deletions import service
    except ImportError:
        from deletions import service
    return service(store())


def handle(event):
    try:
        uid = identity(event)
        path = event.get('rawPath', '')
        method = event['requestContext']['http']['method']
        if path == '/projects':
            if method == 'GET':
                return 200, store().list(uid, event.get('queryStringParameters') or {})
            if method == 'POST':
                headers = {k.lower(): v for k, v in event.get('headers', {}).items()}
                return 201, store().create(uid, body(event), headers.get('idempotency-key'))
        else:
            source_text = re.fullmatch(r'/projects/(prj_[a-f0-9]{32,64})/documents/(doc_[a-f0-9]{32,64})/text', path)
            if source_text and method == 'GET':
                repository = store(); repository.get(uid, source_text[1])
                try:
                    from .schema_review import service as schema_service
                except ImportError:
                    from schema_review import service as schema_service
                return 200, schema_service(repository).source_text(uid, source_text[1], source_text[2], event.get('queryStringParameters') or {})
            manual = re.fullmatch(r'/projects/(prj_[a-f0-9]{32,64})/documents/(doc_[a-f0-9]{32,64})/proposal', path)
            if manual and method == 'POST':
                repository = store(); repository.get(uid, manual[1])
                try:
                    from .schema_review import service as schema_service
                except ImportError:
                    from schema_review import service as schema_service
                return 200, schema_service(repository).manual(uid, manual[1], manual[2], body(event))
            diagnostic_path = re.fullmatch(r'/projects/(prj_[a-f0-9]{32,64})/diagnostics', path)
            if diagnostic_path and method == 'GET':
                try:
                    from .schema_review import service as schema_service
                except ImportError:
                    from schema_review import service as schema_service
                return 200, schema_service(store()).diagnostics(uid, diagnostic_path[1])
            evidence_path = re.fullmatch(r'/projects/(prj_[a-f0-9]{32,64})/(records|conflicts|publish|pack|synthesis|proposals|claims|ask|analysis|paper-candidates|papers|lens)(?:/([^/]+)(/resolve|/review|/extract)?)?', path)
            if evidence_path:
                repository = store()
                repository.get(uid, evidence_path[1])
                try:
                    from .evidence import service as evidence_service
                except ImportError:
                    from evidence import service as evidence_service
                evidence = evidence_service(repository)
                pid, kind, identifier, resolution = evidence_path.groups()
                identifier = unquote(identifier) if identifier else None
                query = event.get('queryStringParameters') or {}
                if kind == 'lens' and not identifier:
                    if method == 'GET': return 200, evidence.lens(uid, pid)
                    if method == 'PUT': return 200, evidence.lens(uid, pid, body(event))
                if kind == 'paper-candidates':
                    if method == 'GET' and not identifier: return 200, evidence.papers(uid, pid)
                    if method == 'POST': return 200, evidence.papers(uid, pid, body(event), identifier)
                if kind == 'papers' and identifier and resolution == '/review' and method == 'POST':
                    return 200, evidence.papers(uid, pid, body(event), exclude_doc=identifier)
                if kind == 'papers' and identifier and resolution == '/extract' and method == 'POST':
                    return 202, evidence.extract_paper(uid, pid, identifier, body(event))
                if kind == 'proposals':
                    if method == 'GET': return 200, evidence.proposals(uid, pid, identifier, query=query)
                    if method == 'PUT' and identifier: return 200, evidence.proposals(uid, pid, identifier, body(event))
                    if method == 'DELETE' and identifier:
                        evidence.proposals(uid, pid, identifier, delete=True)
                        return 204, {}
                if kind == 'claims':
                    if method == 'GET' and not identifier: return 200, evidence.claims(uid, pid)
                    if method == 'POST' and not identifier: return 201, evidence.claims(uid, pid, body(event))
                    if method == 'DELETE' and identifier:
                        evidence.claims(uid, pid, body(event), identifier)
                        return 204, {}
                if kind in ('ask', 'analysis') and method == 'POST' and not identifier:
                    return 200, evidence.inference(uid, pid, kind, body(event))
                if kind == 'records' and method == 'GET' and not identifier:
                    return 200, evidence.list_records(uid, pid, query)
                if kind == 'records' and identifier and method in ('PATCH', 'DELETE'):
                    result = evidence.change(uid, pid, identifier, body(event), exclude=method == 'DELETE')
                    return (204, {}) if method == 'DELETE' else (200, result)
                if kind == 'conflicts' and method == 'GET' and not identifier:
                    return 200, evidence.conflicts(uid, pid, query)
                if kind == 'conflicts' and identifier and resolution and method == 'POST':
                    return 200, evidence.resolve(uid, pid, identifier, body(event))
                if kind == 'publish' and method == 'POST' and not identifier:
                    return 200, evidence.publish(uid, pid, body(event) if event.get('body') else {})
                if kind == 'pack' and method == 'GET' and not identifier:
                    return 200, evidence.files(uid, pid)
                if kind == 'synthesis' and method == 'POST' and not identifier:
                    return 200, evidence.synthesis(uid, pid, body(event))
                fail(405, 'method_not_allowed', 'Evidence method not available')
            schema_path = re.fullmatch(r'/projects/(prj_[a-f0-9]{32,64})/schema(/approve)?', path)
            if schema_path:
                try:
                    from .schema_review import service as schema_service
                except ImportError:
                    from schema_review import service as schema_service
                schemas = schema_service(store())
                if not schema_path[2] and method == 'GET':
                    return 200, schemas.get(uid, schema_path[1])
                if not schema_path[2] and method == 'PATCH':
                    return 200, schemas.patch(uid, schema_path[1], body(event))
                if schema_path[2] and method == 'POST':
                    return 200, schemas.approve(uid, schema_path[1], body(event))
                fail(405, 'method_not_allowed', 'Schema method not available')
            document = re.fullmatch(r'/projects/(prj_[a-f0-9]{32,64})/documents/(doc_[a-f0-9]{32,64})', path)
            if document and method == 'DELETE':
                return 204, deletions().delete_document(uid, document[1], document[2])
            documents = re.fullmatch(r'/projects/(prj_[a-f0-9]{32,64})/documents', path)
            completed = re.fullmatch(r'/projects/(prj_[a-f0-9]{32,64})/documents/(doc_[a-f0-9]{32,64})/complete', path)
            original = re.fullmatch(r'/projects/(prj_[a-f0-9]{32,64})/documents/(doc_[a-f0-9]{32,64})/url', path)
            jobs = re.fullmatch(r'/projects/(prj_[a-f0-9]{32,64})/jobs', path)
            resume = re.fullmatch(r'/projects/(prj_[a-f0-9]{32,64})/ingest/resume', path)
            if documents or completed or original or jobs or resume:
                # Authenticate/authorize before gate/configuration or signing.
                repository = store()
                pid = (documents or completed or original or jobs or resume)[1]
                repository.get(uid, pid)
                try:
                    from .upload_tickets import service
                except ImportError:
                    from upload_tickets import service
                headers = {k.lower(): v for k, v in event.get('headers', {}).items()}
                uploads = service(repository)
                if original and method == 'POST':
                    return 200, uploads.original_url(uid, pid, original[2], body(event))
                if jobs and method == 'GET':
                    return 200, uploads.jobs(uid, pid)
                if resume and method == 'POST':
                    return 202, uploads.resume(uid, pid, body(event) if event.get('body') else {})
                if completed and method == 'POST':
                    return 200, uploads.complete(uid, pid, completed[2], body(event))
                if documents and method == 'POST':
                    return 201, uploads.reserve(uid, pid, body(event), headers.get('idempotency-key'))
                if documents and method == 'GET':
                    return 200, uploads.list(uid, pid, event.get('queryStringParameters') or {})
                fail(405, 'method_not_allowed', 'Document method not available')
            match = re.fullmatch(r'/projects/(prj_[a-f0-9]{32,64})', path)
            if not match:
                fail(404, 'not_found', 'Project route not found')
            if method == 'GET':
                return 200, project(store().get(uid, match[1]))
            if method == 'PATCH':
                repository = store()
                parent = repository.get(uid, match[1])
                if not parent.get('published_files'):
                    return 200, repository.patch(uid, match[1], body(event))
                try:
                    from .evidence import service as evidence_service
                except ImportError:
                    from evidence import service as evidence_service
                return 200, evidence_service(repository).patch_project(uid, match[1], body(event))
            if method == 'DELETE':
                return 204, deletions().delete_project(uid, match[1])
        fail(405, 'method_not_allowed', 'Method not available in this release')
    except ApiError as exc:
        return exc.status, {'error': {'code': exc.code, 'message': exc.message,
                                   **({'details': exc.details} if exc.details is not None else {})}}
    except Exception as exc:
        print(json.dumps({'event': 'project_error', 'type': type(exc).__name__,
            'code': getattr(exc, 'response', {}).get('Error', {}).get('Code', '')}), flush=True)
        return 500, {'error': {'code': 'internal', 'message': 'Project service unavailable'}}
