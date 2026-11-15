#!/usr/bin/env python3
"""Local T32 parse/profile/proposal validation stages. Standard library plus Poppler for PDFs.

Saved model proposals can be validated; this never approves or publishes records.
"""
import argparse
import csv
import hashlib
import io
import json
import math
import re
from pathlib import Path
import subprocess
import unicodedata


class ParseError(ValueError):
    """Stable error code for a failed document."""


def parse_csv(raw):
    for encoding in ('utf-8-sig', 'cp1252', 'latin-1'):
        try:
            text = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    try:
        rows = list(csv.reader(io.StringIO(text, newline=''), strict=True))
    except csv.Error as exc:
        raise ParseError('unreadable') from exc
    if not rows or not rows[0] or any(not h.strip() for h in rows[0]):
        raise ParseError('invalid_headers')
    headers = rows[0]
    if len(set(headers)) != len(headers):
        raise ParseError('duplicate_headers')
    # Logical CSV row, header = 1. Multiline fields remain one row.
    records = []
    for number, values in enumerate(rows[1:], 2):
        if not values or not any(v.strip() for v in values):
            continue
        if len(values) != len(headers):
            raise ParseError('row_width_mismatch')
        records.append({'row': number, 'values': values})
    return {'encoding': encoding, 'headers': headers, 'rows': records}


def parse_pdf(path):
    try:
        result = subprocess.run(
            ['pdftotext', '-layout', '-enc', 'UTF-8', str(path.resolve()), '-'],
            capture_output=True, timeout=120, check=True)
        text = result.stdout.decode('utf-8')
    except FileNotFoundError as exc:
        raise ParseError('parser_unavailable') from exc
    except (subprocess.SubprocessError, UnicodeError) as exc:
        raise ParseError('unreadable') from exc
    pages = text.split('\f')
    if pages and pages[-1] == '':
        pages.pop()
    if not any(page.strip() for page in pages):
        raise ParseError('no_text_layer')
    return {'pages': [{'page': i, 'text': page} for i, page in enumerate(pages, 1)]}


def parse_document(path):
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    kind = 'table' if path.suffix.lower() == '.csv' else 'paper'
    doc = {'id': 'doc_' + digest, 'name': path.name, 'sha256': digest,
           'bytes': len(raw), 'kind': kind, 'stage': 'parse', 'status': 'done'}
    try:
        if path.suffix.lower() not in ('.csv', '.pdf'):
            raise ParseError('unsupported_type')
        doc.update(parse_csv(raw) if kind == 'table' else parse_pdf(path))
    except ParseError as exc:
        doc.update(status='failed', error_code=str(exc))
    return doc


def normalized(text):
    # Only canonical Unicode and whitespace; never remove punctuation/digits.
    return ' '.join(unicodedata.normalize('NFC', text).split())


def verify_citation(citation, documents):
    """Verify location/text only; never trust the caller's `verified` flag."""
    if not isinstance(citation, dict):
        return {'verified': False, 'reason': 'invalid_citation'}
    doc_id = citation.get('doc_id')
    doc = documents.get(doc_id) if isinstance(doc_id, str) else None
    if not doc or doc.get('status') != 'done':
        return {'verified': False, 'reason': 'document_unavailable'}
    if citation.get('kind') != doc['kind']:
        return {'verified': False, 'reason': 'kind_mismatch'}
    if doc['kind'] == 'table':
        row = citation.get('row')
        column = citation.get('column')
        value = citation.get('text')
        if type(row) is not int or column not in doc['headers'] or not isinstance(value, str) or not value.strip():
            return {'verified': False, 'reason': 'invalid_locator_or_text'}
        source = next((r for r in doc['rows'] if r['row'] == row), None)
        matches = source is not None and source['values'][doc['headers'].index(column)] == value
    else:
        page = citation.get('page')
        quote = citation.get('quote')
        if type(page) is not int or not isinstance(quote, str) or not normalized(quote):
            return {'verified': False, 'reason': 'invalid_locator_or_text'}
        source = next((p for p in doc['pages'] if p['page'] == page), None)
        matches = source is not None and normalized(quote) in normalized(source['text'])
    return {'verified': matches, 'reason': 'text_found' if matches else 'text_not_found_at_location'}


def finite_number(value):
    return type(value) in (int, float) and math.isfinite(value)


def profile_document(doc):
    """Describe observed data; do not infer canonical units or scientific roles."""
    result = {k: doc[k] for k in ('id', 'name', 'kind', 'sha256')}
    if doc['kind'] == 'paper':
        result['pages'] = [{'page': p['page'], 'characters': len(p['text']),
                            'has_text': bool(p['text'].strip())} for p in doc['pages']]
        # Full text stays in the parsed artifact. Proposals select pages explicitly.
        return result
    result['rows'] = len(doc['rows'])
    result['columns'] = []
    for i, header in enumerate(doc['headers']):
        cells = [(r['row'], r['values'][i]) for r in doc['rows'] if r['values'][i].strip()]
        numbers = []
        for _, value in cells:
            if re.fullmatch(r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?', value.strip()):
                n = float(value)
                if math.isfinite(n):
                    numbers.append(n)
        result['columns'].append({'column': header, 'nonempty': len(cells),
            'missing': len(doc['rows']) - len(cells), 'numeric_cells': len(numbers),
            'observed_type': 'empty' if not cells else 'numeric' if len(numbers) == len(cells) else 'text_or_mixed',
            'numeric_range': [min(numbers), max(numbers)] if numbers else None,
            'sample': [{'kind': 'table', 'doc_id': doc['id'], 'row': row, 'column': header, 'text': value}
                       for row, value in cells[:5]]})
    return result


def validate_proposal(response, documents):
    """Strict local model-response format -> unapproved SchemaProposal contract.

    Approval is never accepted from model output. Constants are deferred until
    their evidence and scope have a reviewable contract.
    """
    def require(condition, message):
        if not condition:
            raise ValueError(message)

    require(isinstance(response, dict) and set(response) == {'doc_id', 'variables', 'columns'}, 'invalid response fields')
    doc_id = response['doc_id']
    require(isinstance(doc_id, str) and doc_id in documents, 'unknown document')
    doc = documents[doc_id]
    variables, columns = response['variables'], response['columns']
    require(isinstance(variables, list) and isinstance(columns, list), 'expected arrays')
    ids, clean_variables = set(), []
    for v in variables:
        require(isinstance(v, dict) and set(v) == {'id', 'label', 'type', 'unit', 'evidence'}, 'invalid variable fields')
        key = v['id']
        require(isinstance(key, str) and re.fullmatch(r'[a-z][a-z0-9_]{0,63}', key) is not None and key not in ids, 'invalid or duplicate variable id')
        require(isinstance(v['label'], str) and 0 < len(v['label'].strip()) <= 200, 'invalid label')
        require(v['type'] in ('num', 'cat'), 'invalid variable type')
        require(v['unit'] is None or isinstance(v['unit'], str) and 0 < len(v['unit'].strip()) <= 80, 'invalid unit')
        require(v['type'] != 'cat' or v['unit'] is None, 'categorical unit')
        require(isinstance(v['evidence'], list) and bool(v['evidence']), 'evidence required')
        evidence = []
        for cite in v['evidence']:
            require(isinstance(cite, dict), 'invalid citation')
            keys = {'kind', 'doc_id', 'row', 'column', 'text'} if doc['kind'] == 'table' else {'kind', 'doc_id', 'page', 'quote'}
            require(set(cite) == keys and cite['doc_id'] == doc_id, 'invalid evidence fields')
            require(verify_citation(cite, documents)['verified'], 'evidence not found at location')
            evidence.append({**cite, **({'verified': True} if doc['kind'] == 'paper' else {})})
        ids.add(key)
        clean = {'id': key, 'label': v['label'], 'type': v['type'], 'status': 'proposed',
                 'merged_from': [], 'records': 0, 'evidence': evidence}
        if v['unit'] is not None:
            clean['unit'] = v['unit']
        clean_variables.append(clean)
    seen, clean_columns = set(), []
    headers = doc.get('headers', [])
    for col in columns:
        require(isinstance(col, dict) and set(col) == {'column', 'variable', 'unit', 'convert'}, 'invalid column fields')
        name, variable = col['column'], col['variable']
        require(isinstance(name, str) and name in headers and name not in seen, 'unknown or duplicate column')
        require(variable is None or isinstance(variable, str) and variable in ids, 'unknown variable reference')
        require(col['unit'] is None or isinstance(col['unit'], str) and bool(col['unit'].strip()), 'invalid column unit')
        convert = col['convert']
        require(convert is None or isinstance(convert, dict) and set(convert) == {'factor', 'offset'} and all(finite_number(x) for x in convert.values()) and convert['factor'] != 0, 'invalid conversion')
        if variable is None:
            require(convert is None, 'unmapped conversion')
        elif next(v for v in clean_variables if v['id'] == variable)['type'] == 'cat':
            require(convert is None and col['unit'] is None, 'categorical conversion')
        seen.add(name)
        i = headers.index(name)
        sample = [r['values'][i] for r in doc['rows'] if r['values'][i].strip()][:5]
        clean_columns.append({**col, 'doc_id': doc_id, 'status': 'proposed', 'sample': sample})
    require(seen == set(headers), 'every source column must appear exactly once')
    return {'version': 1, 'status': 'proposed', 'variables': clean_variables,
            'columns': clean_columns, 'constants': []}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path, help='local CSV/PDF file or directory')
    parser.add_argument('--output', type=Path, required=True, help='local JSON artifact (outside corpus)')
    parser.add_argument('--citations', type=Path, help='JSON array of citations to check')
    parser.add_argument('--proposal-response', type=Path, help='saved model JSON to validate, never approve')
    args = parser.parse_args()
    root = args.input.resolve()
    output = args.output.resolve()
    if not root.exists():
        parser.error('input does not exist')
    if output == root or (root.is_dir() and output.is_relative_to(root)):
        parser.error('output must be outside the input corpus')
    paths = sorted(p for p in root.rglob('*') if p.is_file() and p.suffix.lower() in ('.csv', '.pdf')) if root.is_dir() else [root]
    if not paths:
        parser.error('no CSV or PDF files found')
    citations = []
    if args.citations:
        if output == args.citations.resolve():
            parser.error('output must not overwrite citations')
        citations = json.loads(args.citations.read_text(encoding='utf-8'))
        if not isinstance(citations, list):
            parser.error('citations must be a JSON array')
    docs = []
    seen = set()
    for path in paths:
        try:
            doc = parse_document(path)
        except OSError:
            doc = {'name': path.name, 'status': 'failed', 'stage': 'parse', 'error_code': 'unreadable'}
        doc['path'] = str(path.relative_to(root)) if root.is_dir() else path.name
        if doc.get('sha256') in seen:
            doc.update(status='skipped', error_code='duplicate')
        if doc.get('sha256'):
            seen.add(doc['sha256'])
        docs.append(doc)
    index = {d['id']: d for d in docs if d['status'] == 'done'}
    proposal_check = None
    if args.proposal_response:
        if output == args.proposal_response.resolve():
            parser.error('output must not overwrite model response')
        try:
            response = json.loads(args.proposal_response.read_text(encoding='utf-8'))
            proposal_check = {'status': 'valid', 'schema': validate_proposal(response, index)}
        except (ValueError, OSError) as exc:
            proposal_check = {'status': 'rejected', 'reason': str(exc)}
    checks = [{'citation': c, **verify_citation(c, index)} for c in citations]
    summary = {s: sum(d['status'] == s for d in docs) for s in ('done', 'failed', 'skipped')}
    summary.update(citations_verified=sum(c['verified'] for c in checks), citations_rejected=sum(not c['verified'] for c in checks))
    artifact = {'version': 1, 'corpus_root': str(root), 'stage': 'parse_profile_verify', 'summary': summary, 'documents': docs, 'profiles': [profile_document(d) for d in index.values()],
                'proposal_check': proposal_check, 'citation_checks': checks,
                'limitations': ['Text matching does not establish semantic support for an extracted value.',
                                'Proposals require human review; no extraction, approval or publication is performed.']}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(summary))
    return 1 if summary['failed'] or summary['citations_rejected'] or (proposal_check and proposal_check['status'] == 'rejected') else 0


if __name__ == '__main__':
    raise SystemExit(main())
