"""Deployment orchestration doubles; not live AWS/idempotency evidence."""
import copy
import json
import sys

import pytest
from infra import deploy_projects, prepare_projects


class AWS:
    def __init__(self, env):
        self.env = env
        self.authorizers = []
        self.routes = []
        self.statements = []
        self.variables = {'MODEL_ID': 'configured-model', 'CF_URL': env['CF_URL'], 'EXISTING': 'preserved'}
        self.writes = []
        self.root = False
        self.auto = True

    def __call__(self, *args):
        service, action = args[:2]
        opts = dict(zip(args[2::2], args[3::2]))
        if action == 'get-caller-identity':
            return {'Account': '352818909129', 'Arn': 'arn:aws:iam::352818909129:root' if self.root else 'arn:aws:sts::352818909129:assumed-role/deploy/user'}
        if action == 'get-api':
            return {'Name': 'prometeo-hack-api'}
        if action == 'get-stage':
            return {'AutoDeploy': self.auto}
        if action == 'get-function-configuration':
            return {'Role': self.env['API_ROLE_ARN'], 'RevisionId': 'revision-1', 'Environment': {'Variables': copy.deepcopy(self.variables)}}
        if action == 'get-integrations':
            return {'Items': [{'IntegrationUri': self.env['FUNCTION_ARN'], 'PayloadFormatVersion': '2.0', 'IntegrationId': 'integration'}]}
        if action == 'get-authorizers':
            return {'Items': copy.deepcopy(self.authorizers)}
        if action == 'get-routes':
            return {'Items': copy.deepcopy(self.routes)}
        if action == 'get-policy':
            return {'Policy': json.dumps({'Statement': self.statements})}
        if action == 'wait':
            return {}
        self.writes.append(args)
        if action == 'create-authorizer':
            a = json.loads(opts['--cli-input-json'])
            a['AuthorizerId'] = 'auth-1'
            self.authorizers.append(a)
            return a
        if action == 'create-route':
            assert opts['--authorization-type'] == 'JWT'
            self.routes.append({'RouteKey': opts['--route-key'], 'RouteId': 'r'+str(len(self.routes)),
                                'Target': opts['--target'], 'AuthorizationType': 'JWT',
                                'AuthorizerId': opts['--authorizer-id']})
        elif action == 'update-route':
            assert opts['--authorization-type'] == 'JWT'
        elif action == 'add-permission':
            self.statements.append({'Sid': opts['--statement-id'], 'Principal': {'Service': opts['--principal']},
                'Condition': {'ArnLike': {'AWS:SourceArn': opts['--source-arn']},
                              'StringEquals': {'AWS:SourceAccount': opts['--source-account']}}})
        elif action == 'update-function-configuration':
            assert opts['--revision-id'] == 'revision-1'
            self.variables = json.loads(opts['--environment'])['Variables']
        elif action == 'put-role-policy':
            p = json.loads(opts['--policy-document'])
            assert p['Statement'][0]['Resource'] == self.env['DATA_TABLE_ARN']
        elif action == 'update-api':
            assert json.loads(opts['--cors-configuration'])['AllowOrigins'] == [self.env['CF_URL']]
        elif action == 'put-bucket-cors':
            cors = json.loads(opts['--cors-configuration'])
            assert 'if-none-match' in cors['CORSRules'][0]['AllowedHeaders']
            assert cors['CORSRules'][0]['AllowedMethods'] == ['PUT']
        else:
            raise AssertionError('Unexpected operation ' + action)
        return {}


@pytest.fixture
def config(tmp_path, monkeypatch):
    env = {'DATA_TABLE': 'prometeo-hack-data',
           'DATA_TABLE_ARN': 'arn:aws:dynamodb:us-east-1:352818909129:table/prometeo-hack-data',
           'USER_POOL_ID': 'us-east-1_Test', 'USER_POOL_CLIENT_ID': 'client1', 'API_ID': 'api1',
           'FUNCTION_ARN': 'arn:aws:lambda:us-east-1:352818909129:function:prometeo-hack-api',
           'API_ROLE_ARN': 'arn:aws:iam::352818909129:role/prometeo-hack-api-role',
           'CF_URL': 'https://web.test'}
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    monkeypatch.setattr(sys, 'argv', ['prepare', '--output-dir', str(tmp_path)])
    prepare_projects.main()
    return tmp_path, env, AWS(env)


def test_two_runs_reuse_resources_and_preserve_env(config):
    root, env, aws = config
    deploy_projects.configure(root, env, aws)
    deploy_projects.configure(root, env, aws)
    assert len(aws.authorizers) == 1 and len(aws.routes) == 4 and len(aws.statements) == 4
    assert aws.variables['EXISTING'] == 'preserved'
    assert aws.variables['MODEL_ID'] == 'configured-model'
    assert aws.variables['DATA_TABLE'] == env['DATA_TABLE']
    assert not any(a[1].startswith('delete') for a in aws.writes)
    assert all('projects' in r['RouteKey'] for r in aws.routes)


@pytest.mark.parametrize('problem', ['root', 'stage', 'function', 'role'])
def test_preflight_fails_before_writes(config, problem):
    root, env, aws = config
    if problem == 'root':
        aws.root = True
    elif problem == 'stage':
        aws.auto = False
    elif problem == 'function':
        env['FUNCTION_ARN'] += '-other'
    else:
        env['API_ROLE_ARN'] += '-other'
    with pytest.raises(ValueError):
        deploy_projects.configure(root, env, aws)
    assert not aws.writes


def test_refuses_authorizer_replacement(config):
    root, env, aws = config
    a = json.loads((root/'projects-authorizer.json').read_text())
    a.update({'AuthorizerId': 'existing', 'JwtConfiguration': {'Issuer': 'another'}})
    aws.authorizers = [a]
    with pytest.raises(ValueError, match='differs'):
        deploy_projects.configure(root, env, aws)
    assert not aws.writes


def test_refuses_changed_permission_and_no_env_activation(config):
    root, env, aws = config
    deploy_projects.configure(root, env, aws)
    aws.statements[0]['Condition']['ArnLike']['AWS:SourceArn'] = 'different'
    aws.writes.clear()
    with pytest.raises(ValueError, match='permission differs'):
        deploy_projects.configure(root, env, aws)
    assert not any(a[1] == 'update-function-configuration' for a in aws.writes)


def test_refuses_unexpected_route_integration(config):
    root, env, aws = config
    deploy_projects.configure(root, env, aws)
    aws.routes[0]['Target'] = 'integrations/another-service'
    aws.writes.clear()
    with pytest.raises(ValueError, match='project route differs'):
        deploy_projects.configure(root, env, aws)
    assert not aws.writes


def test_upload_configuration_reuses_jwt_and_limits_permissions(config, monkeypatch):
    root, env, aws = config
    values = {'CORPUS_BUCKET': 'prometeo-hack-corpus-352818909129',
              'INGEST_QUEUE_ARN': 'arn:aws:sqs:us-east-1:352818909129:prometeo-hack-ingest',
              'INGEST_QUEUE_URL': 'https://sqs.us-east-1.amazonaws.com/352818909129/prometeo-hack-ingest'}
    for k, v in values.items():
        monkeypatch.setenv(k, v)
    output = root/'uploads'
    monkeypatch.setattr(sys, 'argv', ['prepare', '--output-dir', str(output), '--uploads'])
    prepare_projects.main()
    deploy_projects.configure(output, env, aws)
    deploy_projects.configure(output, env, aws)
    assert len(aws.routes) == 9 and len(aws.authorizers) == 1 and len(aws.statements) == 9
    assert aws.variables['UPLOADS_ENABLED'] == 'true'
    assert json.loads(aws.variables['UPLOAD_LIMITS_JSON'])['max_bytes'] == 20000000
    policy = json.loads((output/'projects-policy.json').read_text())
    assert all(s['Resource'] != '*' for s in policy['Statement'])
