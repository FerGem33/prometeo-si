"""Live T33 file checks. Uses real local source and two sessions from environment.

Creates a project and an original file; does not delete either. No signed URLs,
credentials, or source bytes in the receipt. Worker verification is separate.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import tempfile
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import uuid


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', default=str(Path(tempfile.gettempdir()) / 'prometeo-t33-upload-check.json'))
    args = parser.parse_args()
    path = args.source.resolve()
    if path.suffix.lower() not in ('.csv', '.pdf') or not path.is_file() or not 1 <= path.stat().st_size <= 20000000:
        parser.error('Choose a real CSV/PDF within approved size limits')
    raw = path.read_bytes()
    media = 'text/csv' if path.suffix.lower() == '.csv' else 'application/pdf'
    a, b = os.environ['T33_TOKEN_A'], os.environ['T33_TOKEN_B']
    base = os.environ['API_URL'].rstrip('/')
    if base != 'https://ve5oqmsyie.execute-api.us-east-1.amazonaws.com':
        parser.error('Unexpected API URL')
    receipt = []

    def send(label, method, url, expected, payload=None, token=None, headers=None):
        outgoing = dict(headers or {})
        if token:
            outgoing.update(Authorization='Bearer '+token, Origin=os.environ['CF_URL'])
        if isinstance(payload, dict):
            payload = json.dumps(payload).encode()
            outgoing['Content-Type'] = 'application/json'
        try:
            response = urlopen(Request(url, method=method, data=payload, headers=outgoing), timeout=30)
        except HTTPError as exc:
            response = exc
        with response:
            status, data = response.code, response.read()
        receipt.append({'check': label, 'http': status, 'expected': expected})
        assert status == expected, label+': HTTP '+str(status)
        return json.loads(data) if data and not url.startswith('https://prometeo-hack-corpus-') else {}

    try:
        project = send('create_project', 'POST', base+'/projects', 201,
                       {'name': 'Upload check '+uuid.uuid4().hex, 'intent': 'Verify original upload integrity'}, a)
        pid = project['id']
        endpoint = base+'/projects/'+pid+'/documents'
        body = {'name': path.name, 'media_type': media, 'bytes': len(raw)}
        send('foreign_ticket_rejected', 'POST', endpoint, 404, body, b)
        ticket = send('reserve', 'POST', endpoint, 201, body, a, {'Idempotency-Key': 'one-file'})
        again = send('reserve_repeat', 'POST', endpoint, 201, body, a, {'Idempotency-Key': 'one-file'})
        assert again['doc_id'] == ticket['doc_id']
        upload = ticket['upload']
        if not upload['url'].startswith('https://prometeo-hack-corpus-352818909129.s3.'):
            raise ValueError('Unexpected signed upload destination')
        send('s3_put', 'PUT', upload['url'], 200, raw, headers=upload['headers'])
        send('s3_overwrite_rejected', 'PUT', upload['url'], 412, raw, headers=upload['headers'])
        complete = endpoint+'/'+ticket['doc_id']+'/complete'
        digest = {'sha256': hashlib.sha256(raw).hexdigest()}
        send('foreign_complete_rejected', 'POST', complete, 404, digest, b)
        doc = send('complete', 'POST', complete, 200, digest, a)
        send('complete_repeat', 'POST', complete, 200, digest, a)
        send('complete_hash_conflict', 'POST', complete, 409, {'sha256': '0'*64}, a)
        listing = send('list', 'GET', endpoint, 200, token=a)
        assert ticket['doc_id'] in [d['id'] for d in listing['items']]
        send('foreign_list_rejected', 'GET', endpoint, 404, token=b)
        send('jobs', 'GET', base+'/projects/'+pid+'/jobs', 200, token=a)
        receipt.append({'project_id': pid, 'doc_id': ticket['doc_id'], 'sha256_expected': digest['sha256'],
                        'sha256_observed': doc['sha256'], 'cleanup': 'Retained for owner cleanup'})
    finally:
        Path(args.output).write_text(json.dumps(receipt, indent=2)+'\n')
    print(json.dumps(receipt, indent=2))


if __name__ == '__main__':
    main()
