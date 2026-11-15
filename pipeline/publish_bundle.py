#!/usr/bin/env python3
"""Build an immutable local publication draft; no network and no public-pack writes.

Requires source-bound schema approval AND separately reviewed corpus metadata.
Only standard library. This step does not upload or approve anything.
"""
import argparse
import copy
import importlib.util
import json
import math
from pathlib import Path
import re

_spec = importlib.util.spec_from_file_location('review_extract', Path(__file__).with_name('review_extract.py'))
review = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(review)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def build(approval, documents, extraction, metadata, pack_version, lens_version):
    variables = review.checked_approval(approval, documents)
    require(type(pack_version) is int and pack_version > 0 and type(lens_version) is int and lens_version > 0,
            'Publication versions must be positive integers')
    decision = metadata.get('approval', {})
    reviewed = {k: v for k, v in metadata.items() if k != 'approval'}
    require(decision.get('metadata_sha256') == review.digest(reviewed)
            and decision.get('sources') == review.snapshot(documents)
            and metadata.get('parsed_documents_sha256') == review.digest(documents)
            and all(isinstance(decision.get(k), str) and decision[k].strip()
                    for k in ('by', 'at', 'authority')), 'Source-bound metadata approval required')
    # Recompute the deterministic table extraction: a copied schema hash alone
    # is not evidence that the stored values came from those sources.
    expected = review.extract_tables(approval, documents)
    require(all(extraction.get(k) == v for k, v in expected.items()), 'Extraction differs from approved sources')
    require(not expected['conflicts'], 'Resolve conflicts before publication')
    require(expected['records'], 'No verified table records to publish')
    entries = metadata['documents']
    require(set(entries) == set(documents), 'Review metadata for every source')
    sources, studies, records = [], {}, []
    for did, document in documents.items():
        entry = entries[did]
        require(entry.get('sha256') == document['sha256'], 'Metadata source hash changed')
        require(all(isinstance(entry.get(k), str) and entry[k].strip() for k in ('study', 'title', 'doi')),
                'Reviewed study identity, title and DOI required')
        require(re.fullmatch(r'10\.\d{4,9}/\S+', entry['doi']), 'Invalid reviewed DOI')
        # A row in a file is not automatically an experimental test.
        require(entry.get('kind') in ('test', 'campaign') and entry.get('kind_note'), 'Reviewed record kind required')
        require(review.ingest.verify_citation(entry['kind_evidence'], documents)['verified'], 'Record kind citation rejected')
        sid = entry['study']
        if sid in studies:
            require(studies[sid]['title'] == entry['title']
                    and studies[sid]['links'][0]['url'] == 'https://doi.org/'+entry['doi'], 'Ambiguous study metadata')
        else:
            studies[sid] = {'id': sid, 'short': sid, 'title': entry['title'],
                'summary': {'objective': None, 'subjects': [], 'conditions': None, 'variables': [], 'instruments': None},
                'attributes': {}, 'related': [],
                'links': [{'kind': 'doi', 'label': 'DOI', 'url': 'https://doi.org/'+entry['doi']}],
                'counts': {'records': 0, 'tests': 0, 'publications': 0, 'documents': 0}}
        sources.append({'id': did, 'kind': 'table' if document['kind'] == 'table' else 'paper',
            'name': document['name'], 'study': sid, 'sha256': document['sha256'],
            'license': entry.get('license'), 'used': document['kind'] == 'table'})
        studies[sid]['counts']['documents'] += 1
    used = set()
    for item in expected['records']:
        entry = entries[item['doc_id']]
        origins = {}
        for variable, citation in item['citations'].items():
            require(review.ingest.verify_citation(citation, documents)['verified'], 'Cell citation rejected')
            p = item['provenance'][variable]
            origins[variable] = {'column': citation.get('column'), 'text': p.get('raw', citation.get('quote', '')),
                'unit': p.get('source_unit'), 'factor': (p.get('convert') or {}).get('factor'),
                'offset': (p.get('convert') or {}).get('offset'), 'constant': 'scope_rows' in p}
        used.update(item['values'])
        record = {'id': item['id'], 'study': entry['study'], 'label': f'{documents[item["doc_id"]]["name"]}, row {item["row"]}',
            'kind': entry['kind'], 'values': item['values'], 'source': {'id': item['doc_id'], 'row': item['row']},
            'confidence': 'table', 'quote': None, 'orig': origins, 'citations': item['citations'],
            'flags': ['mapping_uncertain'] if item['flags'] else [], 'flag_notes': item['flags']}
        records.append(record)
        studies[entry['study']]['counts']['records'] += 1
        studies[entry['study']]['counts']['tests'] += int(entry['kind'] == 'test')
        studies[entry['study']]['summary']['variables'] = sorted(set(studies[entry['study']]['summary']['variables']) | set(item['values']))
    schema_variables = []
    for key in sorted(used):
        v = variables[key]
        value = {k: copy.deepcopy(v[k]) for k in ('id', 'label', 'type', 'unit', 'sigma', 'role') if k in v}
        if v['type'] == 'num':
            sigma = v.get('sigma')
            require(type(sigma) in (int, float) and math.isfinite(sigma) and sigma > 0,
                    'Explicit reviewed positive sigma required: '+key)
            bounds = [x for r in records if key in r['values'] for x in r['values'][key]]
            value['range'] = [min(bounds), max(bounds)]  # Observed envelope, not a physical limit.
        schema_variables.append(value)
    lens = copy.deepcopy(metadata['lens'])
    require(lens.get('title') and lens.get('presets') and lens.get('evidence', {}).get('min_studies', 0) > 0,
            'Reviewed lens with sourced presets and evidence threshold required')
    require(all(key in used and variables[key]['type'] == 'num' for key in lens['default_axes']),
            'Lens axes must be published numeric variables')
    record_ids = {r['id'] for r in records}
    for preset in lens['presets']:
        require(preset.get('source') in record_ids and set(preset['values']) <= used
                and set(preset['active']) <= set(preset['values']), 'Preset must cite a published record')
        source_record = next(r for r in records if r['id'] == preset['source'])
        for key, val in preset['values'].items():
            original = source_record['values'].get(key)
            require(original == val or isinstance(original, list) and type(val) in (int, float)
                    and original[0] <= val <= original[1], 'Preset outside its cited record')
    thresholds = metadata['thresholds']
    require(set(thresholds) == {'grade_a', 'tolerance', 'closeness_reach'}
            and all(type(x) in (int, float) and math.isfinite(x) and x > 0 for x in thresholds.values()),
            'Reviewed positive comparison thresholds required')
    pack = {'contract': 'prometeo.pack/1', 'meta': {'id': metadata['id'], 'title': lens['title'],
        'created_at': decision['at'], 'source_note': decision['authority'], 'pack_version': pack_version,
        'schema_sha256': approval['schema_sha256'], 'metadata_sha256': decision['metadata_sha256'],
        'stats': {'records': len(records), 'studies': len(studies), 'sources': len(sources),
            'tests': sum(r['kind'] == 'test' for r in records), 'campaigns': sum(r['kind'] == 'campaign' for r in records),
            'flagged': sum(bool(r['flags']) for r in records), 'publications': 0, 'documents': len(documents)}},
        'schema': {'variables': schema_variables, 'thresholds': thresholds}, 'sources': sources,
        'studies': list(studies.values()), 'records': records, 'claims': []}
    mapping = {'version': approval['schema']['version'], 'schema_sha256': approval['schema_sha256'],
        'approved_by': approval['schema']['approved_by'], 'approved_at': approval['schema']['approved_at'],
        'tables': [{'source': did, 'columns': [copy.deepcopy(c) for c in approval['schema']['columns'] if c['doc_id'] == did],
                    'constants': {c['variable']: copy.deepcopy(c) for c in approval['schema']['constants'] if c['doc_id'] == did}}
                   for did in documents if documents[did]['kind'] == 'table'], 'synonyms': {}}
    lens['lens_version'] = lens_version
    receipt = {'stage': 'publication_draft', 'published': False, 'pack_version': pack_version, 'lens_version': lens_version,
        'approval': decision, 'sources': review.snapshot(documents), 'rejected': expected['rejected'],
        'limitations': ['Table extraction only; PDF conditions require contextual review before inclusion.'],
        'files': {name: review.digest(value) for name, value in [('pack', pack), ('lens', lens), ('mapping', mapping)]}}
    return {'pack': pack, 'lens': lens, 'mapping': mapping, 'receipt': receipt}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('approval', 'corpus', 'extraction', 'metadata', 'output'):
        parser.add_argument('--'+name, required=True)
    parser.add_argument('--pack-version', type=int, required=True)
    parser.add_argument('--lens-version', type=int, required=True)
    args = parser.parse_args()
    read = lambda path: json.loads(Path(path).read_text())
    bundle = build(read(args.approval), review.document_index(read(args.corpus)), read(args.extraction),
                   read(args.metadata), args.pack_version, args.lens_version)
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=False)
    for name, value in bundle.items():
        (output/(name+'.json')).write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False)+'\n')
    print('Local publication draft created; no AWS or public pack writes.')


if __name__ == '__main__':
    main()
