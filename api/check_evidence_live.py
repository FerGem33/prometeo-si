"""Real owner-only diagnostics and T35–T37 workflow. Tokens stay in environment."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import time
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen
import uuid

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location('review_extract', ROOT/'pipeline/review_extract.py')
review = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(review)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument('--diagnostics-project')
    action.add_argument('--workflow-dir', type=Path)
    action.add_argument('--retry-project')
    action.add_argument('--paper-project')
    parser.add_argument('--retry-docs', nargs='+')
    parser.add_argument('--paper-doc')
    parser.add_argument('--pages', nargs='+', type=int)
    parser.add_argument('--resume-receipt', type=Path)
    parser.add_argument('--inspect-project')
    parser.add_argument('--paper', type=Path, help='Include one reviewed-manifest PDF as contextual evidence')
    parser.add_argument('--stop-after-extract', action='store_true', help='Save candidates for explicit semantic decisions before publishing')
    parser.add_argument('--manual-recovery', action='store_true', help='Explicitly use the delegated reference mapping after an invalid AI proposal')
    parser.add_argument('--inspect-paper-responses', action='store_true', help='Owner-only opt-in raw response inspection; output must remain private')
    parser.add_argument('--schema-additions', type=Path, help='Explicit source-bound reviewed variable additions, kept outside Git')
    parser.add_argument('--output', default='/tmp/prometeo-evidence-diagnostics.json')
    args = parser.parse_args()
    if args.workflow_dir and args.retry_docs and not args.resume_receipt:
        parser.error('Workflow retries require an existing receipt')
    base = os.environ['API_URL'].rstrip('/')
    if base != 'https://ve5oqmsyie.execute-api.us-east-1.amazonaws.com': parser.error('Unexpected API')
    checks = []
    def send(method, path, payload=None, expected=200, auth=True, headers=None):
        url = path if path.startswith('https://') else base+path
        outgoing = dict(headers or {})
        if auth: outgoing.update(Authorization='Bearer '+os.environ['T33_TOKEN_A'], Origin=os.environ['CF_URL'])
        if isinstance(payload, dict):
            payload = json.dumps(payload).encode(); outgoing['Content-Type'] = 'application/json'
        try: response = urlopen(Request(url, data=payload, method=method, headers=outgoing), timeout=60)
        except HTTPError as exc: response = exc
        with response: status, raw = response.code, response.read()
        checks.append({'method': method, 'path': path if not path.startswith('https://') else 'S3 signed object', 'http': status})
        if status not in (expected if isinstance(expected, tuple) else (expected,)):
            detail = json.loads(raw).get('error', {}) if raw and auth else {}
            raise RuntimeError('HTTP '+str(status)+' '+str(detail)[:500])
        return json.loads(raw) if raw and auth else raw
    def wait(pid, selected=None):
        for _ in range(120):
            jobs = send('GET', '/projects/'+pid+'/jobs')
            chosen = [j for j in jobs['jobs'] if selected is None or j['doc_id'] in selected]
            print(json.dumps({'status': jobs['project_status'], 'totals': jobs['totals']}), flush=True)
            if chosen and all(j['status'] in ('done', 'failed', 'skipped') for j in chosen): return jobs
            time.sleep(5)
        raise RuntimeError('Processing timeout; resume the existing project, do not upload again')
    if args.inspect_project:
        diagnosis = send('GET', '/projects/'+args.inspect_project+'/diagnostics')
        Path('/tmp/prometeo-t34-postfix-diagnostics.json').write_text(json.dumps(diagnosis, indent=2)+'\n')
        print(json.dumps({'inspected': [{'name': d['name'], 'status': d['status'],
            'responses': len(d['responses'])} for d in diagnosis['items']]}), flush=True)
    if args.diagnostics_project:
        value = send('GET', '/projects/'+args.diagnostics_project+'/diagnostics')
        if args.inspect_paper_responses:
            responses = []
            for item in value['items']:
                for response in item['responses']:
                    if response['request'].startswith('paper-'):
                        responses.append(send('GET', '/projects/'+args.diagnostics_project+'/diagnostics?doc_id='+item['doc_id']+'&response='+response['request']))
            value['paper_responses'] = responses
        Path(args.output).write_text(json.dumps(value, indent=2)+'\n'); print(json.dumps(value, indent=2)); return
    if args.retry_project:
        if not args.retry_docs: parser.error('Retry requires --retry-docs (never replay DLQ automatically)')
        send('POST', '/projects/'+args.retry_project+'/ingest/resume', {'doc_ids': args.retry_docs}, 202)
        value = wait(args.retry_project, set(args.retry_docs))
        diagnostic = send('GET', '/projects/'+args.retry_project+'/diagnostics')
        Path(args.output).write_text(json.dumps({'jobs': value, 'diagnostics': diagnostic}, indent=2)+'\n')
        print(json.dumps({'result': value['totals'], 'selected': len(args.retry_docs)})); return
    if args.paper_project:
        if not args.paper_doc: parser.error('--paper-project requires --paper-doc')
        endpoint = '/projects/'+args.paper_project
        send('POST', endpoint+'/papers/'+args.paper_doc+'/extract', {'pages': args.pages or []}, 202)
        for _ in range(90):
            value = send('GET', endpoint+'/paper-candidates')
            if all(d['status'] != 'pending' for d in value['documents']): break
            time.sleep(3)
        else: raise RuntimeError('PDF extraction pending; repeat the same selection without uploading again')
        Path(args.output).write_text(json.dumps(value, indent=2)+'\n')
        print(json.dumps({'project_id': args.paper_project, 'documents': [{'doc_id': d['doc_id'], 'status': d['status'], 'pages': d.get('pages')} for d in value['documents']], 'candidates': len(value['items'])})); return
    config = json.loads((ROOT/'docs/t37/revision_local.json').read_text())
    receipt = json.loads(args.resume_receipt.read_text()) if args.resume_receipt else {'checks': checks, 'sources': []}
    if args.resume_receipt:
        checks[:0] = receipt.get('checks', [])
    receipt['checks'] = checks
    def save(): Path(args.output).write_text(json.dumps(receipt, indent=2)+'\n')
    try:
        if 'project_id' not in receipt:
            pid = send('POST', '/projects', {'name': 'Reviewed boiling workflow '+uuid.uuid4().hex[:6],
                'intent': 'Compare documented conditions across the reviewed boiling sources; do not predict outcomes.'}, 201)['id']
            receipt['project_id'] = pid; save()
            pending = []
            paths = []
            for entry in config['documents']:
                selected_paths = list(args.workflow_dir.glob(entry['study']+'__*.csv'))
                if len(selected_paths) != 1: raise RuntimeError('Ambiguous reviewed table '+entry['study'])
                paths.extend(selected_paths)
            if args.paper: paths.append(args.paper)
            for path in paths:
                raw = path.read_bytes(); digest = hashlib.sha256(raw).hexdigest(); study = path.name.split('__')[0]
                kind = 'paper' if path.suffix.lower() == '.pdf' else 'table'
                ticket = send('POST', '/projects/'+pid+'/documents', {'name': path.name, 'media_type': 'application/pdf' if kind == 'paper' else 'text/csv', 'bytes': len(raw)}, 201,
                    headers={'Idempotency-Key': 'workflow-'+digest[:32]})
                send('PUT', ticket['upload']['url'], raw, auth=False, headers=ticket['upload']['headers'])
                item = {'doc_id': ticket['doc_id'], 'name': path.name, 'sha256': digest, 'study': study, 'kind': kind}
                receipt['sources'].append(item); pending.append(item); save()
            for source in pending: send('POST', '/projects/'+pid+'/documents/'+source['doc_id']+'/complete', {'sha256': source['sha256']})
        pid = receipt['project_id']; endpoint = '/projects/'+pid
        if 'approved' not in receipt:
            if args.retry_docs:
                send('POST', endpoint+'/ingest/resume', {'doc_ids': args.retry_docs}, 202)
            jobs = wait(pid)
            if any(j['status'] == 'failed' for j in jobs['jobs']):
                receipt['diagnostics'] = send('GET', endpoint+'/diagnostics'); save()
                if not args.manual_recovery:
                    raise RuntimeError('Proposal rejected; diagnostics saved, retain this project for targeted retry')
                for job in jobs['jobs']:
                    if job['status'] != 'failed': continue
                    source = next(s for s in receipt['sources'] if s['doc_id'] == job['doc_id'])
                    variables, columns = [], []
                    if source.get('kind') != 'paper':
                        document = review.ingest.parse_document(args.workflow_dir/source['name']); document['id'] = source['doc_id']
                        reference = next(d for d in config['documents'] if d['study'] == source['study'])
                        for value in reference['variables']:
                            index = document['headers'].index(value['column'])
                            row = next(r for r in document['rows'] if r['values'][index].strip())
                            variables.append({k: value[k] for k in ('id', 'label', 'type', 'unit')} | {'evidence': [
                                {'kind': 'table', 'doc_id': document['id'], 'row': row['row'], 'column': value['column'], 'text': row['values'][index]}]})
                        for header in document['headers']:
                            v = next((v for v in reference['variables'] if v['column'] == header), None)
                            columns.append({'column': header, 'variable': v['id'] if v else None, 'unit': v['unit'] if v else None, 'convert': None})
                    send('POST', endpoint+'/documents/'+source['doc_id']+'/proposal', {'proposal': {'doc_id': source['doc_id'],
                        'variables': variables, 'columns': columns}, 'reason': config['authority']+'; manual recovery from the reviewed reference; model rejection retained. PDF conditions are contextual only.'})
            schema = send('GET', endpoint+'/schema')
            edits, metadata_docs, prepared = [], {}, {}
            for variable in schema['variables']:
                edits.append({'op': 'set_status', 'target': 'variable', 'id': variable['id'], 'status': 'rejected'})
            for source in receipt['sources']:
                if source.get('kind') == 'paper':
                    import csv
                    page = send('GET', endpoint+'/documents/'+source['doc_id']+'/text?page=1')
                    with (ROOT/'docs/t37/manifest_ebullicion.csv').open(encoding='utf-8-sig', newline='') as f:
                        item = next(m for m in csv.DictReader(f) if m['sha256'] == source['sha256'] and m['incluido'] == 'True')
                    quote_text = next(line.strip() for line in page['text'].splitlines() if len(line.strip()) > 15 and any(c.isalpha() for c in line))
                    metadata_docs[source['doc_id']] = {'sha256': source['sha256'], 'study': source['study'], 'doi': item['doi'],
                        'title': item['investigacion'], 'kind': 'campaign', 'kind_note': 'Reviewed article identity; contextual PDF evidence only, no table-wide attribution.',
                        'license': None, 'kind_evidence': {'kind': 'paper', 'doc_id': source['doc_id'], 'page': 1, 'quote': quote_text}}
                    continue
                doc = review.ingest.parse_document(args.workflow_dir/source['name']); doc['id'] = source['doc_id']
                if doc['sha256'] != source['sha256']: raise RuntimeError('Source changed')
                reference = next(d for d in config['documents'] if d['study'] == source['study'])
                selected = {v['column']: v for v in reference['variables']}
                for value in reference['variables']:
                    evidence = []
                    index = doc['headers'].index(value['column'])
                    for row in doc['rows']:
                        text = row['values'][index]
                        if not text.strip(): continue
                        if value['type'] == 'num':
                            try: review.numeric_cell(text)
                            except ValueError: continue
                        evidence.append({'kind': 'table', 'doc_id': doc['id'], 'row': row['row'], 'column': value['column'], 'text': text})
                    var = {k: v for k, v in value.items() if k != 'column'}
                    var.update(id='human_'+value['id'], evidence=evidence[:1], records=len(evidence))
                    edits.extend([{'op': 'add_variable', 'variable': var},
                        {'op': 'set_status', 'target': 'variable', 'id': var['id'], 'status': 'approved'}])
                for header in doc['headers']:
                    v = selected.get(header)
                    edits.extend([{'op': 'map_column', 'doc_id': doc['id'], 'column': header, 'variable': 'human_'+v['id'] if v else None},
                        {'op': 'set_convert', 'doc_id': doc['id'], 'column': header, 'unit': v['unit'] if v else None, 'convert': None},
                        {'op': 'set_status', 'target': 'column', 'id': header, 'doc_id': doc['id'], 'status': 'approved' if v else 'rejected'}])
                first = doc['rows'][0]
                # Identity and DOI are taken from the versioned, SHA-bound NASA manifest.
                import csv
                with (ROOT/'docs/t37/manifest_ebullicion.csv').open(encoding='utf-8-sig', newline='') as f:
                    item = next(m for m in csv.DictReader(f) if m['sha256'] == doc['sha256'] and m['incluido'] == 'True')
                metadata_docs[doc['id']] = {'sha256': doc['sha256'], 'study': source['study'], 'doi': item['doi'], 'title': item['investigacion'],
                    'kind': reference['kind'], 'kind_note': reference['kind_note'], 'license': None,
                    'kind_evidence': {'kind': 'table', 'doc_id': doc['id'], 'row': first['row'], 'column': reference['kind_column'],
                                      'text': first['values'][doc['headers'].index(reference['kind_column'])]}}
                prepared[source['study']] = doc
            if args.schema_additions:
                additions = json.loads(args.schema_additions.read_text())
                for entry in additions['variables']:
                    source = next(s for s in receipt['sources'] if s['sha256'] == entry['source_sha256'])
                    variable = entry['variable']
                    for citation in variable['evidence']: citation['doc_id'] = source['doc_id']
                    edits.extend([{'op': 'add_variable', 'variable': variable},
                                  {'op': 'set_status', 'target': 'variable', 'id': variable['id'], 'status': 'approved'}])
                receipt['schema_additions_sha256'] = hashlib.sha256(args.schema_additions.read_bytes()).hexdigest(); save()
            schema = send('PATCH', endpoint+'/schema', {'version': schema['version'], 'edits': edits})
            doc = prepared['PSI-87']; first = doc['rows'][0]
            reference = next(d for d in config['documents'] if d['study'] == 'PSI-87')
            values = {'human_'+v['id']: review.numeric_cell(first['values'][doc['headers'].index(v['column'])])[0] for v in reference['variables']}
            metadata = {'id': 'psi-boiling-project', 'documents': metadata_docs, 'thresholds': config['thresholds'],
                'lens': {'title': config['title'], 'byline': 'Two reviewed NASA PSI studies',
                    'disclaimer': 'Compares documented conditions; no prediction of outcomes or safety.',
                    'presets': [{'id': 'observed', 'label': 'Observed source run', 'blurb': 'Reviewed record conditions.',
                        'values': values, 'active': list(values), 'source': doc['id']+':row:'+str(first['row'])}],
                    'default_axes': ['human_heat_flux', 'human_subcooling'], 'evidence': {'min_studies': 2},
                    'ml_thresholds': json.loads((ROOT/'web/src/contracts/ml-thresholds.json').read_text())}}
            approved = send('POST', endpoint+'/schema/approve', {'version': schema['version'], 'metadata': metadata,
                'review_authority': config['authority']+'; reference config SHA256 '+review.digest(config)
                    + ('; explicit source-bound additions SHA256 '+receipt['schema_additions_sha256'] if args.schema_additions else '')})
            receipt['approved'] = {'version': approved['version'], 'authority': config['authority']}; save()
        wait(pid)
        for _ in range(90):
            ready = send('GET', endpoint+'/records', expected=(200, 409))
            if 'items' in ready: break
            time.sleep(3)
        else: raise RuntimeError('Table extraction not ready; resume the receipt')
        if args.stop_after_extract:
            for _ in range(90):
                candidates = send('GET', endpoint+'/paper-candidates')
                if all(d['status'] != 'pending' for d in candidates['documents']): break
                time.sleep(3)
            Path('/tmp/prometeo-live-paper-candidates.json').write_text(json.dumps(candidates, indent=2)+'\n')
            receipt['paper_review'] = {'documents': len(candidates['documents']), 'candidates': len(candidates['items']), 'status': 'awaiting_explicit_decisions'}
            save(); print(json.dumps({'project_id': pid, 'review_file': '/tmp/prometeo-live-paper-candidates.json'})); return
        first_publish = send('POST', endpoint+'/publish', {})
        receipt['first_pack_version'] = first_publish['pack_version']; save()
        if 'correction' not in receipt:
            rows = send('GET', endpoint+'/records')['items']
            record = next(r for r in rows if r['study'] == 'PSI-46' and r['values'])
            variable, value = next(iter(record['values'].items()))
            changed = send('PATCH', endpoint+'/records/'+quote(record['id'], safe=''), {'variable': variable, 'value': value,
                'reason': 'Live persistence check: same source value confirmed; no scientific value was altered.'})
            if changed['corrections'][variable]['from'] != value: raise RuntimeError('Original value lost')
            receipt['correction'] = {'record_id': record['id'], 'variable': variable, 'same_value_confirmation': True,
                                     'by': changed['corrections'][variable]['by']}; save()
        published = send('POST', endpoint+'/publish', {})
        again = send('POST', endpoint+'/publish', {})
        if published['pack_version'] != again['pack_version']: raise RuntimeError('Publication replay created duplicate version')
        send('GET', endpoint+'/pack', expected=401, auth=False)
        output = Path('/tmp/prometeo-live-project-bundle'); output.mkdir(exist_ok=True)
        for name, url in published['files'].items():
            raw = send('GET', url, auth=False)
            (output/(name+'.json')).write_bytes(raw)
        pack = json.loads((output/'pack.json').read_text())
        synthesis = send('POST', endpoint+'/synthesis', {'study_ids': [s['id'] for s in pack['studies']]})
        if not synthesis['sentences']: raise RuntimeError('Synthesis returned no cited excerpts')
        receipt.update(final_pack_version=published['pack_version'], records=len(pack['records']), studies=len(pack['studies']),
                       synthesis={'mode': synthesis['mode'], 'sentences': len(synthesis['sentences'])}, bundle=str(output))
        save(); print(json.dumps({k: receipt[k] for k in ('project_id', 'final_pack_version', 'records', 'studies', 'synthesis', 'bundle')}))
    finally: save()


if __name__ == '__main__': main()
