#!/usr/bin/env python3
"""T32 real-model table evaluation against the published human baseline. No deployment.

Writes raw responses and artifacts ONLY to a new local directory outside repo/corpus.
Variable vocabulary is supplied from the published schema; no mapping is sent to the model.
This measures agreement, not D7 scientific accuracy or human approval.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tables-dir', required=True, type=Path)
    parser.add_argument('--output-dir', required=True, type=Path)
    parser.add_argument('--source', action='append', help='limit a diagnostic retry to these published source IDs')
    args = parser.parse_args()
    output = args.output_dir.resolve()
    if output.exists() or output.is_relative_to(ROOT) or output.is_relative_to(args.tables_dir.resolve()):
        parser.error('output must be a new directory outside repo and corpus')
    if os.environ.get('AWS_PROFILE') != 'prometeo' or not os.environ.get('MODEL_ID'):
        parser.error('set AWS_PROFILE=prometeo and source infra/config.env')
    load = lambda p: json.loads(p.read_text())
    pack_path, mapping_path = ROOT / 'web/public/demo/pack.json', ROOT / 'web/public/demo/mapping.json'
    pack, mapping = load(pack_path), load(mapping_path)
    sources = [s for s in pack['sources'] if s['kind'] == 'table']
    if args.source:
        if not set(args.source) <= {s['id'] for s in sources}:
            parser.error('unknown source ID')
        sources = [s for s in sources if s['id'] in args.source]
    baseline = {t['source']: {c['column']: c for c in t['columns']} for t in mapping['tables']}
    vocabulary = [{k: v[k] for k in ('id', 'label', 'type', 'unit') if k in v} for v in pack['schema']['variables']]
    ingest = module('ingest', ROOT / 'pipeline/ingest.py')
    adapter = module('ingest_propose', ROOT / 'api/ingest_propose.py')
    review = module('review_extract', ROOT / 'pipeline/review_extract.py')
    from anthropic import AnthropicBedrock
    output.mkdir(parents=True)
    report = {'model': os.environ['MODEL_ID'], 'mode': 'real_bedrock', 'baseline_sha256': hashlib.sha256(mapping_path.read_bytes()).hexdigest(),
              'method': 'published vocabulary only; exact column variable and source unit; no roles or constants scored; D7 pending',
              'tables': [], 'tokens': {'input': 0, 'output': 0}}
    def save(path, value):
        path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    with AnthropicBedrock(aws_profile='prometeo', aws_region='us-east-1', timeout=90, max_retries=0) as client:
        for source in sources:
            folder = output / source['id']
            folder.mkdir()
            entry = {'source': source['id'], 'name': source['name'], 'scored': source['id'] in baseline, 'status': 'failed'}
            try:
                matches = list(args.tables_dir.rglob(source['name']))
                if len(matches) != 1:
                    raise ValueError('source missing or ambiguous')
                doc = ingest.parse_document(matches[0])
                if doc['status'] != 'done' or doc['sha256'] != source['sha256']:
                    raise ValueError('parse failed or source differs from published SHA')
                doc['path'] = str(matches[0].relative_to(args.tables_dir))
                artifact = {'documents': [doc], 'profiles': [ingest.profile_document(doc)]}
                save(folder / 'parsed.json', artifact)
                content = adapter.request_data(artifact, doc['id'], None, vocabulary)
                system = adapter.proposal_system(vocabulary)
                save(folder / 'request.json', {'model': report['model'], 'system': system, 'content': content})
                response = adapter.propose(client, report['model'], content, folder / 'raw.json', system=system)
                save(folder / 'response.json', response)
                schema = ingest.validate_proposal(response, {doc['id']: doc})
                if not {v['id'] for v in schema['variables']} <= {v['id'] for v in vocabulary}:
                    raise ValueError('variable outside approved vocabulary')
                save(folder / 'proposal.json', schema)
                entry.update(status='valid_proposed', sha256=doc['sha256'], rows=len(doc['rows']), citations=sum(len(v['evidence']) for v in schema['variables']))
                if entry['scored']:
                    aligned = review.align_published_columns(doc['headers'], list(baseline[source['id']].values()))
                    comparisons = []
                    for col in response['columns']:
                        human = aligned[col['column']]
                        comparisons.append({'column': col['column'], 'expected': {'variable': human.get('variable'), 'unit': human.get('unit')},
                            'proposed': {'variable': col['variable'], 'unit': col['unit']},
                            'assignment_match': human.get('variable') == col['variable'],
                            'joint_match': human.get('variable') == col['variable'] and human.get('unit') == col['unit']})
                    entry['comparisons'] = comparisons
            except Exception as exc:
                # Preserve per-document failures and raw model output; continue the bounded corpus.
                entry.update(status='failed', error=type(exc).__name__ + ': ' + str(exc))
            if (folder / 'raw.json').exists():
                usage = load(folder / 'raw.json').get('usage', {})
                entry['usage'] = usage
                report['tokens']['input'] += usage.get('input_tokens', 0)
                report['tokens']['output'] += usage.get('output_tokens', 0)
            report['tables'].append(entry)
            save(output / 'report.json', report)
            print(json.dumps({k: entry[k] for k in ('source', 'status', 'error') if k in entry}), flush=True)
    eligible = sum(len(baseline[s['id']]) for s in sources if s['id'] in baseline)
    comparisons = [c for t in report['tables'] for c in t.get('comparisons', [])]
    report['metrics'] = {'tables_requested': len(sources), 'tables_valid': sum(t['status'] == 'valid_proposed' for t in report['tables']),
                         'eligible_columns': eligible, 'compared_columns': len(comparisons),
                         'assignment_matches': sum(c['assignment_match'] for c in comparisons),
                         'joint_matches': sum(c['joint_match'] for c in comparisons)}
    save(output / 'report.json', report)
    print(json.dumps(report['metrics']))
    return 1 if any(t['status'] == 'failed' for t in report['tables']) else 0


if __name__ == '__main__':
    raise SystemExit(main())
