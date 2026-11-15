#!/usr/bin/env python3
"""Reproduce the explicitly delegated, bounded T37 table review outside the public pack."""
import argparse
import copy
import csv
import importlib.util
import json
from pathlib import Path

_spec = importlib.util.spec_from_file_location('publish_bundle', Path(__file__).with_name('publish_bundle.py'))
publish = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(publish)
review = publish.review
ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--corpus', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--apply-delegated-approval', action='store_true',
                        help='Explicitly apply the already reviewed docs/t37/revision_local.json; never a model decision')
    args = parser.parse_args()
    config = json.loads((ROOT/'docs/t37/revision_local.json').read_text())
    with (ROOT/'docs/t37/manifest_ebullicion.csv').open(encoding='utf-8-sig', newline='') as stream:
        manifest = list(csv.DictReader(stream))
    documents, entries, variables, columns = {}, {}, [], []
    selected = []
    for item in config['documents']:
        candidates = [m for m in manifest if m['incluido'] == 'True' and m['tipo'] == 'table' and m['psi_id'] == item['study']]
        publish.require(len(candidates) == 1, 'Ambiguous source selection: '+item['study'])
        source = candidates[0]
        doc = review.ingest.parse_document(args.corpus/source['lote'])
        publish.require(doc['sha256'] == source['sha256'] and doc['status'] == 'done', 'Source differs from reviewed manifest')
        did = doc['id']
        documents[did] = doc
        mapping = {v['column']: v for v in item['variables']}
        publish.require(set(mapping) <= set(doc['headers']), 'Reviewed column disappeared')
        for value in item['variables']:
            v = {k: copy.deepcopy(v) for k, v in value.items() if k != 'column'}
            candidates = []
            column_index = doc['headers'].index(value['column'])
            for row in doc['rows']:
                text = row['values'][column_index]
                if not text.strip():
                    continue
                if v['type'] == 'num':
                    try:
                        review.numeric_cell(text)
                    except ValueError:
                        continue
                candidates.append({'kind': 'table', 'doc_id': did, 'row': row['row'],
                                   'column': value['column'], 'text': text})
            publish.require(candidates, 'No explicit numeric/categorical evidence for '+value['id'])
            v.update(status='approved', records=len(candidates), merged_from=[], evidence=candidates[:1])
            variables.append(v)
        for header in doc['headers']:
            v = mapping.get(header)
            columns.append({'doc_id': did, 'column': header, 'variable': v['id'] if v else None,
                'unit': v['unit'] if v else None, 'convert': None, 'status': 'approved' if v else 'rejected',
                'note': 'Explicit unit spelling normalized; original header retained; no numeric conversion.' if v else item['rejected_note']})
        kind_col = item['kind_column']
        first = doc['rows'][0]
        entries[did] = {'sha256': doc['sha256'], 'study': item['study'], 'title': source['investigacion'],
            'doi': source['doi'], 'license': None, 'kind': item['kind'], 'kind_note': item['kind_note'],
            'kind_evidence': {'kind': 'table', 'doc_id': did, 'row': first['row'], 'column': kind_col,
                              'text': first['values'][doc['headers'].index(kind_col)]}}
        selected.append({'study': item['study'], 'source': source['lote'], 'sha256': doc['sha256']})
    schema = {'version': config['version'], 'status': 'proposed', 'variables': variables, 'columns': columns, 'constants': []}
    request = review.review_request(schema, documents)
    args.output.mkdir(parents=True, exist_ok=False)
    def save(name, value):
        (args.output/(name+'.json')).write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False)+'\n')
    save('review', request)
    save('corpus', {'documents': list(documents.values())})
    if not args.apply_delegated_approval:
        print('Review prepared only. No approval, extraction or publication.')
        return
    approval = review.approve(request, schema, documents, config['version'], config['by'])
    approval['review_authority'] = config['authority']
    extraction = review.extract_tables(approval, documents)
    first = next(r for r in extraction['records'] if entries[r['doc_id']]['study'] == 'PSI-87')
    values = {k: v[0] if isinstance(v, list) else v for k, v in first['values'].items()}
    metadata = {'id': config['id'], 'review_config_sha256': review.digest(config),
        'parsed_documents_sha256': review.digest(documents), 'documents': entries,
        'thresholds': config['thresholds'], 'lens': {'title': config['title'],
            'ml_thresholds': json.loads((ROOT/'web/src/contracts/ml-thresholds.json').read_text()),
            'byline': 'NASA PSI · reviewed local subset of two investigations',
            'disclaimer': 'Compares documented conditions; does not predict boiling or establish safety.',
            'default_axes': ['heat_flux', 'subcooling'], 'evidence': {'min_studies': 2},
            'presets': [{'id': 'observed', 'label': 'Observed PBE run', 'blurb': 'Source-record conditions; not a prediction.',
                         'values': values, 'active': list(values), 'source': first['id']}]}}
    metadata['approval'] = {'metadata_sha256': review.digest(metadata), 'sources': review.snapshot(documents),
        'by': config['by'], 'at': approval['schema']['approved_at'], 'authority': config['authority']}
    save('approval', approval)
    save('extraction', extraction)
    save('metadata', metadata)
    bundle = publish.build(approval, documents, extraction, metadata, 1, 1)
    destination = args.output/'bundle'
    destination.mkdir()
    for name, value in bundle.items():
        (destination/(name+'.json')).write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False)+'\n')
    save('evaluation', {'scope': config['scope'], 'authority': config['authority'], 'selected': selected,
        'config_sha256': review.digest(config), 'records': len(extraction['records']), 'rejected_cells': len(extraction['rejected']),
        'conflicts': len(extraction['conflicts']), 'bedrock_calls': 0, 'published': False})
    print(json.dumps({'records': len(extraction['records']), 'rejected_cells': len(extraction['rejected']),
                      'conflicts': len(extraction['conflicts']), 'published': False, 'bedrock_calls': 0}))


if __name__ == '__main__':
    main()
