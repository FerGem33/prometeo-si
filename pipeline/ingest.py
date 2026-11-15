#!/usr/bin/env python3
"""Local T32 parse/verify stages. Standard library plus Poppler for PDFs.

This does not propose schemas, infer values, or approve/publish records.
"""
import argparse
import csv
import hashlib
import io
import json
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path, help='local CSV/PDF file or directory')
    parser.add_argument('--output', type=Path, required=True, help='local JSON artifact (outside corpus)')
    parser.add_argument('--citations', type=Path, help='JSON array of citations to check')
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
    checks = [{'citation': c, **verify_citation(c, index)} for c in citations]
    summary = {s: sum(d['status'] == s for d in docs) for s in ('done', 'failed', 'skipped')}
    summary.update(citations_verified=sum(c['verified'] for c in checks), citations_rejected=sum(not c['verified'] for c in checks))
    artifact = {'version': 1, 'stage': 'parse_verify', 'summary': summary, 'documents': docs, 'citation_checks': checks,
                'limitations': ['Text matching does not establish semantic support for an extracted value.',
                                'No schema proposal, extraction, approval or publication is performed.']}
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(summary))
    return 1 if summary['failed'] or summary['citations_rejected'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
