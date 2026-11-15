#!/usr/bin/env python3
"""Extract table cells against the EXISTING human-approved demo mapping, without new approvals.

No constants, category synonym inference, or pack writes. Reports differences separately.
"""
import argparse
import copy
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('review_extract', Path(__file__).with_name('review_extract.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tables-dir', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()
    output = args.output_dir.resolve()
    if output.exists() or output.is_relative_to(ROOT) or output.is_relative_to(args.tables_dir.resolve()):
        parser.error('output must be a new directory outside repo/corpus')
    load = lambda p: json.loads(p.read_text())
    pack = load(ROOT / 'web/public/demo/pack.json')
    mapping = load(ROOT / 'web/public/demo/mapping.json')
    if mapping.get('approved_by') != 'human' or not mapping.get('approved_at'):
        parser.error('published human approval missing')
    docs, by_source = {}, {}
    for source in pack['sources']:
        if source['kind'] != 'table': continue
        paths = list(args.tables_dir.rglob(source['name']))
        if len(paths) != 1: parser.error('missing/ambiguous source ' + source['name'])
        doc = m.ingest.parse_document(paths[0])
        if doc['status'] != 'done' or doc['sha256'] != source['sha256']:
            parser.error('source changed or failed: ' + source['name'])
        doc['path'] = str(paths[0].relative_to(args.tables_dir))
        docs[doc['id']] = doc
        by_source[source['id']] = doc
    schema = {'version': 1, 'status': 'approved', 'approved_by': mapping['approved_by'],
              'approved_at': mapping['approved_at'], 'variables': [], 'columns': [], 'constants': []}
    for v in pack['schema']['variables']:
        schema['variables'].append({**{k: v[k] for k in ('id', 'label', 'unit', 'type', 'role') if k in v}, 'status': 'approved'})
    tables = {t['source']: t for t in mapping['tables']}
    for source, doc in by_source.items():
        columns = m.align_published_columns(doc['headers'], tables[source]['columns']) if source in tables else {}
        for header in doc['headers']:
            col = copy.deepcopy(columns.get(header, {'column': header, 'variable': None, 'status': 'rejected'}))
            col.update(doc_id=doc['id'])
            schema['columns'].append(col)
    approval = {'stage': 'approved', 'documents': m.snapshot(docs), 'schema': schema, 'schema_sha256': m.digest(schema),
                'approval_origin': {'kind': 'existing_published_mapping', 'path': 'web/public/demo/mapping.json', 'sha256': m.digest(mapping)},
                'limitations': ['No model proposal has been approved. Existing approval reused only for mapped table cells.',
                                'Constants excluded: local scope and citation review needed. Synonyms not inferred.']}
    result = m.extract_tables(approval, docs)
    draft_by_key = {(r['doc_id'], r['row']): r for r in result['records']}
    numeric_total = numeric_match = category_total = category_match = 0
    diffs = []
    for row in pack['records']:
        src = row.get('source', {})
        if src.get('id') not in by_source: continue
        draft = draft_by_key.get((by_source[src['id']]['id'], src.get('row')), {'values': {}})
        for variable, orig in row.get('orig', {}).items():
            if not orig.get('column') or orig.get('constant') or variable not in row['values']: continue
            expected, actual = row['values'][variable], draft['values'].get(variable)
            if isinstance(expected, list):
                numeric_total += 1
                match = isinstance(actual, list) and all(abs(a - b) <= 0.000051 for a, b in zip(actual, expected))
                numeric_match += match
            else:
                category_total += 1
                match = actual == expected
                category_match += match
            if not match:
                diffs.append({'record_id': row['id'], 'variable': variable, 'expected': expected, 'extracted': actual})
    report = {'mode': 'deterministic_existing_mapping', 'model_calls': 0, 'tables': len(docs),
              'records': len(result['records']), 'values': sum(len(r['values']) for r in result['records']),
              'rejected_cells': len(result['rejected']), 'conflicts': len(result['conflicts']),
              'numeric_reference_cells': numeric_total, 'numeric_matches_rounded_4dp': numeric_match,
              'category_reference_cells': category_total, 'category_exact_matches_without_synonyms': category_match,
              'differences': diffs, 'limitations': approval['limitations'] + ['Not model accuracy. D7 unresolved.']}
    output.mkdir(parents=True)
    for name, obj in [('parsed', {'corpus_root': str(args.tables_dir.resolve()), 'documents': list(docs.values())}), ('approval', approval), ('extracted', result), ('report', report)]:
        (output / (name + '.json')).write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k:v for k,v in report.items() if k not in ('differences','limitations')}))
    return 1 if result['conflicts'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
