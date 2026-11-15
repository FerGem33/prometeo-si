"""T33: idempotent configuration of existing API/Lambda. Default: prepare only.

AWS operations use AWS CLI, not SDK. No resource deletion or replacement.
Run infra/20_api.sh first to package api/projects.py. See docs/T33_API_PROYECTOS.md.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import re


def aws(*args):
    command = ['aws', *args, '--profile', 'prometeo', '--region', 'us-east-1', '--no-cli-pager', '--output', 'json']
    result = subprocess.run(command, check=False, capture_output=True, text=True)
    if result.returncode:
        # Do not dump the command or environment payload; show the service error code.
        match = re.search(r'\((\w+)\) when calling', result.stderr)
        code = match[1] if match else 'CLIError'
        raise RuntimeError(f'AWS {args[0]} {args[1]} failed ({code}); exit {result.returncode}')
    return json.loads(result.stdout) if result.stdout.strip() else {}


def configure(root, env, call=aws):
    """Apply only to known resources; caller has explicitly approved apply."""
    documents = {name: json.loads((root / name).read_text()) for name in (
        'projects-policy.json', 'projects-authorizer.json', 'projects-env-merge.json', 'projects-routes.json')}
    account = call('sts', 'get-caller-identity')
    if account['Account'] != '352818909129' or account['Arn'].endswith(':root'):
        raise ValueError('Expected non-root identity in deployment account')
    api_id = env['API_ID']
    function = env['FUNCTION_ARN']
    role = env['API_ROLE_ARN']
    if function != 'arn:aws:lambda:us-east-1:352818909129:function:prometeo-hack-api':
        raise ValueError('Unexpected Lambda output')
    if role != 'arn:aws:iam::352818909129:role/prometeo-hack-api-role':
        raise ValueError('Unexpected role output')
    api = call('apigatewayv2', 'get-api', '--api-id', api_id)
    if api['Name'] != 'prometeo-hack-api':
        raise ValueError('Unexpected API name')
    if not call('apigatewayv2', 'get-stage', '--api-id', api_id, '--stage-name', '$default').get('AutoDeploy'):
        raise ValueError('Expected auto-deploy default stage; review deployment strategy')
    config = call('lambda', 'get-function-configuration', '--function-name', function)
    if config['Role'] != role:
        raise ValueError('Lambda role differs from outputs')
    upload_env = documents['projects-env-merge.json']
    if upload_env.get('UPLOADS_ENABLED') == 'true':
        call('s3api', 'put-bucket-cors', '--bucket', upload_env['CORPUS_BUCKET'],
             '--cors-configuration', json.dumps({'CORSRules': [{'AllowedOrigins': [env['CF_URL']],
                 'AllowedMethods': ['PUT'], 'AllowedHeaders': ['content-type', 'if-none-match',
                 'x-amz-checksum-sha256', 'x-amz-server-side-encryption'], 'MaxAgeSeconds': 300}]}))
    integrations = call('apigatewayv2', 'get-integrations', '--api-id', api_id).get('Items', [])
    matches = [i for i in integrations if i.get('IntegrationUri') == function and i.get('PayloadFormatVersion') == '2.0']
    if len(matches) != 1:
        raise ValueError('Expected one existing payload-v2 Lambda integration; review manually')
    # Never silently consume incomplete pagination when looking up existing IDs.
    existing = call('apigatewayv2', 'get-authorizers', '--api-id', api_id)
    if existing.get('NextToken'):
        raise ValueError('Unexpected unconsumed authorizer page')
    definition = documents['projects-authorizer.json']
    candidates = [a for a in existing.get('Items', []) if a.get('Name') == definition['Name']]
    if len(candidates) > 1:
        raise ValueError('Duplicate authorizer name')
    if candidates:
        authorizer_id = candidates[0]['AuthorizerId']
        if (candidates[0].get('JwtConfiguration') != definition['JwtConfiguration']
                or candidates[0].get('AuthorizerType') != 'JWT'
                or candidates[0].get('IdentitySource') != definition['IdentitySource']):
            raise ValueError('Existing authorizer differs; no replacement performed')
    else:
        authorizer_id = call('apigatewayv2', 'create-authorizer', '--api-id', api_id,
                             '--cli-input-json', json.dumps(definition))['AuthorizerId']
    routes = call('apigatewayv2', 'get-routes', '--api-id', api_id)
    if routes.get('NextToken'):
        raise ValueError('Unexpected unconsumed route page')
    known = {r['RouteKey']: r for r in routes.get('Items', [])}
    target = 'integrations/' + matches[0]['IntegrationId']
    for route in documents['projects-routes.json']:
        old = known.get(route['RouteKey'])
        if old and (old.get('Target') != target or old.get('AuthorizationType') != 'JWT'
                    or old.get('AuthorizerId') != authorizer_id):
            raise ValueError('Existing project route differs; review ' + route['RouteKey'])
    # Configure protection before enabling service variables. No unprotected project route.
    for route in documents['projects-routes.json']:
        key = route['RouteKey']
        args = ['--api-id', api_id, '--authorization-type', 'JWT', '--authorizer-id', authorizer_id, '--target', target]
        if key in known:
            call('apigatewayv2', 'update-route', '--route-id', known[key]['RouteId'], *args)
        else:
            call('apigatewayv2', 'create-route', '--route-key', key, *args)
    policy = call('lambda', 'get-policy', '--function-name', function)
    statements = json.loads(policy['Policy'])['Statement']
    stage = '$default'
    for route in documents['projects-routes.json']:
        method, path = route['RouteKey'].split(' ', 1)
        suffix = path.lstrip('/').replace('{id}', '*').replace('{doc_id}', '*')
        if suffix in ('projects', 'projects/*'):
            sid = 'prometeo-projects-' + method.lower() + ('-item' if suffix.endswith('*') else '-list')
        else:
            sid = 'prometeo-documents-' + hashlib.sha256(route['RouteKey'].encode()).hexdigest()[:16]
        source = f'arn:aws:execute-api:us-east-1:352818909129:{api_id}/{stage}/{method}/{suffix}'
        old = next((s for s in statements if s.get('Sid') == sid), None)
        if old:
            if (old.get('Condition', {}).get('ArnLike', {}).get('AWS:SourceArn') != source
                    or old.get('Principal', {}).get('Service') != 'apigateway.amazonaws.com'
                    or old.get('Condition', {}).get('StringEquals', {}).get('AWS:SourceAccount') != '352818909129'):
                raise ValueError('Existing Lambda permission differs; review ' + sid)
        else:
            call('lambda', 'add-permission', '--function-name', function, '--statement-id', sid,
                 '--action', 'lambda:InvokeFunction', '--principal', 'apigateway.amazonaws.com',
                 '--source-account', '352818909129', '--source-arn', source)
    call('iam', 'put-role-policy', '--role-name', role.rsplit('/', 1)[-1],
         '--policy-name', 'prometeo-hack-projects', '--policy-document', json.dumps(documents['projects-policy.json']))
    variables = config.get('Environment', {}).get('Variables', {})
    variables.update(documents['projects-env-merge.json'])
    call('lambda', 'wait', 'function-updated', '--function-name', function)
    call('lambda', 'update-function-configuration', '--function-name', function,
         '--environment', json.dumps({'Variables': variables}), '--revision-id', config['RevisionId'])
    call('lambda', 'wait', 'function-updated', '--function-name', function)
    call('apigatewayv2', 'update-api', '--api-id', api_id, '--cors-configuration', json.dumps({
        'AllowOrigins': [env['CF_URL']], 'AllowMethods': ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
        'AllowHeaders': ['content-type', 'authorization', 'idempotency-key'], 'MaxAge': 300}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', required=True)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--contract-approved', action='store_true', help='Only after actual T30 approval is recorded')
    parser.add_argument('--uploads', action='store_true', help='Enable upload/complete stage after D3 approval')
    parser.add_argument('--schema', action='store_true', help='Configure versioned schema review and approval')
    args = parser.parse_args()
    subprocess.run([sys.executable, '-I', str(Path(__file__).with_name('prepare_projects.py')),
                    '--output-dir', args.output_dir, *(['--uploads'] if args.uploads else []),
                    *(['--schema'] if args.schema else [])], check=True)
    if not args.apply:
        print('Prepare only: no AWS calls. Review artifacts and T30 before --apply.')
        return
    if not args.contract_approved:
        parser.error('Apply requires recorded T30 approval and --contract-approved')
    configure(Path(args.output_dir), os.environ)
    print('Project routes configured. Real A/B, Cognito and regression checks still required.')


if __name__ == '__main__':
    main()
