"""Live T33 HTTP checks. Tokens come from environment, never from CLI/logs.

Without tokens: authentication rejection + CORS. With T33_TOKEN_A/B: creates
two empty test projects and checks isolation/idempotency. Does not delete them.
"""
import argparse
import json
import os
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import uuid


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    base = os.environ['API_URL'].rstrip('/')
    origin = os.environ['CF_URL']
    if base != 'https://ve5oqmsyie.execute-api.us-east-1.amazonaws.com':
        parser.error('Unexpected API URL')
    results = []

    def check(label, method, path, expected, token=None, payload=None, key=None, preflight=False):
        headers = {'Origin': origin}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        if key:
            headers['Idempotency-Key'] = key
        if payload is not None:
            headers['Content-Type'] = 'application/json'
        if preflight:
            headers.update({'Access-Control-Request-Method': 'POST',
                            'Access-Control-Request-Headers': 'authorization,content-type,idempotency-key'})
        req = Request(base+path, data=json.dumps(payload).encode() if payload is not None else None,
                      method=method, headers=headers)
        try:
            response = urlopen(req, timeout=30)
        except HTTPError as exc:
            response = exc
        with response:
            status, raw = response.code, response.read()
            cors = response.headers.get('access-control-allow-origin')
            if preflight:
                allowed = response.headers.get('access-control-allow-headers', '').lower()
                assert cors == origin and all(h in allowed for h in ('authorization', 'content-type', 'idempotency-key'))
        results.append({'check': label, 'http': status, 'expected': expected})
        assert status == expected, label + ': unexpected HTTP ' + str(status)
        return json.loads(raw) if raw else {}

    try:
        check('no_session', 'GET', '/projects', 401)
        check('invalid_token', 'GET', '/projects', 401, token='invalid-token')
        check('preflight', 'OPTIONS', '/projects', 204, preflight=True)
        a, b = os.environ.get('T33_TOKEN_A'), os.environ.get('T33_TOKEN_B')
        if bool(a) != bool(b):
            parser.error('Supply both T33_TOKEN_A and T33_TOKEN_B or neither')
        if a and b:
            marker = 't33-check-' + uuid.uuid4().hex
            payload = {'name': marker, 'intent': 'Verify empty project API isolation'}
            pa = check('create_a', 'POST', '/projects', 201, a, payload, marker)
            pb = check('create_b', 'POST', '/projects', 201, b, payload, marker)
            assert pa['id'] != pb['id'], 'Sessions must belong to different users'
            again = check('repeat_a', 'POST', '/projects', 201, a, payload, marker)
            assert again == pa
            check('key_payload_conflict', 'POST', '/projects', 409, a, {**payload, 'name': 'Changed'}, marker)
            check('a_cannot_read_b', 'GET', '/projects/'+pb['id'], 404, a)
            check('b_cannot_read_a', 'GET', '/projects/'+pa['id'], 404, b)
            check('a_cannot_edit_b', 'PATCH', '/projects/'+pb['id'], 404, a, {'name': 'Changed'})
            check('own_read', 'GET', '/projects/'+pa['id'], 200, a)
            check('own_patch', 'PATCH', '/projects/'+pa['id'], 200, a, {'name': marker+'-edited'})
            for who, token, forbidden in (('a', a, pb['id']), ('b', b, pa['id'])):
                cursor = None
                while True:
                    page = check('list_'+who, 'GET', '/projects'+('?cursor='+cursor if cursor else ''), 200, token)
                    assert all(p['id'] != forbidden for p in page['items'])
                    cursor = page['next_cursor']
                    if not cursor:
                        break
            results.append({'created_project_ids': [pa['id'], pb['id']],
                            'cleanup': 'Pending owner cleanup: DELETE not implemented'})
        else:
            results.append({'ab_check': 'not_run', 'reason': 'Two real user sessions required'})
    finally:
        # Never persist credentials, request headers, or server bodies.
        Path(args.output).write_text(json.dumps(results, indent=2)+'\n')
    print(json.dumps(results, indent=2))


if __name__ == '__main__':
    main()
