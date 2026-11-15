"""Generate T33 configuration for review; does not deploy or contact AWS."""
import argparse
import json
import os
import re
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', required=True)
    parser.add_argument('--uploads', action='store_true', help='Include approved D3 upload routes/configuration')
    parser.add_argument('--schema', action='store_true', help='Include T35 schema review routes (requires --uploads)')
    parser.add_argument('--originals', action='store_true', help='Include T36 short-lived original document URLs (requires --uploads)')
    parser.add_argument('--evidence', action='store_true', help='Include persistent records and publication (requires --schema)')
    args = parser.parse_args()
    if args.schema and not args.uploads:
        parser.error('--schema requires --uploads')
    if args.originals and not args.uploads:
        parser.error('--originals requires --uploads')
    if args.evidence and not args.schema:
        parser.error('--evidence requires --schema')
    table = os.environ['DATA_TABLE_ARN']
    pool = os.environ['USER_POOL_ID']
    client = os.environ['USER_POOL_CLIENT_ID']
    if not re.fullmatch(r'arn:aws:dynamodb:us-east-1:352818909129:table/prometeo-hack-data', table):
        parser.error('Unexpected table/account; review configuration')
    if not re.fullmatch(r'us-east-1_[A-Za-z0-9]+', pool) or not re.fullmatch(r'[a-z0-9]+', client):
        parser.error('Invalid Cognito outputs')
    issuer = 'https://cognito-idp.us-east-1.amazonaws.com/' + pool
    output = Path(args.output_dir)
    output.mkdir(parents=True, exist_ok=True)
    documents = {
        'projects-policy.json': {'Version': '2012-10-17', 'Statement': [{
            'Effect': 'Allow', 'Action': ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:Query'],
            'Resource': table}]},
        'projects-authorizer.json': {'Name': 'prometeo-hack-users', 'AuthorizerType': 'JWT',
            'IdentitySource': ['$request.header.Authorization'],
            'JwtConfiguration': {'Issuer': issuer, 'Audience': [client]}},
        'projects-env-merge.json': {'DATA_TABLE': os.environ['DATA_TABLE'],
            'COGNITO_ISSUER': issuer, 'USER_POOL_CLIENT_ID': client},
        'projects-routes.json': [{'RouteKey': route, 'AuthorizationType': 'JWT'} for route in (
            'POST /projects', 'GET /projects', 'GET /projects/{id}', 'PATCH /projects/{id}')],
    }
    if args.uploads:
        bucket = os.environ['CORPUS_BUCKET']
        queue = os.environ['INGEST_QUEUE_ARN']
        if bucket != 'prometeo-hack-corpus-352818909129' or queue != 'arn:aws:sqs:us-east-1:352818909129:prometeo-hack-ingest':
            parser.error('Unexpected corpus/queue outputs')
        documents['projects-policy.json']['Statement'][0]['Action'].extend(['dynamodb:UpdateItem', 'dynamodb:DeleteItem'])
        documents['projects-policy.json']['Statement'].extend([
            {'Effect': 'Allow', 'Action': ['s3:PutObject', 's3:GetObject'], 'Resource': f'arn:aws:s3:::{bucket}/u/*/p/*/raw/*'},
            {'Effect': 'Allow', 'Action': ['sqs:SendMessage'], 'Resource': queue},
            # DELETE (T33): remove a user's project objects; listing only under the per-user prefix.
            {'Effect': 'Allow', 'Action': ['s3:DeleteObject'], 'Resource': f'arn:aws:s3:::{bucket}/u/*/p/*'},
            {'Effect': 'Allow', 'Action': ['s3:ListBucket'], 'Resource': f'arn:aws:s3:::{bucket}',
             'Condition': {'StringLike': {'s3:prefix': ['u/*/p/*']}}}])
        documents['projects-env-merge.json'].update({'UPLOADS_ENABLED': 'true',
            'UPLOAD_LIMITS_JSON': json.dumps({'max_bytes': 20000000, 'max_pages': 60, 'max_documents': 30}),
            'CORPUS_BUCKET': bucket, 'INGEST_QUEUE_URL': os.environ['INGEST_QUEUE_URL']})
        documents['projects-routes.json'].extend({'RouteKey': key, 'AuthorizationType': 'JWT'} for key in (
            'POST /projects/{id}/documents', 'GET /projects/{id}/documents',
            'POST /projects/{id}/documents/{doc_id}/complete', 'GET /projects/{id}/jobs',
            'POST /projects/{id}/ingest/resume', 'DELETE /projects/{id}', 'DELETE /projects/{id}/documents/{doc_id}'))
    if args.schema:
        bucket = os.environ['CORPUS_BUCKET']
        documents['projects-policy.json']['Statement'].extend([
            {'Effect': 'Allow', 'Action': ['s3:GetObject', 's3:PutObject'], 'Resource': f'arn:aws:s3:::{bucket}/u/*/p/*/schema/*'},
            {'Effect': 'Allow', 'Action': 's3:GetObject', 'Resource': f'arn:aws:s3:::{bucket}/u/*/p/*/text/*'}])
        documents['projects-routes.json'].extend({'RouteKey': key, 'AuthorizationType': 'JWT'} for key in (
            'GET /projects/{id}/schema', 'PATCH /projects/{id}/schema', 'POST /projects/{id}/schema/approve'))
    if args.originals:
        documents['projects-routes.json'].append({'RouteKey': 'POST /projects/{id}/documents/{doc_id}/url', 'AuthorizationType': 'JWT'})
    if args.evidence:
        documents['projects-routes.json'].append({'RouteKey': 'GET /projects/{id}/diagnostics', 'AuthorizationType': 'JWT'})
        documents['projects-policy.json']['Statement'].append({'Effect': 'Allow', 'Action': ['s3:GetObject', 's3:PutObject'],
            'Resource': f'arn:aws:s3:::{bucket}/u/*/p/*/pack/*'})
        documents['projects-policy.json']['Statement'].append({'Effect': 'Allow', 'Action': ['s3:GetObject', 's3:PutObject'],
            'Resource': f'arn:aws:s3:::{bucket}/u/*/p/*/text/reviews/*'})
        documents['projects-policy.json']['Statement'].append({'Effect': 'Allow', 'Action': 's3:PutObject',
            'Resource': f'arn:aws:s3:::{bucket}/u/*/p/*/text/doc_*/manual-*.json'})
        documents['projects-routes.json'].extend({'RouteKey': key, 'AuthorizationType': 'JWT'} for key in (
            'GET /projects/{id}/records', 'PATCH /projects/{id}/records/{rid}', 'DELETE /projects/{id}/records/{rid}',
            'GET /projects/{id}/conflicts', 'POST /projects/{id}/conflicts/{cid}/resolve',
            'POST /projects/{id}/publish', 'GET /projects/{id}/pack', 'POST /projects/{id}/synthesis',
            'GET /projects/{id}/proposals', 'GET /projects/{id}/proposals/{pid}',
            'PUT /projects/{id}/proposals/{pid}', 'DELETE /projects/{id}/proposals/{pid}',
            'GET /projects/{id}/claims', 'POST /projects/{id}/claims', 'DELETE /projects/{id}/claims/{cid}',
            'POST /projects/{id}/ask', 'POST /projects/{id}/analysis'))
        documents['projects-routes.json'].extend({'RouteKey': key, 'AuthorizationType': 'JWT'} for key in (
            'POST /projects/{id}/documents/{doc_id}/proposal',
            'GET /projects/{id}/paper-candidates', 'POST /projects/{id}/paper-candidates',
            'POST /projects/{id}/paper-candidates/{cid}/review', 'POST /projects/{id}/papers/{doc_id}/review',
            'GET /projects/{id}/lens', 'PUT /projects/{id}/lens', 'POST /projects/{id}/papers/{doc_id}/extract',
            'GET /projects/{id}/documents/{doc_id}/text'))
    for filename, value in documents.items():
        path = output / filename
        encoded = json.dumps(value, indent=2) + '\n'
        if path.exists() and path.read_text() != encoded:
            parser.error('Refusing to replace changed review artifact: ' + str(path))
        path.write_text(encoded)
    print('Prepared four review artifacts; no AWS changes. Environment fragment must be MERGED.')


if __name__ == '__main__':
    main()
