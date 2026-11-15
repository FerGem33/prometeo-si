"""Parser/verification regression tests; synthetic text is test-only, never evidence."""
import importlib.util
from pathlib import Path
import tempfile
import copy
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


class ProposalTests(unittest.TestCase):
    def setUp(self):
        self.doc = dict(id='d', name='test.csv', sha256='test', kind='table', status='done',
                        **ingest.parse_csv(b'x,y\n12,note\n14,\nNaN,other'))
        self.response = {'doc_id': 'd', 'variables': [
            {'id': 'x', 'label': 'X', 'type': 'num', 'unit': None,
             'evidence': [{'kind': 'table', 'doc_id': 'd', 'row': 2, 'column': 'x', 'text': '12'}]}],
            'columns': [{'column': 'x', 'variable': 'x', 'unit': None, 'convert': None},
                        {'column': 'y', 'variable': None, 'unit': None, 'convert': None}]}

    def test_profile_does_not_guess_numbers_or_units(self):
        p = ingest.profile_document(self.doc)
        self.assertEqual(p['columns'][0]['numeric_cells'], 2)
        self.assertEqual(p['columns'][0]['numeric_range'], [12, 14])
        self.assertEqual(p['columns'][0]['observed_type'], 'text_or_mixed')
        self.assertEqual(p['columns'][1]['missing'], 1)

    def test_valid_proposal_remains_unapproved(self):
        p = ingest.validate_proposal(self.response, {'d': self.doc})
        self.assertEqual(p['status'], 'proposed')
        self.assertEqual(p['variables'][0]['records'], 0)
        self.assertTrue(all(c['status'] == 'proposed' for c in p['columns']))

    def test_rejects_untrusted_proposal_mutations(self):
        mutations = [
            lambda r: r.update(status='approved'),
            lambda r: r['variables'][0].update(status='approved'),
            lambda r: r['variables'][0]['evidence'][0].update(text='13'),
            lambda r: r['variables'][0].update(evidence=[]),
            lambda r: r['variables'].append(copy.deepcopy(r['variables'][0])),
            lambda r: r['columns'].pop(),
            lambda r: r['columns'].append(copy.deepcopy(r['columns'][0])),
            lambda r: r['columns'][0].update(variable='unknown'),
            lambda r: r['columns'][0].update(convert={'factor': float('nan'), 'offset': 0}),
            lambda r: r['columns'][0].update(convert={'factor': True, 'offset': 0}),
        ]
        for mutate in mutations:
            r = copy.deepcopy(self.response)
            mutate(r)
            with self.subTest(response=r), self.assertRaises(ValueError):
                ingest.validate_proposal(r, {'d': self.doc})


if __name__ == '__main__':
    unittest.main()
