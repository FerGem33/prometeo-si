"""Generate T33 configuration for review; does not deploy or contact AWS."""
import argparse
import json
import os
import re
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', required=True)
    args = parser.parse_args()
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
    for filename, value in documents.items():
        path = output / filename
        encoded = json.dumps(value, indent=2) + '\n'
        if path.exists() and path.read_text() != encoded:
            parser.error('Refusing to replace changed review artifact: ' + str(path))
        path.write_text(encoded)
    print('Prepared four review artifacts; no AWS changes. Environment fragment must be MERGED.')


if __name__ == '__main__':
    main()
