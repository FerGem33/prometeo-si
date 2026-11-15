"""Owner-scoped saved proposals, reviewed claims, and lens-only revisions.

Uses the existing comparison validators; no second ranking/evidence engine.
"""
import copy
import json
import re

try:
    from .projects import fail, stamp, project, fields, conditional
except ImportError:
    from projects import fail, stamp, project, fields, conditional


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', value):
        fail(400, 'invalid_request', 'Invalid proposal identifier')


class Workspace:
    def proposal_write(self, pid, parent, operation, arguments):
        from boto3.dynamodb.types import TypeSerializer
        encode = TypeSerializer().serialize
        child = {'TableName': self.table.name, **arguments}
        for field in ('Key', 'Item', 'ExpressionAttributeValues'):
            if field in child: child[field] = {k: encode(v) for k, v in child[field].items()}
        try:
            self.schemas.tx.transact_write_items(TransactItems=[{'Update': {
                'TableName': self.table.name, 'Key': {k: encode(parent[k]) for k in ('PK', 'SK')},
                'UpdateExpression': 'SET revision = revision + :one, updated_at = :now',
                'ConditionExpression': 'revision = :revision AND #status <> :deleting',
                'ExpressionAttributeNames': {'#status': 'status'},
                'ExpressionAttributeValues': {k: encode(v) for k, v in {':one': 1, ':now': stamp(),
                    ':revision': parent['revision'], ':deleting': 'deleting'}.items()}}}, {operation: child}])
        except Exception as exc:
            if getattr(exc, 'response', {}).get('Error', {}).get('Code') == 'TransactionCanceledException':
                fail(409, 'conflict', 'Project or proposal changed; reload')
            raise

    def published(self, uid, pid):
        self.files(uid, pid)
        parent = self.projects.get(uid, pid)
        if parent['status'] == 'deleting': fail(409, 'conflict', 'Project is being deleted')
        return parent, self.schemas.load(parent['published_files']['pack'])

    def proposals(self, uid, pid, vid=None, data=None, delete=False, query=None):
        parent, pack = self.published(uid, pid)
        try:
            from .handler import schema, scenario
        except ImportError:
            from handler import schema, scenario
        key = {'PK': 'P#'+pid, 'SK': 'V#'+vid} if vid else None
        if vid:
            identifier(vid)
            old = self.table.get_item(Key=key, ConsistentRead=True).get('Item')
            if delete:
                self.proposal_write(pid, parent, 'Delete', {'Key': key})
                return None
            if data is None:
                if not old: fail(404, 'not_found', 'Proposal not found')
                return json.loads(old['payload'])
            if (not isinstance(data, dict) or set(data) != {'name', 'scenario'}
                    or not isinstance(data['name'], str) or not 1 <= len(data['name'].strip()) <= 200):
                fail(400, 'invalid_request', 'Expected proposal name and scenario')
            try:
                scenario(data['scenario'], schema(pack))
            except (ValueError, KeyError, TypeError):
                fail(400, 'invalid_request', 'Scenario does not match the published schema')
            previous = json.loads(old['payload']) if old else None
            data = {**data, 'name': data['name'].strip()}
            if (previous and all(previous[k] == v for k, v in data.items())
                    and previous['pack_version'] == int(parent['pack_version'])
                    and previous['lens_version'] == int(parent['lens_version'])):
                return previous
            now = stamp()
            result = {'id': vid, 'name': data['name'].strip(), 'scenario': copy.deepcopy(data['scenario']),
                'created_at': previous['created_at'] if previous else now, 'updated_at': now,
                'pack_version': int(parent['pack_version']), 'lens_version': int(parent['lens_version'])}
            args = {'Item': {**key, 'payload': json.dumps(result, allow_nan=False), 'revision': int(old['revision'])+1 if old else 1},
                    'ConditionExpression': 'revision = :old' if old else 'attribute_not_exists(PK)'}
            if old: args['ExpressionAttributeValues'] = {':old': old['revision']}
            try:
                self.proposal_write(pid, parent, 'Put', args)
            except Exception as exc:
                if conditional(exc): fail(409, 'conflict', 'Proposal changed; reload')
                raise
            return result
        from boto3.dynamodb.conditions import Key
        query = query or {}
        try:
            if set(query)-{'cursor', 'limit'}: raise ValueError()
            limit = int(query.get('limit', '20'))
            if not 1 <= limit <= 100: raise ValueError()
            args = {'KeyConditionExpression': Key('PK').eq('P#'+pid) & Key('SK').begins_with('V#'),
                    'Limit': limit, 'ConsistentRead': True}
            if 'cursor' in query:
                identifier(query['cursor'])
                args['ExclusiveStartKey'] = {'PK': 'P#'+pid, 'SK': 'V#'+query['cursor']}
        except (TypeError, ValueError):
            fail(400, 'invalid_request', 'Invalid proposal pagination')
        result = self.table.query(**args)
        last = result.get('LastEvaluatedKey')
        return {'items': [json.loads(i['payload']) for i in result.get('Items', [])],
                'next_cursor': last['SK'][2:] if last else None}

    def inference(self, uid, pid, kind, data):
        _, pack = self.published(uid, pid)
        try:
            from .handler import handler
        except ImportError:
            from handler import handler
        if kind == 'ask':
            if not isinstance(data, dict) or not {'question'} <= set(data) or set(data)-{'question', 'version'}:
                fail(400, 'invalid_request', 'Expected question and optional version')
            data = {**data, 'schema': pack['schema']}
        result = handler({'rawPath': '/'+kind, 'requestContext': {'http': {'method': 'POST'}},
                          'headers': {}, 'body': json.dumps(data)}, source_pack=pack)
        value = json.loads(result['body'])
        if result['statusCode'] != 200:
            fail(result['statusCode'], 'model_unavailable' if result['statusCode'] == 502 else 'invalid_request',
                 'Project question service unavailable' if result['statusCode'] == 502 else 'Invalid project inference request')
        return value

    def claims(self, uid, pid, data=None, cid=None):
        parent, _, documents, _, _, state = self.context(uid, pid)
        if data is None:
            return {'items': state['claims'], 'next_cursor': None}
        try:
            if cid is None:
                if not isinstance(data, dict) or set(data) != {'claim', 'reason'}: raise ValueError('Expected claim and reason')
                updated = self.record_review.apply(state, documents, [{'op': 'claim', **data}], state['version'], uid)
            else:
                if not isinstance(data, dict) or set(data) != {'reason'}: raise ValueError('Expected exclusion reason')
                if not isinstance(data['reason'], str) or not 1 <= len(data['reason'].strip()) <= 4000: raise ValueError('Invalid reason')
                if not any(c['id'] == cid for c in state['claims']): fail(404, 'not_found', 'Claim not found')
                updated = copy.deepcopy(state)
                updated['claims'] = [c for c in state['claims'] if c['id'] != cid]
                updated['version'] += 1; updated['previous_sha256'] = state['review_sha256']
                updated['history'].append({'change': {'op': 'exclude_claim', 'id': cid}, 'by': uid, 'at': stamp(), **data})
                self.record_review.seal(updated)
        except (ValueError, KeyError, TypeError) as exc:
            fail(400, 'invalid_request', str(exc))
        self.persist_review(uid, pid, parent, updated)
        return updated['claims'][-1] if cid is None else None

    def patch_project(self, uid, pid, data):
        data = fields(data)
        parent = self.projects.get(uid, pid)
        if parent['status'] == 'deleting': fail(409, 'conflict', 'Project is being deleted')
        if all(parent[k] == v for k, v in data.items()): return project(parent)
        if 'intent' not in data or data['intent'] == parent['intent'] or not parent.get('published_files'):
            # Changing an un-published intention never grants schema/metadata approval.
            old_revision = parent['revision']; parent.update(data, updated_at=stamp(), revision=old_revision+1)
            try:
                self.table.put_item(Item=parent, ConditionExpression='revision = :old', ExpressionAttributeValues={':old': old_revision})
            except Exception as exc:
                if conditional(exc): fail(409, 'conflict', 'Project changed; reload')
                raise
            return project(parent)
        self.files(uid, pid)
        lens = self.schemas.load(parent['published_files']['lens'])
        # Regenerate presentation/selection only; no new facts, thresholds or extraction.
        lens = copy.deepcopy(lens); lens['title'] = data['intent'][:200]
        lens['intent'] = data['intent']; lens['lens_version'] = int(parent['lens_version'])+1
        lens['intent_review'] = {'by': uid, 'at': stamp(), 'reason': 'Owner changed research intent; source values and comparison criteria retained.'}
        pack = self.schemas.load(parent['published_files']['pack'])
        mentioned = [v['id'] for v in pack['schema']['variables']
                     if v['label'].casefold() in data['intent'].casefold() or v['id'].casefold() in data['intent'].casefold()]
        if mentioned:
            numeric = [v['id'] for v in pack['schema']['variables'] if v['id'] in mentioned and v['type'] == 'num']
            lens['default_axes'] = (numeric + [v for v in lens['default_axes'] if v not in numeric])[:len(lens['default_axes'])]
            for preset in lens['presets']:
                chosen = [v for v in preset['active'] if v in mentioned]
                if chosen: preset['active'] = chosen
        base_signature = parent.get('published_base_signature', parent['published_signature'])
        override_key = f'u/{uid}/p/{pid}/text/reviews/lens-{self.digest(lens)}.json'
        signature = self.digest([base_signature, override_key])
        prefix = f'u/{uid}/p/{pid}/pack/v{int(parent["pack_version"])}/{signature}/'
        keys = {name: prefix+name+'.json' for name in ('pack', 'lens', 'mapping')}
        for name, key in keys.items():
            self.save_json(key, lens if name == 'lens' else self.schemas.load(parent['published_files'][name]))
        self.save_json(override_key, lens)
        old_revision = parent['revision']
        parent.update(data, published_files=keys, published_signature=signature, lens_version=lens['lens_version'],
                      lens_override_key=override_key, published_base_signature=base_signature,
                      updated_at=stamp(), revision=old_revision+1)
        try:
            self.table.put_item(Item=parent, ConditionExpression='revision = :old', ExpressionAttributeValues={':old': old_revision})
        except Exception as exc:
            if conditional(exc): fail(409, 'conflict', 'Project changed; reload')
            raise
        return project(parent)

    def lens(self, uid, pid, data=None):
        parent, approval, documents, extraction, metadata, state = self.context(uid, pid)
        if data is None:
            value = self.schemas.load(parent['lens_override_key']) if parent.get('lens_override_key') else metadata['lens']
            return {'lens': value, 'lens_version': int(parent.get('lens_version') or 0), 'draft': parent['status'] != 'published'}
        if (not isinstance(data, dict) or set(data) != {'version', 'lens', 'reason'}
                or type(data['version']) is not int or data['version'] != int(parent.get('lens_version') or 0)):
            fail(409, 'conflict', 'Reload the current lens version before reviewing')
        if not isinstance(data['lens'], dict) or not isinstance(data['reason'], str) or not 1 <= len(data['reason'].strip()) <= 4000:
            fail(400, 'invalid_request', 'Expected reviewed lens and reason')
        value = copy.deepcopy(data['lens'])
        request_hash = self.digest([approval['schema_sha256'], value, data['reason']])
        if parent.get('lens_request_sha256') == request_hash:
            return {'lens_version': int(parent.get('lens_version') or 0)+1, 'draft': True}
        value['intent_review'] = {'by': uid, 'at': stamp(), 'reason': data['reason'].strip()}
        try:
            effective = self.publisher.approve_metadata({k: (value if k == 'lens' else metadata[k])
                for k in ('id', 'documents', 'lens', 'thresholds')}, documents, uid, value['intent_review']['at'], data['reason'].strip())
            self.publisher.build(approval, documents, extraction, effective, int(parent.get('pack_version') or 0)+1,
                int(parent.get('lens_version') or 0)+1, state)
        except (ValueError, KeyError, TypeError) as exc: fail(400, 'invalid_request', 'Lens review: '+str(exc))
        key = f'u/{uid}/p/{pid}/text/reviews/lens-{self.digest(value)}.json'
        self.save_json(key, value)
        try:
            self.table.update_item(Key={'PK': 'U#'+uid, 'SK': 'P#'+pid},
                UpdateExpression='SET lens_override_key = :key, lens_request_sha256 = :hash, #status = :ready, revision = revision + :one, updated_at = :now',
                ConditionExpression='revision = :revision AND #status <> :deleting',
                ExpressionAttributeNames={'#status': 'status'}, ExpressionAttributeValues={':key': key, ':hash': request_hash,
                    ':ready': 'ready_to_publish', ':one': 1, ':now': stamp(), ':revision': parent['revision'], ':deleting': 'deleting'})
        except Exception as exc:
            if conditional(exc): fail(409, 'conflict', 'Project changed; reload')
            raise
        return {'lens_version': int(parent.get('lens_version') or 0)+1, 'draft': True}
