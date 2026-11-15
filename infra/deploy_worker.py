"""T34: idempotent worker deployment (role, Lambda, SQS mapping). Default: prepare only, no AWS calls.

Creates only the resources named for T34 in docs/PLAN_FASE2.md:
  - role     prometeo-hack-worker-role (AWSLambdaBasicExecutionRole + scoped inline policy)
  - Lambda   prometeo-hack-worker (Python 3.12 arm64, handler ingest_worker.handler)
  - mapping  prometeo-hack-ingest -> prometeo-hack-worker, created DISABLED (batch 1, partial failures)
Never deletes or replaces resources. Existing resources that differ stop the script for review.
Package first with infra/package_worker.sh. See docs/T34_WORKER_PREPARACION.md.
"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

ACCOUNT = '352818909129'
REGION = 'us-east-1'
NAME = 'prometeo-hack-worker'
ROLE_NAME = NAME + '-role'
ROLE_ARN = f'arn:aws:iam::{ACCOUNT}:role/{ROLE_NAME}'
FUNCTION_ARN = f'arn:aws:lambda:{REGION}:{ACCOUNT}:function:{NAME}'
TABLE_ARN = f'arn:aws:dynamodb:{REGION}:{ACCOUNT}:table/prometeo-hack-data'
BUCKET = f'prometeo-hack-corpus-{ACCOUNT}'
QUEUE_ARN = f'arn:aws:sqs:{REGION}:{ACCOUNT}:prometeo-hack-ingest'
QUEUE_URL = f'https://sqs.{REGION}.amazonaws.com/{ACCOUNT}/prometeo-hack-ingest'
APPROVED_MODEL = 'us.anthropic.claude-haiku-4-5-20251001-v1:0'  # D6; must equal infra/config.env MODEL_ID
BASIC_POLICY = 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
LIMITS = {'max_bytes': 20000000, 'max_pages': 60, 'max_documents': 30}  # D3, approved 2026-11-15
TIMEOUT = 120
MEMORY = 1024
MAX_CONCURRENCY = 2  # SQS mapping minimum; also bounds parallel model calls
OUTPUT_KEYS = ('WORKER_FUNCTION_ARN', 'WORKER_ROLE_ARN', 'WORKER_MAPPING_UUID')


class AWSError(RuntimeError):
    def __init__(self, args, code, exit_code):
        super().__init__(f'AWS {args[0]} {args[1]} failed ({code}); exit {exit_code}')
        self.code = code


def aws(*args):
    command = ['aws', *args, '--profile', 'prometeo', '--region', REGION, '--no-cli-pager', '--output', 'json']
    result = subprocess.run(command, check=False, capture_output=True, text=True)
    if result.returncode:
        # Do not dump the command or payload; show only the service error code.
        match = re.search(r'\((\w+)\) when calling', result.stderr)
        raise AWSError(args, match[1] if match else 'CLIError', result.returncode)
    return json.loads(result.stdout) if result.stdout.strip() else {}


def check_env(env):
    expected = {'DATA_TABLE': 'prometeo-hack-data', 'DATA_TABLE_ARN': TABLE_ARN, 'CORPUS_BUCKET': BUCKET,
                'INGEST_QUEUE_ARN': QUEUE_ARN, 'INGEST_QUEUE_URL': QUEUE_URL, 'MODEL_ID': APPROVED_MODEL}
    for key, value in expected.items():
        if env.get(key) != value:
            raise ValueError(f'{key} differs from T31/D6 outputs; source infra/config.env and infra/outputs.env')


def documents(env):
    """Pure: everything that will be sent, for review before --apply."""
    check_env(env)
    trust = {'Version': '2012-10-17', 'Statement': [{'Effect': 'Allow',
             'Principal': {'Service': 'lambda.amazonaws.com'}, 'Action': 'sts:AssumeRole'}]}
    policy = {'Version': '2012-10-17', 'Statement': [
        {'Sid': 'ProjectAndDocumentState', 'Effect': 'Allow',
         'Action': ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:Query'],
         'Resource': TABLE_ARN},
        {'Sid': 'ReadUploadedOriginals', 'Effect': 'Allow', 'Action': 's3:GetObject',
         'Resource': f'arn:aws:s3:::{BUCKET}/u/*/p/*/raw/*'},
        {'Sid': 'ReadWriteWorkerArtifacts', 'Effect': 'Allow', 'Action': ['s3:GetObject', 's3:PutObject'],
         'Resource': f'arn:aws:s3:::{BUCKET}/u/*/p/*/text/*'},
        # Without ListBucket, S3 answers a missing cache object with 403 instead of 404 and the worker
        # would fail every first model call (read_json treats only NoSuchKey/404 as "not cached").
        # ListBucket cannot be limited by object prefix for that check; it is limited to this bucket.
        {'Sid': 'DistinguishMissingCacheObjects', 'Effect': 'Allow', 'Action': 's3:ListBucket',
         'Resource': f'arn:aws:s3:::{BUCKET}'},
        {'Sid': 'ConsumeIngestQueue', 'Effect': 'Allow',
         'Action': ['sqs:ReceiveMessage', 'sqs:DeleteMessage', 'sqs:GetQueueAttributes', 'sqs:ChangeMessageVisibility'],
         'Resource': QUEUE_ARN},
        # Bedrock resources are filled from the approved inference profile at apply time.
        {'Sid': 'InvokeApprovedModel', 'Effect': 'Allow', 'Action': 'bedrock:InvokeModel', 'Resource': []}]}
    environment = {'DATA_TABLE': env['DATA_TABLE'], 'CORPUS_BUCKET': BUCKET, 'MODEL_ID': env['MODEL_ID'],
                   'UPLOAD_LIMITS_JSON': json.dumps(LIMITS)}
    mapping = {'BatchSize': 1, 'FunctionResponseTypes': ['ReportBatchItemFailures'],
               'ScalingConfig': {'MaximumConcurrency': MAX_CONCURRENCY}}
    return {'worker-trust.json': trust, 'worker-policy.json': policy,
            'worker-env.json': environment, 'worker-mapping.json': mapping}


def write_outputs(path, values):
    lines = [line for line in path.read_text().splitlines()
             if not any(line.startswith(f'export {key}=') for key in values)]
    lines.extend(f'export {key}="{value}"' for key, value in values.items())
    path.write_text('\n'.join(lines) + '\n')


def configure(root, env, zip_path, enable=None, call=aws, outputs=None, sleep=time.sleep):
    docs = {name: json.loads((root / name).read_text()) for name in (
        'worker-trust.json', 'worker-policy.json', 'worker-env.json', 'worker-mapping.json')}
    check_env(env)
    identity = call('sts', 'get-caller-identity')
    if identity['Account'] != ACCOUNT or identity['Arn'].endswith(':root'):
        raise ValueError('Expected non-root identity in deployment account')
    queue = call('sqs', 'get-queue-attributes', '--queue-url', QUEUE_URL,
                 '--attribute-names', 'VisibilityTimeout', 'RedrivePolicy')['Attributes']
    if int(queue['VisibilityTimeout']) < 6 * TIMEOUT or 'prometeo-hack-ingest-dlq' not in queue.get('RedrivePolicy', ''):
        raise ValueError('Queue visibility must be >= 6x worker timeout with the T31 DLQ; review 30_data.sh')
    profile = call('bedrock', 'get-inference-profile', '--inference-profile-identifier', env['MODEL_ID'])
    models = [m['modelArn'] for m in profile.get('models', [])]
    if not models or profile.get('inferenceProfileId') != APPROVED_MODEL:
        raise ValueError('Inference profile differs from approved D6 model')
    policy = docs['worker-policy.json']
    next(s for s in policy['Statement'] if s['Sid'] == 'InvokeApprovedModel')['Resource'] = \
        [profile['inferenceProfileArn'], *models]

    # Role: create once; an existing role must have the same trust and name.
    try:
        role = call('iam', 'get-role', '--role-name', ROLE_NAME)['Role']
        if role['Arn'] != ROLE_ARN or role['AssumeRolePolicyDocument'] != docs['worker-trust.json']:
            raise ValueError('Existing worker role differs; no replacement performed')
        created_role = False
    except AWSError as exc:
        if exc.code != 'NoSuchEntity':
            raise
        call('iam', 'create-role', '--role-name', ROLE_NAME,
             '--assume-role-policy-document', json.dumps(docs['worker-trust.json']))
        created_role = True
    call('iam', 'attach-role-policy', '--role-name', ROLE_NAME, '--policy-arn', BASIC_POLICY)
    call('iam', 'put-role-policy', '--role-name', ROLE_NAME, '--policy-name', 'prometeo-hack-worker',
         '--policy-document', json.dumps(policy))

    # Function: create, or update code/config of the existing one with the same role.
    common = ['--runtime', 'python3.12', '--handler', 'ingest_worker.handler', '--role', ROLE_ARN,
              '--timeout', str(TIMEOUT), '--memory-size', str(MEMORY)]
    try:
        config = call('lambda', 'get-function-configuration', '--function-name', NAME)
    except AWSError as exc:
        if exc.code != 'ResourceNotFoundException':
            raise
        config = None
    if config is None:
        environment = json.dumps({'Variables': docs['worker-env.json']})
        for attempt in range(8):
            try:
                call('lambda', 'create-function', '--function-name', NAME, *common, '--architectures', 'arm64',
                     '--environment', environment, '--zip-file', f'fileb://{zip_path}',
                     '--tags', 'project=prometeo-hack')
                break
            except AWSError as exc:
                # New IAM roles take seconds to become assumable by Lambda; retry only that case.
                if not (created_role and exc.code == 'InvalidParameterValueException') or attempt == 7:
                    raise
                sleep(5)
        call('lambda', 'wait', 'function-active', '--function-name', NAME)
    else:
        if config.get('Role') != ROLE_ARN or config.get('FunctionArn') != FUNCTION_ARN:
            raise ValueError('Existing worker Lambda differs (role/ARN); review manually')
        variables = config.get('Environment', {}).get('Variables', {})
        variables.update(docs['worker-env.json'])
        call('lambda', 'update-function-code', '--function-name', NAME, '--architectures', 'arm64',
             '--zip-file', f'fileb://{zip_path}')
        call('lambda', 'wait', 'function-updated', '--function-name', NAME)
        revision = call('lambda', 'get-function-configuration', '--function-name', NAME)['RevisionId']
        call('lambda', 'update-function-configuration', '--function-name', NAME, *common,
             '--environment', json.dumps({'Variables': variables}), '--revision-id', revision)
        call('lambda', 'wait', 'function-updated', '--function-name', NAME)

    # Mapping: tracked by UUID in outputs.env; created disabled. No list permission needed.
    wanted = docs['worker-mapping.json']
    uuid = env.get('WORKER_MAPPING_UUID')
    if uuid:
        current = call('lambda', 'get-event-source-mapping', '--uuid', uuid)
        if current.get('EventSourceArn') != QUEUE_ARN or current.get('FunctionArn') != FUNCTION_ARN:
            raise ValueError('WORKER_MAPPING_UUID points to another queue/function; review outputs.env')
        args = ['--uuid', uuid, '--batch-size', '1', '--function-response-types', 'ReportBatchItemFailures',
                '--scaling-config', json.dumps(wanted['ScalingConfig'])]
        if enable is not None:
            args.append('--enabled' if enable else '--no-enabled')
        call('lambda', 'update-event-source-mapping', *args)
    else:
        try:
            created = call('lambda', 'create-event-source-mapping', '--function-name', NAME,
                           '--event-source-arn', QUEUE_ARN, '--batch-size', '1',
                           '--function-response-types', 'ReportBatchItemFailures',
                           '--scaling-config', json.dumps(wanted['ScalingConfig']),
                           '--enabled' if enable else '--no-enabled')
        except AWSError as exc:
            if exc.code == 'ResourceConflictException':
                raise ValueError('A mapping for this queue/function exists but WORKER_MAPPING_UUID is empty; '
                                 'recover its UUID (console or list-event-source-mappings) into outputs.env') from exc
            raise
        uuid = created['UUID']
    if outputs is not None:
        write_outputs(outputs, {'WORKER_FUNCTION_ARN': FUNCTION_ARN, 'WORKER_ROLE_ARN': ROLE_ARN,
                                'WORKER_MAPPING_UUID': uuid})
    return uuid


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--output-dir', required=True, help='Folder for reviewable JSON (outside Git)')
    parser.add_argument('--zip', help='Package from infra/package_worker.sh (required with --apply)')
    parser.add_argument('--apply', action='store_true', help='Create/update role, Lambda and disabled mapping')
    state = parser.add_mutually_exclusive_group()
    state.add_argument('--enable', action='store_true', help='Enable the SQS mapping (after permission checks)')
    state.add_argument('--disable', action='store_true', help='Disable the SQS mapping')
    args = parser.parse_args()
    root = Path(args.output_dir)
    root.mkdir(parents=True, exist_ok=True)
    for name, value in documents(os.environ).items():
        (root / name).write_text(json.dumps(value, indent=2) + '\n')
    if not args.apply:
        print(f'Prepare only: no AWS calls. Review {root}/worker-*.json before --apply.')
        return
    if not args.zip or not Path(args.zip).is_file():
        parser.error('--apply requires --zip with an existing package from infra/package_worker.sh')
    enable = True if args.enable else False if args.disable else None
    uuid = configure(root, os.environ, Path(args.zip).resolve().as_posix(), enable,
                     outputs=Path(__file__).with_name('outputs.env'))
    state = 'enabled' if enable else 'disabled' if enable is False else 'unchanged (new mappings start disabled)'
    print(f'Worker deployed. Mapping {uuid}: {state}. Real batch/DLQ checks still required.')


if __name__ == '__main__':
    main()
