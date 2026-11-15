"""Real A/B checks of the completed backend. No tokens, signed URLs or source text in receipts."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True)
    parser.add_argument('--paper-decisions', type=Path)
    parser.add_argument('--claim-file', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    base = os.environ['API_URL'].rstrip('/')
    if base != 'https://ve5oqmsyie.execute-api.us-east-1.amazonaws.com': parser.error('Unexpected API')
    root = Path('/tmp/prometeo-backend-live'); root.mkdir(exist_ok=True)
    receipt = {'project_id': args.project, 'checks': []}
    prefix = '/projects/'+args.project
    def send(method, path, data=None, expected=200, user='A', signed=False):
        headers = {'Origin': os.environ['CF_URL']}
        if not signed: headers['Authorization'] = 'Bearer '+os.environ['T33_TOKEN_'+user]
        if data is not None: headers['Content-Type'] = 'application/json'
        payload = json.dumps(data).encode() if data is not None else None
        try: response = urlopen(Request(path if signed else base+path, data=payload, method=method, headers=headers), timeout=60)
        except HTTPError as exc: response = exc
        with response:
            status, raw = response.code, response.read()
            cors = response.headers.get('Access-Control-Allow-Origin')
        receipt['checks'].append({'method': method, 'path': 'private signed object' if signed else path, 'http': status})
        if status != expected:
            error = json.loads(raw).get('error', {}) if raw and not signed else {}
            raise RuntimeError('HTTP '+str(status)+' '+str(error)[:400])
        if signed:
            if cors != os.environ['CF_URL']: raise RuntimeError('Private download CORS missing')
            return raw
        return json.loads(raw) if raw else None
    def download(files):
        output = root/'bundle'; output.mkdir(exist_ok=True)
        for name, url in files['files'].items():
            (output/(name+'.json')).write_bytes(send('GET', url, signed=True))
        return json.loads((output/'pack.json').read_text()), json.loads((output/'lens.json').read_text())
    try:
        if args.paper_decisions:
            decisions = json.loads(args.paper_decisions.read_text())
            for entry in decisions.get('candidates', []):
                send('POST', prefix+'/paper-candidates/'+entry['id']+'/review', entry['decision'])
            for entry in decisions.get('exclude_documents', []):
                send('POST', prefix+'/papers/'+entry['doc_id']+'/review', {'reason': entry['reason']})
        if args.claim_file:
            send('POST', prefix+'/claims', json.loads(args.claim_file.read_text()), expected=201)
        published = send('POST', prefix+'/publish', {})
        pack, lens = download(published)
        receipt.update(pack_version=published['pack_version'], records=len(pack['records']), studies=len(pack['studies']),
                       contextual_candidates=len(pack.get('contextual_evidence', [])), claims=len(pack.get('claims', [])))
        if not lens['presets']: raise RuntimeError('This comparison smoke needs a sourced preset')
        scenario = {'values': lens['presets'][0]['values'], 'active': lens['presets'][0]['active']}
        payload = {'name': 'Real persisted backend smoke', 'scenario': scenario}
        saved = send('PUT', prefix+'/proposals/backend-smoke', payload)
        if send('PUT', prefix+'/proposals/backend-smoke', payload) != saved: raise RuntimeError('Repeated save changed proposal')
        if send('GET', prefix+'/proposals/backend-smoke') != saved: raise RuntimeError('Saved proposal changed')
        if not any(i['id'] == saved['id'] for i in send('GET', prefix+'/proposals')['items']): raise RuntimeError('Saved proposal not listed')
        for suffix in ('/proposals', '/proposals/backend-smoke', '/claims', '/lens', '/paper-candidates', '/pack'):
            send('GET', prefix+suffix, expected=404, user='B')
        send('PUT', prefix+'/proposals/backend-smoke', payload, expected=404, user='B')
        send('POST', prefix+'/claims', {'claim': {}, 'reason': 'Cross-owner check'}, expected=404, user='B')
        numeric = next(v for v in pack['schema']['variables'] if v['type'] == 'num' and v['id'] in scenario['values'])
        question = 'Set '+numeric['label']+' to '+str(scenario['values'][numeric['id']])+' '+numeric.get('unit', '')+'.'
        asked = send('POST', prefix+'/ask', {'question': question, 'version': 2})
        if numeric['id'] not in asked.get('values', {}): raise RuntimeError('Project ask lost the stated variable')
        receipt['ask'] = {'variable': numeric['id'], 'matches_source_value': asked['values'][numeric['id']] == scenario['values'][numeric['id']]}
        if not receipt['ask']['matches_source_value']: raise RuntimeError('Project ask changed source value')
        script = '''import fs from "node:fs";
import {findings,evidenceLevels} from "/tmp/prometeo-engine.mjs";
const pack=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
const lens=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
const p=lens.presets[0],scenario={values:p.values,active:p.active};
process.stdout.write(JSON.stringify({scenario,levels:evidenceLevels(pack,lens,scenario),findings:findings(pack,lens,scenario)}));'''
        generated = subprocess.run(['node', '--input-type=module', '-e', script, str(root/'bundle/pack.json'), str(root/'bundle/lens.json')], check=True, capture_output=True, text=True)
        analysis = json.loads(generated.stdout)
        analyzed = send('POST', prefix+'/analysis', analysis)
        receipt['analysis'] = {'mode': analyzed['mode'], 'sentences': len(analyzed['sentences'])}
        forged = {**analysis, 'scenario': {**scenario, 'values': {**scenario['values'], 'unknown': 1}}}
        send('POST', prefix+'/analysis', forged, expected=400)
        synthesis = send('POST', prefix+'/synthesis', {'study_ids': [s['id'] for s in pack['studies']]})
        receipt['synthesis'] = {'mode': synthesis['mode'], 'sentences': len(synthesis['sentences']),
            'represented_studies': synthesis.get('represented_studies'), 'omitted_studies': synthesis.get('omitted_studies')}
        if synthesis['mode'] != 'ai': raise RuntimeError('Real synthesis selection not verified; fallback='+str(synthesis.get('fallback_reason')))
        # Repeat: same published signature/focus must reuse the successful selection.
        if send('POST', prefix+'/synthesis', {'study_ids': [s['id'] for s in pack['studies']]}) != synthesis: raise RuntimeError('Synthesis checkpoint changed')
        before_hash = hashlib.sha256((root/'bundle/pack.json').read_bytes()).hexdigest()
        project = send('GET', prefix)
        intent = project['intent']+' [Review '+numeric['label']+']'
        changed = send('PATCH', prefix, {'intent': intent})
        if changed['pack_version'] != published['pack_version'] or changed['lens_version'] != published['lens_version']+1:
            raise RuntimeError('Intent changed extraction/pack version or failed to increment lens')
        repeated = send('PATCH', prefix, {'intent': intent})
        if repeated['lens_version'] != changed['lens_version']: raise RuntimeError('Intent replay changed lens version')
        refreshed = send('GET', prefix+'/pack'); pack, lens = download(refreshed)
        if hashlib.sha256((root/'bundle/pack.json').read_bytes()).hexdigest() != before_hash: raise RuntimeError('Intent reran extraction or changed pack bytes')
        old = send('GET', prefix+'/proposals/backend-smoke')
        if old['lens_version'] != saved['lens_version']: raise RuntimeError('Proposal evaluation version was lost')
        if send('POST', prefix+'/publish', {})['pack_version'] != refreshed['pack_version']: raise RuntimeError('Intent-only publish was not idempotent')
        receipt['intent_change'] = {'pack_unchanged': True, 'lens_version': changed['lens_version'], 'proposal_version_preserved': True}
        current_lens = send('GET', prefix+'/lens')
        draft = {**current_lens['lens'], 'title': current_lens['lens']['title']+' (reviewed)'}
        send('PUT', prefix+'/lens', {'version': current_lens['lens_version'], 'lens': draft, 'reason': 'Live review of presentation metadata; scientific values and criteria unchanged.'})
        final = send('POST', prefix+'/publish', {})
        pack, lens = download(final)
        receipt['final_versions'] = {k: final[k] for k in ('pack_version', 'lens_version')}
        for context in pack.get('contextual_evidence', []):
            citation = context['citation']
            source = next(s for s in pack['sources'] if s['id'] == citation['doc_id'])
            signed = send('POST', prefix+'/documents/'+source['id']+'/url', {'page': citation['page']})
            url = signed.get('url')
            if not url or '#page='+str(citation['page']) not in url: raise RuntimeError('PDF original page fragment missing')
            raw = send('GET', url, signed=True)
            if hashlib.sha256(raw).hexdigest() != source['sha256']: raise RuntimeError('Original PDF hash changed')
            (root/'original.pdf').write_bytes(raw)
            page = send('GET', prefix+'/documents/'+source['id']+'/text?page='+str(citation['page']))
            if citation['quote'] not in page['text']: raise RuntimeError('Published PDF quote missing from source page')
            receipt['original_pdf'] = {'sha256_match': True, 'page': citation['page'], 'literal_quote_found': True}
            break
        send('DELETE', prefix+'/proposals/backend-smoke', expected=204)
        send('GET', prefix+'/proposals/backend-smoke', expected=404)
        receipt['result'] = 'passed'
        print(json.dumps({k: v for k, v in receipt.items() if k != 'checks'}))
    finally:
        args.output.write_text(json.dumps(receipt, indent=2)+'\n')


if __name__ == '__main__': main()
