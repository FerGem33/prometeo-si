"""Parser/verification regression tests; synthetic text is test-only, never evidence."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import subprocess

spec = importlib.util.spec_from_file_location('ingest', Path(__file__).with_name('ingest.py'))
ingest = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ingest)


class IngestTests(unittest.TestCase):
    def test_multiline_csv_preserves_logical_rows_and_exact_cells(self):
        parsed = ingest.parse_csv(b'name,value\r\n"two\nlines", 12 \r\n\r\nnext,15\r\n')
        self.assertEqual(parsed['rows'], [{'row': 2, 'values': ['two\nlines', ' 12 ']}, {'row': 4, 'values': ['next', '15']}])

    def test_ambiguous_or_broken_csv_rejected(self):
        for raw in (b'a,a\n1,2', b'a,b\n1', b'a,b\n1,2,3', b',b\n1,2', b'a,b\n"unterminated,2'):
            with self.subTest(raw=raw), self.assertRaises(ingest.ParseError):
                ingest.parse_csv(raw)

    def test_table_citation_requires_exact_cell_and_row(self):
        doc = dict(id='d', kind='table', status='done', **ingest.parse_csv(b'a,b\n12,34\n56,78'))
        citation = dict(kind='table', doc_id='d', row=2, column='a', text='12')
        self.assertTrue(ingest.verify_citation(citation, {'d': doc})['verified'])
        for change in ({'row': 3}, {'column': 'b'}, {'text': '1'}, {'row': True}, {'doc_id': []}):
            self.assertFalse(ingest.verify_citation({**citation, **change, 'verified': True}, {'d': doc})['verified'])

    def test_pdf_citation_is_page_specific_and_normalizes_only_whitespace(self):
        doc = dict(kind='paper', status='done', pages=[{'page': 1, 'text': 'Pressure  12\n kPa'}, {'page': 2, 'text': ''}])
        c = dict(kind='paper', doc_id='d', page=1, quote='Pressure 12 kPa')
        self.assertTrue(ingest.verify_citation(c, {'d': doc})['verified'])
        for change in ({'page': 2}, {'quote': 'Pressure 120 kPa'}, {'quote': ' '}, {'page': True}, {'kind': 'table'}):
            self.assertFalse(ingest.verify_citation({**c, **change, 'verified': True}, {'d': doc})['verified'])

    def test_pdf_preserves_blank_pages(self):
        with patch.object(ingest.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, b'first\f\fthird\f')):
            self.assertEqual([p['text'] for p in ingest.parse_pdf(Path('x.pdf'))['pages']], ['first', '', 'third'])

    def test_scan_and_missing_parser_are_explicit_failures(self):
        with patch.object(ingest.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, b'\f')):
            with self.assertRaisesRegex(ingest.ParseError, 'no_text_layer'):
                ingest.parse_pdf(Path('x.pdf'))
        with patch.object(ingest.subprocess, 'run', side_effect=FileNotFoundError):
            with self.assertRaisesRegex(ingest.ParseError, 'parser_unavailable'):
                ingest.parse_pdf(Path('x.pdf'))

    def test_hash_identifies_original_bytes(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder) / 'a.csv'
            p.write_bytes(b'a,b\n12,34')
            doc = ingest.parse_document(p)
            self.assertEqual(doc['sha256'], ingest.hashlib.sha256(p.read_bytes()).hexdigest())
            self.assertEqual(doc['status'], 'done')


if __name__ == '__main__':
    unittest.main()
