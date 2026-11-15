#!/usr/bin/env python3
"""Resumable offline T32 workflow. All artifacts stay local; no publishing or infrastructure.

run stops at awaiting_review. approve is a separate, explicit operator action.
SDK calls run only in api/ingest_call.py, with --invoke. Successful raw responses are reused.
"""
import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


review = module('review_extract', ROOT / 'pipeline/review_extract.py')
ingest = review.ingest
adapter = module('ingest_propose', ROOT / 'api/ingest_propose.py')
papers = module('evaluate_papers', ROOT / 'api/evaluate_papers.py')
require = review.require


def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def file_hash(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def save(path, value):
    """Atomic replace for state; content-addressed objects never change their meaning."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
    temp.replace(path)


def artifact(work, kind, value):
    path = work / kind / (review.digest(value) + '.json')
    if not path.exists():
        save(path, value)
    return str(path)


def parse_cached(path, work):
    signature = {'source': file_hash(path), 'path': str(path), 'name': path.name, 'parser': file_hash(ROOT / 'pipeline/ingest.py')}
    if path.suffix.lower() == '.pdf':
        try:
            version = subprocess.run(['pdftotext', '-v'], capture_output=True, check=True, timeout=10)
            signature['poppler'] = version.stderr.decode() + version.stdout.decode()
        except (OSError, subprocess.SubprocessError):
            signature['poppler'] = 'unavailable'
    target = work / 'parse' / (review.digest(signature) + '.json')
    if target.exists():
        result = load(target)
        require(result['signature'] == signature and result['doc_hash'] == review.digest(result['document']), 'parse cache integrity failure')
        return result['document'], True
    document = ingest.parse_document(path)
    document['path'] = str(path)
    save(target, {'signature': signature, 'document': document, 'doc_hash': review.digest(document)})
    return document, False


def import_index(directories):
    result = {}
    for directory in directories:
        for path in Path(directory).rglob('request.json'):
            raw = path.with_name('raw.json')
            try:
                request = load(path)
                if set(request) == {'model', 'system', 'content'} and raw.exists():
                    result.setdefault(review.digest(request), (path, raw))
            except (OSError, ValueError, TypeError):
                continue
    return result


def model_response(request, work, imports, invoke=False, retry_failed=False, caller=None, stats=None):
    """Cache raw output before validation. Revalidate on every use, never invent a response."""
    key = review.digest(request)
    folder = work / 'requests' / key
    folder.mkdir(parents=True, exist_ok=True)
    request_path = folder / 'request.json'
    if request_path.exists():
        require(load(request_path) == request, 'request cache integrity failure')
    else:
        save(request_path, request)
    receipt_path = folder / 'receipt.json'
    receipt = load(receipt_path) if receipt_path.exists() else None
    called = False
    if receipt is None and key in imports:
        original_request, original_raw = imports[key]
        require(load(original_request) == request, 'import request mismatch')
        destination = folder / 'imported-raw.json'
        shutil.copyfile(original_raw, destination)
        receipt = {'origin': 'imported_response', 'raw': str(destination), 'raw_sha256': file_hash(destination),
                   'imported_from': str(original_raw), 'request_key': key}
        save(receipt_path, receipt)
    raw_is_usable = bool(receipt and receipt.get('raw') and Path(receipt['raw']).is_file()
                         and file_hash(receipt['raw']) == receipt.get('raw_sha256'))
    if (receipt is None or not raw_is_usable) and (receipt is None or retry_failed):
        if not invoke:
            raise ValueError('request_pending: use --invoke for this uncached request')
        attempt = folder / ('attempt-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ'))
        attempt.mkdir()
        raw, output = attempt / 'raw.json', attempt / 'response.json'
        error = None
        called = True
        if stats is not None:
            stats['calls_now'] += 1
        try:
            if caller is None:
                subprocess.run([sys.executable, '-I', str(ROOT / 'api/ingest_call.py'), str(request_path),
                                '--raw-output', str(raw), '--output', str(output)], check=True,
                               capture_output=True, text=True, timeout=120)
            else:
                caller(request, raw, output)
        except (OSError, subprocess.SubprocessError, ValueError) as exc:
            error = type(exc).__name__ + ': ' + str(exc)
            if isinstance(exc, subprocess.CalledProcessError):
                error += '\n' + (exc.stderr or '')[-4000:]
        receipt = {'origin': 'live_call' if caller is None else 'test_double', 'request_key': key, 'error': error}
        if raw.exists():
            receipt.update(raw=str(raw), raw_sha256=file_hash(raw))
        save(attempt / 'receipt.json', receipt)
        save(receipt_path, receipt)
        raw_is_usable = bool(receipt.get('raw') and Path(receipt['raw']).is_file()
                             and file_hash(receipt['raw']) == receipt.get('raw_sha256'))
    require(receipt is not None and raw_is_usable, 'previous_call_failed_or_raw_missing: explicit --retry-failed required; see receipt')
    if not called and stats is not None:
        stats['reused_responses'] += 1
    require(receipt['request_key'] == key and file_hash(receipt['raw']) == receipt['raw_sha256'], 'raw cache integrity failure')
    raw = load(receipt['raw'])
    require(raw.get('stop_reason') == 'end_turn', 'incomplete saved model response')
    text = ''.join(b['text'] for b in raw['content'] if b['type'] == 'text')
    response = adapter.parse_response(text)
    return response, {'request_key': key, 'called_now': called, 'origin': receipt['origin'],
                      'raw': receipt['raw'], 'usage': raw.get('usage', {})}


def joint_proposal(proposals, documents):
    """Namespace every document-local ID. Similar names are suggestions, never automatic merges."""
    variables, columns, origins, groups = [], [], {}, {}
    for doc_id, proposal in sorted(proposals.items()):
        rename = {}
        for v in proposal['variables']:
            key = 'v_' + doc_id.removeprefix('doc_')[:12] + '_' + v['id'][:42] + '_' + review.digest(v['id'])[:6]
            require(key not in origins, 'namespaced ID collision')
            rename[v['id']] = key
            origins[key] = {'doc_id': doc_id, 'original_id': v['id']}
            variables.append({**v, 'id': key, 'status': 'proposed', 'merged_from': []})
            groups.setdefault((v['id'], v['type'], v.get('unit')), []).append(key)
        for col in proposal['columns']:
            columns.append({**col, 'variable': rename[col['variable']] if col['variable'] else None, 'status': 'proposed'})
    covered = {(c['doc_id'], c['column']) for c in columns}
    for doc in documents.values():
        if doc['kind'] == 'table':
            for h in doc['headers']:
                if (doc['id'], h) not in covered:
                    columns.append({'doc_id': doc['id'], 'column': h, 'variable': None, 'unit': None,
                                    'convert': None, 'status': 'proposed', 'sample': [], 'note': 'No valid model proposal; review explicitly.'})
    schema = {'version': 1, 'status': 'proposed', 'variables': variables, 'columns': columns, 'constants': []}
    return {'schema': schema, 'origins': origins,
            'possible_merges': [{'original_id': key[0], 'type': key[1], 'unit': key[2], 'members': ids, 'status': 'needs_human_decision'}
                                for key, ids in groups.items() if len(ids) > 1]}


def paper_request(doc, schema, pages, model):
    require(pages and len(pages) == len(set(pages)), 'explicit unique PDF pages required')
    chosen = [p for p in doc['pages'] if p['page'] in pages]
    require(len(chosen) == len(pages), 'PDF page outside document')
    data = {'doc_id': doc['id'], 'approved_variables': schema['variables'], 'pages': chosen}
    content = json.dumps(data, ensure_ascii=True).replace('<', '\\u003c').replace('>', '\\u003e')
    require(len(content) <= 60000, 'PDF request exceeds technical call bound')
    return {'model': model, 'system': papers.SYSTEM, 'content': '<untrusted_data>\n' + content + '\n</untrusted_data>'}


def check_live_sources(state):
    for entry in state['documents']:
        if 'sha256' in entry:
            require(file_hash(entry['path']) == entry['sha256'], 'source changed; run again before approval/extraction')


def run(args):
    work = args.work_dir.resolve()
    manifest = load(args.manifest)
    require(isinstance(manifest, dict) and isinstance(manifest.get('documents'), list) and manifest['documents'], 'manifest requires documents list')
    model = os.environ.get('MODEL_ID')
    require(bool(model), 'source infra/config.env to set MODEL_ID')
    vocabulary = load(args.vocabulary) if args.vocabulary else None
    imports = import_index(args.import_results)
    state = {'stage': 'processing', 'manifest': str(args.manifest.resolve()), 'manifest_sha256': file_hash(args.manifest),
             'model': model, 'documents': [], 'calls_now': 0, 'reused_responses': 0, 'parse_hits': 0, 'proposals': {}, 'published': False}
    docs, configs = {}, {}
    stats = {'calls_now': 0, 'reused_responses': 0}
    for item in manifest['documents']:
        path = Path(item['path']).expanduser().resolve()
        entry = {'path': str(path), 'status': 'failed'}
        try:
            require(not path.is_relative_to(work), 'source cannot live inside artifact workspace')
            doc, reused = parse_cached(path, work)
            entry.update(doc_id=doc['id'], sha256=doc['sha256'], status=doc['status'])
            state['parse_hits'] += reused
            if doc['status'] != 'done':
                entry['error'] = doc.get('error_code')
            elif doc['id'] in docs:
                entry.update(status='skipped', error='duplicate')
            else:
                docs[doc['id']], configs[doc['id']] = doc, item
        except (ValueError, OSError, KeyError, TypeError) as exc:
            entry['error'] = str(exc)
        state['documents'].append(entry)
    bundle = {'version': 1, 'corpus_root': str(args.manifest.resolve()), 'corpus_paths': [e['path'] for e in state['documents']],
              'documents': list(docs.values()), 'profiles': [ingest.profile_document(d) for d in docs.values()]}
    state['artifact'] = artifact(work, 'bundles', bundle)
    previous = load(work / 'state.json') if (work / 'state.json').exists() else {}
    approval_path = str(args.approval.resolve()) if args.approval else previous.get('approval')
    approval = None
    if approval_path:
        try:
            approval = load(approval_path)
            review.checked_approval(approval, docs)
            state['approval'] = approval_path
        except (ValueError, OSError, KeyError, TypeError) as exc:
            state['approval_invalidated'] = str(exc)
            approval = None
    if approval is None:
        for doc_id, doc in docs.items():
            entry = next(e for e in state['documents'] if e.get('doc_id') == doc_id)
            try:
                content = adapter.request_data(bundle, doc_id, configs[doc_id].get('pages'), vocabulary)
                request = {'model': model, 'system': adapter.proposal_system(vocabulary), 'content': content}
                response, receipt = model_response(request, work, imports, args.invoke, args.retry_failed, stats=stats)
                proposal = ingest.validate_proposal(response, docs)
                require(response['doc_id'] == doc_id, 'proposal belongs to a different document')
                if vocabulary is not None:
                    require({v['id'] for v in proposal['variables']} <= {v['id'] for v in vocabulary}, 'variable outside supplied vocabulary')
                state['proposals'][doc_id] = proposal
                entry.update(status='awaiting_review', response=receipt)
            except (ValueError, OSError, KeyError, TypeError) as exc:
                entry.update(status='failed', error=str(exc))
        joint = joint_proposal(state['proposals'], docs)
        state['joint_proposal'] = artifact(work, 'joint', joint)
        state['schema_file'] = artifact(work, 'schemas', joint['schema'])
        request = review.review_request(joint['schema'], docs)
        state['review_request'] = artifact(work, 'reviews', request)
        state['stage'] = 'awaiting_review'
    else:
        check_live_sources(state)
        result = review.extract_tables(approval, docs)
        # Result identity includes approved schema, corpus and implementation, never stale downstream state.
        state['extraction_key'] = review.digest({'schema': approval['schema_sha256'], 'sources': review.snapshot(docs),
                                                'extractor': file_hash(ROOT / 'pipeline/review_extract.py')})
        state['extraction'] = artifact(work, 'extractions', result)
        state['papers'] = {}
        for doc_id, doc in docs.items():
            if doc['kind'] != 'paper':
                continue
            entry = next(e for e in state['documents'] if e.get('doc_id') == doc_id)
            try:
                request = paper_request(doc, approval['schema'], configs[doc_id].get('pages'), model)
                response, receipt = model_response(request, work, imports, args.invoke, args.retry_failed, stats=stats)
                checked = review.verify_paper_candidates(response, approval, docs, doc_id, configs[doc_id]['pages'])
                state['papers'][doc_id] = artifact(work, 'paper-candidates', checked)
                entry.update(status='awaiting_semantic_review', response=receipt)
            except (ValueError, OSError, KeyError, TypeError) as exc:
                entry.update(status='failed', error=str(exc))
        state['stage'] = 'extracted_draft'
    state['failures'] = sum(e['status'] == 'failed' for e in state['documents'])
    state.update(stats)
    artifact(work, 'history', state)
    save(work / 'state.json', state)
    print(json.dumps({k: state[k] for k in ('stage', 'failures', 'calls_now', 'reused_responses', 'parse_hits')}))
    return 1 if state['failures'] else 0


def approve_run(args):
    state = load(args.work_dir / 'state.json')
    require(state['stage'] == 'awaiting_review', 'run must be awaiting_review')
    require(state['failures'] == 0, 'resolve failures or explicitly exclude documents in a new manifest before approval')
    require(file_hash(state['manifest']) == state['manifest_sha256'], 'manifest changed; run again')
    check_live_sources(state)
    docs = review.document_index(load(state['artifact']))
    result = review.approve(load(state['review_request']), load(args.reviewed_schema or state['schema_file']), docs, args.version, args.reviewer)
    state['approval'] = artifact(args.work_dir, 'approvals', result)
    state['stage'] = 'approved'
    artifact(args.work_dir, 'history', state)
    save(args.work_dir / 'state.json', state)
    print(json.dumps({'stage': 'approved', 'approval': state['approval']}))
    return 0


def edit_run(args):
    state = load(args.work_dir / 'state.json')
    require('review_request' in state, 'a joint review request is required')
    require(file_hash(state['manifest']) == state['manifest_sha256'], 'manifest changed; run again')
    check_live_sources(state)
    previous = load(state['review_request'])
    # Editing an approved schema also invalidates approval, but keeps its exact revision history.
    schema = load(state['approval'])['schema'] if state.get('approval') else previous['schema']
    updated = review.edit_schema(schema, load(args.edits), args.version)
    request = review.review_request(updated, review.document_index(load(state['artifact'])))
    request['previous_request'] = state['review_request']
    request['edits'] = load(args.edits)
    state['review_request'] = artifact(args.work_dir, 'reviews', request)
    state['schema_file'] = artifact(args.work_dir, 'schemas', updated)
    for key in ('approval', 'extraction', 'extraction_key', 'papers'):
        state.pop(key, None)
    state['stage'] = 'awaiting_review'
    artifact(args.work_dir, 'history', state)
    save(args.work_dir / 'state.json', state)
    print(json.dumps({'stage': state['stage'], 'version': updated['version'], 'schema': state['schema_file']}))
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['run', 'edit', 'approve'])
    parser.add_argument('--work-dir', required=True, type=Path)
    parser.add_argument('--manifest', type=Path)
    parser.add_argument('--vocabulary', type=Path)
    parser.add_argument('--import-results', action='append', default=[], type=Path)
    parser.add_argument('--invoke', action='store_true', help='allow uncached model calls')
    parser.add_argument('--retry-failed', action='store_true', help='retry transport failures with no saved response')
    parser.add_argument('--approval', type=Path, help='explicit existing approval for exactly these source hashes')
    parser.add_argument('--reviewed-schema', type=Path)
    parser.add_argument('--version', type=int)
    parser.add_argument('--reviewer')
    parser.add_argument('--edits', type=Path)
    args = parser.parse_args()
    try:
        args.work_dir = args.work_dir.resolve()
        require(not args.work_dir.is_relative_to(ROOT), 'artifacts must stay outside repository')
        require(not args.work_dir.is_symlink(), 'workspace cannot be a symlink')
        args.work_dir.mkdir(parents=True, exist_ok=True)
        with (args.work_dir / '.lock').open('a') as lock:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            if args.action == 'run':
                require(args.manifest is not None, 'manifest required')
                return run(args)
            if args.action == 'edit':
                require(args.edits is not None and args.version is not None, 'edits and version required')
                return edit_run(args)
            require(args.version is not None and args.reviewer, 'version and reviewer required')
            return approve_run(args)
    except (ValueError, OSError, KeyError, TypeError) as exc:
        parser.exit(1, str(exc) + '\n')


if __name__ == '__main__':
    raise SystemExit(main())
