#!/usr/bin/env python3
"""Offline, explicit review gate and conservative extraction. Never publishes a pack."""
import argparse
import copy
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import re

_spec = importlib.util.spec_from_file_location('ingest', Path(__file__).with_name('ingest.py'))
ingest = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ingest)


def require(ok, reason):
    if not ok:
        raise ValueError(reason)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=True, allow_nan=False).encode()).hexdigest()


def document_index(artifact):
    return {d['id']: d for d in artifact['documents'] if d['status'] == 'done'}


def snapshot(documents):
    return {key: doc['sha256'] for key, doc in documents.items()}


def align_published_columns(headers, columns):
    """The published builder trims header edges; citations must keep the original header.

    Reject ambiguous/missing matches instead of treating them as unmapped columns.
    """
    raw_keys = [h.strip() for h in headers]
    approved_keys = [c['column'].strip() for c in columns]
    require(len(set(raw_keys)) == len(raw_keys) and len(set(approved_keys)) == len(approved_keys), 'ambiguous trimmed headers')
    require(set(raw_keys) == set(approved_keys), 'published mapping does not cover source headers')
    index = {c['column'].strip(): c for c in columns}
    return {h: {**index[h.strip()], 'column': h} for h in headers}


def validate_schema(schema, documents):
    require(isinstance(schema, dict), 'schema must be an object')
    require(type(schema.get('version')) is int and schema['version'] > 0, 'invalid schema version')
    for key in ('variables', 'columns', 'constants'):
        require(isinstance(schema.get(key), list), 'missing schema list: ' + key)
    variables = {}
    for v in schema['variables']:
        require(isinstance(v, dict) and isinstance(v.get('id'), str), 'invalid variable')
        require(re.fullmatch(r'[a-z][a-z0-9_]{0,63}', v['id']) and v['id'] not in variables, 'duplicate or invalid variable')
        require(v.get('type') in ('num', 'cat'), 'invalid type')
        require(v.get('status') in ('approved', 'flagged', 'rejected'), 'unreviewed variable')
        require(v.get('unit') is None or isinstance(v['unit'], str) and bool(v['unit'].strip()), 'invalid unit')
        require(v['type'] != 'cat' or v.get('unit') is None, 'categorical unit')
        require(v.get('role') in (None, 'partition'), 'invalid role')
        if 'sigma' in v:
            require(ingest.finite_number(v['sigma']) and v['sigma'] > 0, 'invalid sigma')
        variables[v['id']] = v
    require(sum(v.get('role') == 'partition' and v['status'] != 'rejected' for v in variables.values()) <= 1, 'multiple partitions')
    seen = set()
    for col in schema['columns']:
        require(isinstance(col, dict), 'invalid column')
        doc = documents.get(col.get('doc_id'))
        require(doc is not None and doc['kind'] == 'table', 'unknown column document')
        key = (doc['id'], col.get('column'))
        require(key[1] in doc['headers'] and key not in seen, 'unknown or duplicate column')
        seen.add(key)
        require(col.get('status') in ('approved', 'flagged', 'rejected'), 'unreviewed column')
        variable = col.get('variable')
        require(variable is None or variable in variables, 'unknown variable')
        if col['status'] != 'rejected' and variable is not None:
            require(variables[variable]['status'] != 'rejected', 'column maps to rejected variable')
        conversion = col.get('convert')
        require(conversion is None or isinstance(conversion, dict) and set(conversion) == {'factor', 'offset'} and all(ingest.finite_number(n) for n in conversion.values()) and conversion['factor'] != 0, 'invalid conversion')
        if conversion is not None:
            require(variable is not None and variables[variable]['type'] == 'num', 'conversion requires numeric variable')
        if variable is not None and variables[variable]['type'] == 'cat':
            require(col.get('unit') is None, 'categorical source unit')
        if col['status'] == 'approved' and variable is not None and variables[variable]['type'] == 'num':
            require(col.get('unit') == variables[variable].get('unit') or conversion is not None, 'unit mismatch requires conversion or flagged status')
    expected = {(d['id'], h) for d in documents.values() if d['kind'] == 'table' for h in d['headers']}
    require(seen == expected, 'review every source column')
    # Local review extension: constants need explicit row scope AND a human support decision.
    for const in schema['constants']:
        require(isinstance(const, dict), 'invalid constant')
        require(const.get('variable') in variables and variables[const['variable']]['status'] != 'rejected', 'invalid constant variable')
        doc = documents.get(const.get('doc_id'))
        require(doc is not None and doc['kind'] == 'table', 'constant target must be table')
        rows = const.get('rows')
        require(isinstance(rows, list) and bool(rows) and all(type(r) is int for r in rows) and len(rows) == len(set(rows)) and set(rows) <= {r['row'] for r in doc['rows']}, 'explicit constant row scope required')
        require(isinstance(const.get('note'), str) and bool(const['note'].strip()) and const.get('semantic_support') == 'reviewed', 'constant scope requires human support review')
        require(ingest.verify_citation(const.get('citation'), documents)['verified'], 'constant citation rejected')
        variable = variables[const['variable']]
        validate_value(const.get('value'), variable)
        validate_value(const.get('source_value'), variable)
        require('source_unit' in const and 'convert' in const, 'constant source unit and conversion decision required')
        conversion = const['convert']
        if variable['type'] == 'cat':
            require(const['source_unit'] is None and conversion is None, 'categorical constant conversion')
            expected = const['source_value']
        else:
            require(conversion is None or isinstance(conversion, dict) and set(conversion) == {'factor', 'offset'} and all(ingest.finite_number(n) for n in conversion.values()) and conversion['factor'] != 0, 'invalid constant conversion')
            require(const['source_unit'] == variable.get('unit') or conversion is not None, 'constant unit mismatch')
            expected = sorted(n * conversion['factor'] + conversion['offset'] for n in const['source_value']) if conversion else const['source_value']
        require(const['value'] == expected, 'constant value does not match explicit conversion')
    return variables


def validate_value(value, variable):
    if variable['type'] == 'num':
        require(isinstance(value, list) and len(value) == 2 and all(ingest.finite_number(n) for n in value) and value[0] <= value[1], 'invalid numeric range')
    else:
        require(isinstance(value, str) and bool(value.strip()), 'invalid categorical value')
    return value


def review_request(schema, documents):
    return {'stage': 'awaiting_review', 'base_version': schema['version'], 'base_schema_sha256': digest(schema),
            'documents': snapshot(documents), 'schema': copy.deepcopy(schema)}


def edit_schema(schema, edits, version):
    """Apply explicit reviewer edits atomically; every revision invalidates approval."""
    require(type(version) is int and schema['version'] == version, 'stale schema version')
    require(isinstance(edits, list) and bool(edits), 'nonempty edits required')
    result = copy.deepcopy(schema)
    for edit in edits:
        require(isinstance(edit, dict), 'invalid edit')
        op = edit.get('op')
        variables = {v['id']: v for v in result['variables']}
        if op == 'add_variable':
            value = edit.get('variable')
            require(isinstance(value, dict) and value.get('id') not in variables
                    and isinstance(value.get('id'), str) and re.fullmatch(r'[a-z][a-z0-9_]{0,63}', value['id'])
                    and value.get('type') in ('num', 'cat') and isinstance(value.get('label'), str)
                    and value['label'].strip() and isinstance(value.get('evidence'), list) and value['evidence'], 'Invalid reviewed variable')
            result['variables'].append({**copy.deepcopy(value), 'status': 'proposed', 'merged_from': []})
        elif op == 'set_status':
            require(edit.get('status') in ('proposed', 'approved', 'flagged', 'rejected'), 'invalid review status')
            if edit.get('target') == 'variable':
                require(edit.get('id') in variables, 'unknown variable')
                target = variables[edit['id']]
            else:
                require(edit.get('target') == 'column', 'invalid status target')
                targets = [c for c in result['columns'] if c['doc_id'] == edit.get('doc_id') and c['column'] == edit.get('id')]
                require(len(targets) == 1, 'unknown column')
                target = targets[0]
            target['status'] = edit['status']
            if 'note' in edit:
                require(isinstance(edit['note'], str), 'invalid note')
                target['note'] = edit['note']
        elif op in ('map_column', 'set_convert'):
            targets = [c for c in result['columns'] if c['doc_id'] == edit.get('doc_id') and c['column'] == edit.get('column')]
            require(len(targets) == 1, 'unknown column')
            if op == 'map_column':
                require(edit.get('variable') is None or edit['variable'] in variables, 'unknown variable')
                targets[0]['variable'] = edit.get('variable')
            else:
                conversion = edit.get('convert')
                require(conversion is None or isinstance(conversion, dict) and set(conversion) == {'factor', 'offset'} and all(ingest.finite_number(n) for n in conversion.values()) and conversion['factor'] != 0, 'invalid conversion')
                targets[0].update(convert=conversion, unit=edit.get('unit'))
            targets[0]['status'] = 'proposed'
        elif op == 'merge':
            into, source_ids = edit.get('into'), edit.get('from')
            require(into in variables and isinstance(source_ids, list) and bool(source_ids), 'invalid merge')
            require(all(isinstance(key, str) and key in variables and key != into for key in source_ids) and len(set(source_ids)) == len(source_ids), 'invalid merge sources')
            target = variables[into]
            require(all(variables[key]['type'] == target['type'] and variables[key].get('unit') == target.get('unit') for key in source_ids), 'review units/types before merge')
            target['merged_from'] = list(dict.fromkeys(target.get('merged_from', []) + source_ids))
            for key in source_ids:
                target.setdefault('evidence', []).extend(variables[key].get('evidence', []))
            target['status'] = 'proposed'
            for col in result['columns']:
                if col.get('variable') in source_ids:
                    col.update(variable=into, status='proposed')
            for const in result['constants']:
                if const.get('variable') in source_ids:
                    const['variable'] = into
            result['variables'] = [v for v in result['variables'] if v['id'] not in source_ids]
        elif op in ('rename', 'set_unit', 'set_role', 'set_sigma'):
            require(edit.get('variable') in variables, 'unknown variable')
            target = variables[edit['variable']]
            field = {'rename': 'label', 'set_unit': 'unit', 'set_role': 'role', 'set_sigma': 'sigma'}[op]
            value = edit.get(field)
            if field in ('label', 'unit'):
                require(isinstance(value, str) and bool(value.strip()), 'invalid ' + field)
            elif field == 'role':
                require(value in (None, 'partition'), 'invalid role')
            else:
                require(ingest.finite_number(value) and value > 0, 'invalid sigma')
            target[field] = value
            target['status'] = 'proposed'
        else:
            raise ValueError('unsupported edit operation')
    result.update(version=version + 1, status='proposed')
    result.pop('approved_by', None)
    result.pop('approved_at', None)
    return result


def approve(request, reviewed, documents, version, reviewer):
    require(isinstance(reviewer, str) and bool(reviewer.strip()), 'reviewer required')
    require(request['stage'] == 'awaiting_review' and request['documents'] == snapshot(documents), 'stale corpus')
    require(request['base_schema_sha256'] == digest(request['schema']), 'changed review base')
    require(version == request['base_version'] and reviewed['version'] == version, 'stale schema version')
    validate_schema(reviewed, documents)
    schema = copy.deepcopy(reviewed)
    schema.update(version=version + 1, status='approved', approved_by=reviewer.strip(),
                  approved_at=datetime.now(timezone.utc).isoformat())
    return {'stage': 'approved', 'documents': snapshot(documents), 'schema': schema,
            'schema_sha256': digest(schema), 'previous': request}


def checked_approval(approval, documents):
    require(approval.get('stage') == 'approved' and approval.get('documents') == snapshot(documents), 'approved schema for this corpus required')
    schema = approval['schema']
    require(schema.get('status') == 'approved' and bool(schema.get('approved_by')) and bool(schema.get('approved_at')), 'explicit approval required')
    require(approval.get('schema_sha256') == digest(schema), 'schema changed after approval')
    return validate_schema(schema, documents)


NUMBER = r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?'


def numeric_cell(text):
    text = text.strip()
    if re.fullmatch(NUMBER, text):
        values = [float(text), float(text)]
    else:
        match = re.fullmatch(rf'({NUMBER})\s*[-–]\s*({NUMBER})', text)
        require(match is not None, 'ambiguous numeric cell')
        values = [float(match[1]), float(match[2])]
    require(all(ingest.finite_number(n) for n in values) and values[0] <= values[1], 'invalid numeric cell')
    return values


def extract_tables(approval, documents):
    variables = checked_approval(approval, documents)
    schema = approval['schema']
    records, rejected, conflicts = [], [], []
    for doc in documents.values():
        if doc['kind'] != 'table':
            continue
        cols = [c for c in schema['columns'] if c['doc_id'] == doc['id'] and c['status'] != 'rejected' and c.get('variable') is not None]
        for row in doc['rows']:
            record = {'id': doc['id'] + ':row:' + str(row['row']), 'doc_id': doc['id'], 'row': row['row'],
                      'values': {}, 'citations': {}, 'provenance': {}, 'flags': [], 'confidence': 'table'}
            candidates = {}
            for col in cols:
                raw = row['values'][doc['headers'].index(col['column'])]
                if not raw.strip():
                    continue
                key = col['variable']
                citation = {'kind': 'table', 'doc_id': doc['id'], 'row': row['row'], 'column': col['column'], 'text': raw}
                try:
                    require(ingest.verify_citation(citation, documents)['verified'], 'citation rejected')
                    v = variables[key]
                    require(v['type'] != 'num' or col.get('unit') == v.get('unit') or col.get('convert') is not None, 'unit_unconverted')
                    value = numeric_cell(raw) if v['type'] == 'num' else raw
                    if col.get('convert'):
                        value = sorted(n * col['convert']['factor'] + col['convert']['offset'] for n in value)
                    validate_value(value, v)
                    candidates.setdefault(key, []).append({'value': value, 'citation': citation, 'raw': raw,
                        'source_unit': col.get('unit'), 'convert': col.get('convert'), 'flagged': col['status'] == 'flagged' or v['status'] == 'flagged'})
                except ValueError as exc:
                    rejected.append({'record_id': record['id'], 'variable': key, 'citation': citation, 'reason': str(exc)})
            for const in schema['constants']:
                if const['doc_id'] == doc['id'] and row['row'] in const['rows']:
                    candidates.setdefault(const['variable'], []).append({'value': const['value'], 'citation': const['citation'],
                        'source_value': const['source_value'], 'source_unit': const['source_unit'], 'convert': const['convert'],
                        'scope_rows': const['rows'], 'scope_note': const['note'], 'flagged': True})
            for key, choices in candidates.items():
                if len(choices) > 1:
                    conflicts.append({'record_id': record['id'], 'variable': key, 'status': 'open', 'candidates': choices})
                    continue  # Never silently overwrite a second source/column.
                choice = choices[0]
                record['values'][key] = choice['value']
                record['citations'][key] = choice['citation']
                evidence_doc = documents[choice['citation']['doc_id']]
                record['provenance'][key] = {**choice, 'sha256': evidence_doc['sha256'],
                    'path': evidence_doc.get('path', evidence_doc.get('name')),
                    'target_sha256': doc['sha256'], 'target_path': doc.get('path', doc['name'])}
                if choice['flagged']:
                    record['flags'].append(key + ':review_flagged')
            if record['values']:
                records.append(record)
    return {'stage': 'extracted_draft', 'schema_sha256': approval['schema_sha256'], 'records': records,
            'rejected': rejected, 'conflicts': conflicts, 'published': False}


def verify_paper_candidates(response, approval, documents, expected_doc_id=None, allowed_pages=None):
    variables = checked_approval(approval, documents)
    require(isinstance(response, dict) and set(response) == {'candidates'} and isinstance(response['candidates'], list), 'invalid paper response')
    accepted, rejected = [], []
    for candidate in response['candidates']:
        try:
            require(isinstance(candidate, dict) and set(candidate) == {'variable', 'value', 'unit', 'citation', 'scope'}, 'invalid candidate fields')
            key = candidate['variable']
            require(isinstance(key, str) and key in variables and variables[key]['status'] != 'rejected', 'unapproved variable')
            validate_value(candidate['value'], variables[key])
            require(candidate['unit'] == variables[key].get('unit'), 'unit mismatch')
            cite = candidate['citation']
            require(isinstance(cite, dict) and set(cite) == {'kind', 'doc_id', 'page', 'quote'} and cite['kind'] == 'paper', 'invalid paper citation')
            require(expected_doc_id is None or cite['doc_id'] == expected_doc_id, 'citation outside requested document')
            require(allowed_pages is None or cite['page'] in allowed_pages, 'citation outside requested pages')
            check = ingest.verify_citation(cite, documents)
            require(check['verified'], check['reason'])
            require(isinstance(candidate['scope'], str) and bool(candidate['scope'].strip()), 'scope required')
            accepted.append({**candidate, 'citation': {**cite, 'verified': True}, 'status': 'awaiting_semantic_review'})
        except ValueError as exc:
            rejected.append({'candidate': candidate, 'reason': str(exc)})
    # These are candidates, not approved records or table-wide constants.
    return {'stage': 'paper_candidates_verified', 'candidates': accepted, 'rejected': rejected, 'published': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['prepare', 'approve', 'extract', 'verify-paper'])
    parser.add_argument('artifact', type=Path)
    parser.add_argument('--schema', type=Path, required=True, help='schema, review request, or approval depending on action')
    parser.add_argument('--reviewed-schema', type=Path)
    parser.add_argument('--version', type=int)
    parser.add_argument('--reviewer')
    parser.add_argument('--paper-response', type=Path)
    parser.add_argument('--doc-id', help='requested paper document ID')
    parser.add_argument('--pages', nargs='+', type=int, help='requested physical pages')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    try:
        require(not args.output.exists(), 'output must be a new file (history is immutable)')
        load = lambda path: json.loads(path.read_text(encoding='utf-8'))
        artifact = load(args.artifact)
        corpus_root = artifact.get('corpus_root')
        require(isinstance(corpus_root, str), 'parse again with ingest.py to record corpus_root')
        root = Path(corpus_root).resolve()
        output = args.output.resolve()
        require(not output.is_relative_to(Path(__file__).resolve().parent.parent), 'artifacts must stay outside repository')
        require(output != root and not (root.is_dir() and output.is_relative_to(root)), 'output must be outside corpus')
        docs = document_index(artifact)
        schema = load(args.schema)
        if args.action == 'prepare':
            result = review_request(schema, docs)
        elif args.action == 'approve':
            require(args.reviewed_schema is not None and args.version is not None, 'reviewed-schema and version required')
            result = approve(schema, load(args.reviewed_schema), docs, args.version, args.reviewer)
        elif args.action == 'extract':
            result = extract_tables(schema, docs)
        else:
            require(args.paper_response is not None, 'paper-response required')
            require(args.doc_id in docs and docs[args.doc_id]['kind'] == 'paper' and bool(args.pages), 'requested paper doc-id and pages required')
            result = verify_paper_candidates(load(args.paper_response), schema, docs, args.doc_id, args.pages)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open('x', encoding='utf-8') as stream:
            json.dump(result, stream, ensure_ascii=False, indent=2, allow_nan=False)
            stream.write('\n')
        print(json.dumps({k: len(result[k]) for k in ('records', 'candidates', 'rejected', 'conflicts') if k in result}))
        return 1 if result.get('rejected') or result.get('conflicts') else 0
    except (ValueError, OSError, KeyError, TypeError) as exc:
        parser.exit(1, str(exc) + '\n')


if __name__ == '__main__':
    raise SystemExit(main())
