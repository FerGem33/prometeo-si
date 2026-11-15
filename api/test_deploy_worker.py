"""T34 deployment orchestration with AWS doubles; not live AWS/idempotency evidence."""
import copy
import json

import pytest
from infra import deploy_worker as dw

ENV = {'DATA_TABLE': 'prometeo-hack-data', 'DATA_TABLE_ARN': dw.TABLE_ARN, 'CORPUS_BUCKET': dw.BUCKET,
       'INGEST_QUEUE_ARN': dw.QUEUE_ARN, 'INGEST_QUEUE_URL': dw.QUEUE_URL, 'MODEL_ID': dw.APPROVED_MODEL}
PROFILE_ARN = 'arn:aws:bedrock:us-east-1:352818909129:inference-profile/' + dw.APPROVED_MODEL
MODEL_ARNS = ['arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0']


class AWS:
    def __init__(self):
        self.role = None
        self.function = None
        self.mappings = {}
        self.policy = None
        self.writes = []
        self.visibility = '960'
        self.role_propagation_failures = 0
        self.root = False

    def __call__(self, *args):
        service, action = args[:2]
        flags = [a for a in args[2:] if a in ('--enabled', '--no-enabled')]
        rest = [a for a in args[2:] if a not in flags]
        opts = dict(zip(rest[::2], rest[1::2]))
        if action == 'get-caller-identity':
            return {'Account': dw.ACCOUNT, 'Arn': 'arn:aws:iam::352818909129:root' if self.root
                    else 'arn:aws:sts::352818909129:assumed-role/AWSReservedSSO_Prometeo/user'}
        if action == 'get-queue-attributes':
            return {'Attributes': {'VisibilityTimeout': self.visibility, 'RedrivePolicy': json.dumps(
                {'deadLetterTargetArn': 'arn:aws:sqs:us-east-1:352818909129:prometeo-hack-ingest-dlq', 'maxReceiveCount': '3'})}}
        if action == 'get-inference-profile':
            return {'inferenceProfileId': dw.APPROVED_MODEL, 'inferenceProfileArn': PROFILE_ARN,
                    'models': [{'modelArn': a} for a in MODEL_ARNS]}
        if action == 'get-role':
            if not self.role:
                raise dw.AWSError(args, 'NoSuchEntity', 254)
            return {'Role': copy.deepcopy(self.role)}
        if action == 'get-function-configuration':
            if not self.function:
                raise dw.AWSError(args, 'ResourceNotFoundException', 254)
            return copy.deepcopy(self.function)
        if action == 'get-event-source-mapping':
            return copy.deepcopy(self.mappings[opts['--uuid']])
        if action == 'wait':
            return {}
        self.writes.append(action)
        if action == 'create-role':
            self.role = {'Arn': dw.ROLE_ARN, 'AssumeRolePolicyDocument': json.loads(opts['--assume-role-policy-document'])}
        elif action == 'attach-role-policy':
            assert opts['--policy-arn'] == dw.BASIC_POLICY
        elif action == 'put-role-policy':
            self.policy = json.loads(opts['--policy-document'])
        elif action == 'create-function':
            if self.role_propagation_failures:
                self.role_propagation_failures -= 1
                raise dw.AWSError(args, 'InvalidParameterValueException', 254)
            assert opts['--handler'] == 'ingest_worker.handler' and opts['--runtime'] == 'python3.12'
            self.function = {'FunctionArn': dw.FUNCTION_ARN, 'Role': opts['--role'], 'RevisionId': 'r1',
                             'Environment': json.loads(opts['--environment'])}
        elif action == 'update-function-configuration':
            assert opts['--revision-id'] == self.function['RevisionId']
            self.function['Environment'] = json.loads(opts['--environment'])
            self.function['RevisionId'] = 'r2'
        elif action == 'create-event-source-mapping':
            if any(m['EventSourceArn'] == opts['--event-source-arn'] for m in self.mappings.values()):
                raise dw.AWSError(args, 'ResourceConflictException', 254)
            uuid = f'uuid-{len(self.mappings) + 1}'
            self.mappings[uuid] = {'UUID': uuid, 'EventSourceArn': opts['--event-source-arn'],
                                   'FunctionArn': dw.FUNCTION_ARN, 'BatchSize': int(opts['--batch-size']),
                                   'State': 'Enabled' if '--enabled' in flags else 'Disabled'}
            return self.mappings[uuid]
        elif action == 'update-event-source-mapping':
            m = self.mappings[opts['--uuid']]
            assert opts['--batch-size'] == '1' and opts['--function-response-types'] == 'ReportBatchItemFailures'
            if flags:
                m['State'] = 'Enabled' if flags[0] == '--enabled' else 'Disabled'
        return {}


@pytest.fixture
def prepared(tmp_path):
    for name, value in dw.documents(ENV).items():
        (tmp_path / name).write_text(json.dumps(value))
    outputs = tmp_path / 'outputs.env'
    outputs.write_text('export CF_URL="https://example.cloudfront.net"\n')
    return tmp_path, outputs


def run(root, outputs, fake, enable=None, env=ENV):
    return dw.configure(root, dict(env), 'C:/tmp/worker.zip', enable, call=fake, outputs=outputs, sleep=lambda s: None)


def env_from(outputs):
    env = dict(ENV)
    for line in outputs.read_text().splitlines():
        key, _, value = line.removeprefix('export ').partition('=')
        env[key] = value.strip('"')
    return env


def test_prepare_has_no_wildcard_resources_and_d3_limits():
    docs = dw.documents(ENV)
    for statement in docs['worker-policy.json']['Statement']:
        resources = statement['Resource'] if isinstance(statement['Resource'], list) else [statement['Resource']]
        assert all(r != '*' for r in resources)
    assert json.loads(docs['worker-env.json']['UPLOAD_LIMITS_JSON']) == {'max_bytes': 20000000, 'max_pages': 60, 'max_documents': 30}
    assert docs['worker-mapping.json']['BatchSize'] == 1


def test_first_run_creates_disabled_mapping_and_second_run_reuses_everything(prepared):
    root, outputs = prepared
    fake = AWS()
    uuid = run(root, outputs, fake)
    assert fake.mappings[uuid]['State'] == 'Disabled'
    assert fake.writes.count('create-role') == 1 and fake.writes.count('create-function') == 1
    text = outputs.read_text()
    assert 'CF_URL' in text and f'WORKER_MAPPING_UUID="{uuid}"' in text
    invoke = next(s for s in fake.policy['Statement'] if s['Sid'] == 'InvokeApprovedModel')
    assert invoke['Resource'] == [PROFILE_ARN, *MODEL_ARNS]
    # Second run: nothing created again, mapping state unchanged, outputs not duplicated.
    fake.writes.clear()
    assert run(root, outputs, fake, env=env_from(outputs)) == uuid
    assert not {'create-role', 'create-function', 'create-event-source-mapping'} & set(fake.writes)
    assert len(fake.mappings) == 1 and fake.mappings[uuid]['State'] == 'Disabled'
    assert outputs.read_text().count('WORKER_MAPPING_UUID') == 1


def test_enable_and_disable_are_explicit(prepared):
    root, outputs = prepared
    fake = AWS()
    uuid = run(root, outputs, fake)
    run(root, outputs, fake, enable=True, env=env_from(outputs))
    assert fake.mappings[uuid]['State'] == 'Enabled'
    run(root, outputs, fake, env=env_from(outputs))
    assert fake.mappings[uuid]['State'] == 'Enabled'
    run(root, outputs, fake, enable=False, env=env_from(outputs))
    assert fake.mappings[uuid]['State'] == 'Disabled'


def test_existing_function_keeps_unrelated_variables(prepared):
    root, outputs = prepared
    fake = AWS()
    run(root, outputs, fake)
    fake.function['Environment']['Variables']['EXTRA'] = 'kept'
    run(root, outputs, fake, env=env_from(outputs))
    assert fake.function['Environment']['Variables']['EXTRA'] == 'kept'
    assert fake.function['Environment']['Variables']['MODEL_ID'] == dw.APPROVED_MODEL


def test_retries_only_role_propagation_on_new_role(prepared):
    root, outputs = prepared
    fake = AWS()
    fake.role_propagation_failures = 2
    run(root, outputs, fake)
    assert fake.function


def test_lost_uuid_stops_instead_of_duplicating_mapping(prepared):
    root, outputs = prepared
    fake = AWS()
    run(root, outputs, fake)
    with pytest.raises(ValueError, match='WORKER_MAPPING_UUID is empty'):
        run(root, outputs, fake)  # ENV without the recorded UUID
    assert len(fake.mappings) == 1


@pytest.mark.parametrize('change, message', [
    (lambda f: setattr(f, 'root', True), 'non-root'),
    (lambda f: setattr(f, 'visibility', '300'), 'visibility'),
])
def test_preflight_rejects_unsafe_account_or_queue(prepared, change, message):
    root, outputs = prepared
    fake = AWS()
    change(fake)
    with pytest.raises(ValueError, match=message):
        run(root, outputs, fake)
    assert fake.writes == []


def test_existing_role_or_function_that_differs_is_not_replaced(prepared):
    root, outputs = prepared
    fake = AWS()
    fake.role = {'Arn': dw.ROLE_ARN, 'AssumeRolePolicyDocument': {'Statement': []}}
    with pytest.raises(ValueError, match='role differs'):
        run(root, outputs, fake)
    fake = AWS()
    run(root, outputs, fake)
    fake.function['Role'] = 'arn:aws:iam::352818909129:role/other'
    with pytest.raises(ValueError, match='differs'):
        run(root, outputs, fake, env=env_from(outputs))


def test_rejects_unapproved_model_or_outputs():
    with pytest.raises(ValueError, match='MODEL_ID'):
        dw.documents({**ENV, 'MODEL_ID': 'us.anthropic.claude-haiku-5-5'})
    with pytest.raises(ValueError, match='CORPUS_BUCKET'):
        dw.documents({**ENV, 'CORPUS_BUCKET': 'other'})
