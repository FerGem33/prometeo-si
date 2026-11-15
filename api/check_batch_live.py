"""Live batch upload for T34 verification and the T37 corpus. One session from environment (T33_TOKEN_A).

Creates a project, uploads every CSV/PDF in --dir (D3: at most 30 documents, sorted by name), optionally
adds one deliberately corrupt CSV (--corrupt), confirms each with its SHA-256 and polls GET /jobs until all
documents are terminal or --timeout. No AWS credentials: DLQ inspection is a separate AWS CLI step
(see docs/RELEVO_LAPTOP_AWS.md). Receipt without tokens, signed URLs or file contents. Nothing is deleted.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import tempfile
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import uuid

API = 'https://ve5oqmsyie.execute-api.us-east-1.amazonaws.com'
CORRUPT = b'a,a\n1,2\n'  # duplicate header: the worker rejects it as unreadable (see test_ingest_worker)
TERMINAL = ('done', 'skipped', 'failed')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dir', type=Path, required=True, help='Folder with CSV/PDF (e.g. corpus lote/)')
    parser.add_argument('--limit', type=int, default=30, help='Documents to upload from --dir (D3 max 30)')
    parser.add_argument('--corrupt', action='store_true', help='Add one corrupt CSV (expected: failed, then DLQ)')
    parser.add_argument('--name', default='Batch check')
    parser.add_argument('--intent', default='Verify batch ingestion and per-document failure isolation')
    parser.add_argument('--timeout', type=int, default=900)
    parser.add_argument('--poll', type=int, default=10)
    parser.add_argument('--output', default=str(Path(tempfile.gettempdir()) / 'prometeo-batch-check.json'))
    args = parser.parse_args()
    files = sorted(p for p in args.dir.iterdir() if p.is_file() and p.suffix.lower() in ('.csv', '.pdf'))
    files = files[:min(args.limit, 30 - int(args.corrupt))]
    if not files:
        parser.error('No CSV/PDF files in --dir')
    if any(p.stat().st_size > 20_000_000 for p in files):
        parser.error('A file exceeds the D3 limit (20 MB); rebuild the batch with tools/psi/corpus_dominio.py')
    if os.environ['API_URL'].rstrip('/') != API:
        parser.error('Unexpected API URL')
    token, origin = os.environ['T33_TOKEN_A'], os.environ['CF_URL']
    receipt = {'project_id': None, 'documents': [], 'polls': []}
    started = time.time()

    def send(method, url, expected, payload=None, headers=None, auth=True):
        outgoing = dict(headers or {})
        if auth:
            outgoing.update(Authorization='Bearer ' + token, Origin=origin)
        if isinstance(payload, dict):
            payload = json.dumps(payload).encode()
            outgoing['Content-Type'] = 'application/json'
        try:
            response = urlopen(Request(url, method=method, data=payload, headers=outgoing), timeout=60)
        except HTTPError as exc:
            response = exc
        with response:
            status, data = response.code, response.read()
        if status != expected:
            raise RuntimeError(f'{method} {url.split("?")[0][:90]}: HTTP {status} (expected {expected})')
        return json.loads(data) if data and auth else {}

    try:
        project = send('POST', API + '/projects', 201, {'name': f'{args.name} {uuid.uuid4().hex[:8]}',
                       'intent': args.intent}, {'Idempotency-Key': 'batch-' + uuid.uuid4().hex})
        pid = receipt['project_id'] = project['id']
        endpoint = API + '/projects/' + pid + '/documents'
        uploads = [(p.name, p.read_bytes()) for p in files] + ([('corrupt-control.csv', CORRUPT)] if args.corrupt else [])
        for index, (name, raw) in enumerate(uploads):
            media = 'application/pdf' if name.lower().endswith('.pdf') else 'text/csv'
            digest = hashlib.sha256(raw).hexdigest()
            ticket = send('POST', endpoint, 201, {'name': name, 'media_type': media, 'bytes': len(raw)},
                          {'Idempotency-Key': f'doc-{index}-{digest[:16]}'})
            upload = ticket['upload']
            if not upload['url'].startswith('https://prometeo-hack-corpus-352818909129.s3.'):
                raise ValueError('Unexpected signed upload destination')
            send('PUT', upload['url'], 200, raw, upload['headers'], auth=False)
            send('POST', endpoint + '/' + ticket['doc_id'] + '/complete', 200, {'sha256': digest})
            receipt['documents'].append({'name': name, 'doc_id': ticket['doc_id'], 'bytes': len(raw),
                                         'sha256': digest, 'control': name == 'corrupt-control.csv'})
            print(f'uploaded {index + 1}/{len(uploads)} {name[:70]}', flush=True)
        while True:
            jobs = send('GET', API + '/projects/' + pid + '/jobs', 200)
            receipt['polls'].append({'t': round(time.time() - started), 'project_status': jobs['project_status'],
                                     'totals': jobs['totals']})
            print(f"[{receipt['polls'][-1]['t']:>4}s] {jobs['project_status']} {jobs['totals']}", flush=True)
            if all(j['status'] in TERMINAL for j in jobs['jobs']) or time.time() - started > args.timeout:
                break
            time.sleep(args.poll)
        by_id = {j['doc_id']: j for j in jobs['jobs']}
        for doc in receipt['documents']:
            job = by_id.get(doc['doc_id'], {})
            doc.update(status=job.get('status'), stage=job.get('stage'), error_code=job.get('error_code'))
        normal = [d for d in receipt['documents'] if not d['control']]
        control = [d for d in receipt['documents'] if d['control']]
        receipt['result'] = {
            'project_status': jobs['project_status'], 'elapsed_s': round(time.time() - started),
            'normal_done_or_skipped': sum(d['status'] in ('done', 'skipped') for d in normal), 'normal_total': len(normal),
            'control_failed': all(d['status'] == 'failed' for d in control) if control else None,
            'note': 'A corrupt control reaches the DLQ only after maxReceiveCount=3 receives (visibility 960 s).'}
    finally:
        Path(args.output).write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt['result'], indent=2))
    ok = receipt['result']['normal_done_or_skipped'] == len(normal) and receipt['result']['control_failed'] in (True, None)
    raise SystemExit(0 if ok else 1)


if __name__ == '__main__':
    main()
