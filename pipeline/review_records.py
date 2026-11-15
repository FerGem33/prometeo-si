#!/usr/bin/env python3
"""T36 local record review. Reviewer actions are explicit, versioned and auditable.

No authentication, network, model calls or publication. CLI output must be new.
"""
import argparse
import copy
from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path

_spec = importlib.util.spec_from_file_location('review_extract', Path(__file__).with_name('review_extract.py'))
review = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(review)
require = review.require


def seal(state):
    state['review_sha256'] = review.digest({k: v for k, v in state.items() if k != 'review_sha256'})
    return state


def begin(approval, documents, extraction, metadata=None):
    review.checked_approval(approval, documents)
    expected = review.extract_tables(approval, documents)
    require(all(extraction.get(k) == v for k, v in expected.items()), 'Extraction differs from approved sources')
    studies = {}
    if metadata is not None:
        decision = metadata.get('approval', {})
        require(decision.get('metadata_sha256') == review.digest({k: v for k, v in metadata.items() if k != 'approval'})
                and decision.get('sources') == review.snapshot(documents)
                and metadata.get('parsed_documents_sha256') == review.digest(documents), 'Reviewed metadata required')
        studies = {did: item['study'] for did, item in metadata['documents'].items()}
    state = {'stage': 'record_review', 'version': 1, 'published': False, 'schema': copy.deepcopy(approval['schema']),
        'schema_sha256': approval['schema_sha256'], 'documents': review.snapshot(documents),
        'parsed_sha256': review.digest(documents), 'records': copy.deepcopy(expected['records']),
        'rejected': copy.deepcopy(expected['rejected']), 'conflicts': copy.deepcopy(expected['conflicts']),
        'source_studies': studies, 'claims': [], 'history': []}
    for conflict in state['conflicts']:
        conflict['id'] = 'cf_'+review.digest([conflict['record_id'], conflict['variable']])[:24]
        if not any(r['id'] == conflict['record_id'] for r in state['records']):
            did, row = conflict['record_id'].rsplit(':row:', 1)
            require(did in documents and any(r['row'] == int(row) for r in documents[did]['rows']), 'Conflict locator invalid')
            # A fully conflicting row has no accepted cells and is omitted by extract_tables.
            # Keep it reviewable without pretending any candidate has been selected.
            state['records'].append({'id': conflict['record_id'], 'doc_id': did, 'row': int(row),
                'values': {}, 'citations': {}, 'provenance': {}, 'flags': [], 'confidence': 'table'})
    return seal(state)


def checked(state, documents):
    require(state.get('stage') == 'record_review' and state.get('published') is False, 'Local review state required')
    require(state.get('review_sha256') == review.digest({k: v for k, v in state.items() if k != 'review_sha256'}), 'Review artifact changed')
    require(state['documents'] == review.snapshot(documents) and state['parsed_sha256'] == review.digest(documents), 'Review sources changed')
    require(state['schema_sha256'] == review.digest(state['schema']), 'Reviewed schema changed')


def apply(state, documents, changes, version, reviewer):
    checked(state, documents)
    require(type(version) is int and version == state['version'], 'Stale review version')
    require(isinstance(reviewer, str) and bool(reviewer.strip()), 'Explicit reviewer required')
    require(isinstance(changes, list) and bool(changes), 'Explicit changes required')
    result = copy.deepcopy(state)
    at = datetime.now(timezone.utc).isoformat()
    variables = {v['id']: v for v in state['schema']['variables'] if v['status'] != 'rejected'}
    for change in changes:
        require(isinstance(change, dict), 'Invalid change')
        op = change.get('op')
        allowed = {'correct': {'op', 'record_id', 'variable', 'value', 'reason'},
                   'exclude': {'op', 'record_id', 'reason'},
                   'resolve': {'op', 'conflict_id', 'choice', 'reason'},
                   'claim': {'op', 'claim', 'reason'}}
        require(op in allowed and set(change) == allowed[op], 'Invalid change fields')
        reason = change['reason']
        require(isinstance(reason, str) and bool(reason.strip()), 'Review reason required')
        audit = {'by': reviewer.strip(), 'at': at, 'reason': reason}
        if op == 'claim':
            claim = copy.deepcopy(change['claim'])
            require(isinstance(claim, dict) and set(claim) <= {'id', 'kind', 'variables', 'direction', 'statement', 'citation', 'study'}
                    and all(k in claim for k in ('id', 'kind', 'variables', 'statement', 'citation', 'study')), 'Invalid claim')
            citation = claim['citation']
            require(isinstance(citation, dict) and citation.get('kind') == 'paper' and review.ingest.verify_citation(citation, documents)['verified'], 'Claim citation rejected')
            require(claim['statement'] == citation['quote'].strip() and claim['statement'], 'Claim must be the literal author statement')
            require(result['source_studies'].get(citation['doc_id']) == claim['study'], 'Reviewed study identity required for claim')
            require(isinstance(claim['variables'], list) and bool(claim['variables']) and set(claim['variables']) <= variables.keys(), 'Unknown claim variable')
            require(claim['kind'] in ('gap', 'relation') and
                    (claim.get('direction') in ('increases', 'decreases', 'non_monotonic', 'no_effect') if claim['kind'] == 'relation' else 'direction' not in claim), 'Invalid claim direction')
            require(not any(c['id'] == claim['id'] for c in result['claims']), 'Duplicate claim')
            claim['citation']['verified'] = True  # Text match only; support remains an explicit reviewer decision.
            claim['review'] = {**audit, 'support': 'Reviewer-attested author statement; no causal inference by the engine'}
            result['claims'].append(claim)
        else:
            if op == 'resolve':
                conflict = next((c for c in result['conflicts'] if c['id'] == change['conflict_id']), None)
                require(conflict is not None and conflict['status'] == 'open', 'Open conflict required')
                rid = conflict['record_id']
            else:
                rid = change['record_id']
            record = next((r for r in result['records'] if r['id'] == rid), None)
            require(record is not None and not record.get('excluded'), 'Active record required')
            if op == 'correct':
                key = change['variable']
                require(key in variables, 'Unknown variable')
                review.validate_value(change['value'], variables[key])
                require(not any(c['record_id'] == rid and c['variable'] == key and c['status'] == 'open' for c in result['conflicts']), 'Resolve the conflict before correcting its value')
                citation = record['citations'].get(key)
                require(citation is not None and review.ingest.verify_citation(citation, documents)['verified'], 'Original citation required')
                before = copy.deepcopy(record['values'].get(key))
                record.setdefault('original_citations', {}).setdefault(key, copy.deepcopy(citation))
                original = record.setdefault('corrections', {}).get(key, {}).get('from', before)
                record['corrections'][key] = {'from': original, **audit}
                record['values'][key] = copy.deepcopy(change['value'])
                record.setdefault('correction_history', []).append({'variable': key, 'before': before,
                    'after': copy.deepcopy(change['value']), 'original_citation': copy.deepcopy(citation), **audit})
                # The original citation supports the original value, not an arbitrary correction.
                record.setdefault('review_notes', []).append('Corrected value is reviewer-supplied; citation retains the original source.')
            elif op == 'exclude' or change['choice'] == 'exclude':
                record['excluded'], record['exclusion'] = True, audit
                for pending in result['conflicts']:
                    if pending['record_id'] == rid and pending['status'] == 'open':
                        pending.update(status='resolved', resolution={'choice': 'exclude', **audit})
            else:
                choice = change['choice']
                options = conflict['candidates']
                require(choice == 'keep_all' or type(choice) is int and 0 <= choice < len(options), 'Invalid conflict choice')
                if choice == 'keep_all':
                    require(sum(c['record_id'] == rid and c['status'] == 'open' for c in result['conflicts']) == 1,
                            'Resolve other row conflicts before retaining alternatives')
                    variants = []
                    for index in range(len(options)):
                        variant = copy.deepcopy(record)
                        variant['id'] = rid+':alternative:'+conflict['id']+':'+str(index)
                        variant.setdefault('flags', []).append('mapping_uncertain')
                        variant['alternative_of'] = rid
                        variants.append((variant, index))
                    record['excluded'], record['exclusion'] = True, audit
                else:
                    variants = [(record, choice)]
                for target, index in variants:
                    selected = options[index]
                    require(review.ingest.verify_citation(selected['citation'], documents)['verified'], 'Conflict citation rejected')
                    review.validate_value(selected['value'], variables[conflict['variable']])
                    key = conflict['variable']
                    target['values'][key] = copy.deepcopy(selected['value'])
                    target['citations'][key] = copy.deepcopy(selected['citation'])
                    target['provenance'][key] = copy.deepcopy(selected)
                    if choice == 'keep_all': result['records'].append(target)
                conflict.update(status='resolved', resolution={'choice': choice, **audit})
        result['history'].append({'change': copy.deepcopy(change), **audit})
    result['version'] += 1
    result['previous_sha256'] = state['review_sha256']
    return seal(result)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('prepare', 'edit'))
    parser.add_argument('--corpus', required=True)
    parser.add_argument('--output', required=True)
    for name in ('approval', 'extraction', 'metadata', 'review', 'changes', 'reviewer'):
        parser.add_argument('--'+name)
    parser.add_argument('--version', type=int)
    args = parser.parse_args()
    read = lambda path: json.loads(Path(path).read_text())
    documents = review.document_index(read(args.corpus))
    if args.action == 'prepare':
        if not args.approval or not args.extraction:
            parser.error('prepare requires --approval and --extraction')
        value = begin(read(args.approval), documents, read(args.extraction), read(args.metadata) if args.metadata else None)
    else:
        if not all((args.review, args.changes, args.reviewer, args.version)):
            parser.error('edit requires --review, --changes, --reviewer, --version')
        value = apply(read(args.review), documents, read(args.changes), args.version, args.reviewer)
    with Path(args.output).open('x', encoding='utf-8') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2, allow_nan=False)
        stream.write('\n')
    print(json.dumps({'version': value['version'], 'records': len(value['records']),
                      'conflicts_open': sum(c['status'] == 'open' for c in value['conflicts']), 'published': False}))


if __name__ == '__main__':
    main()
