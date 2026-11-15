import copy
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('review_extract', Path(__file__).with_name('review_extract.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class ReviewExtractTests(unittest.TestCase):
    def test_published_trimmed_headers_keep_original_citation_locator(self):
        columns = m.align_published_columns([' value ', 'name'], [{'column': 'value', 'variable': 'amount'}, {'column': 'name', 'variable': 'name'}])
        self.assertEqual(columns[' value ']['variable'], 'amount')
        self.assertEqual(columns[' value ']['column'], ' value ')
        for headers in ([' value ', 'value'], ['missing']):
            with self.subTest(headers=headers), self.assertRaises(ValueError):
                m.align_published_columns(headers, [{'column': 'value'}])

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        path = Path(self.tmp.name) / 'source.csv'
        path.write_text('amount,name\n1.5,Sample\n2-3,Other\nunknown,Third\n')
        self.doc = m.ingest.parse_document(path)
        self.docs = {self.doc['id']: self.doc}
        self.schema = {'version': 1, 'status': 'proposed', 'variables': [
            {'id': 'amount', 'label': 'Amount', 'type': 'num', 'unit': 'cm', 'status': 'approved'},
            {'id': 'name', 'label': 'Name', 'type': 'cat', 'status': 'approved'}],
            'columns': [{'doc_id': self.doc['id'], 'column': 'amount', 'variable': 'amount', 'unit': 'm',
                         'convert': {'factor': 100, 'offset': 0}, 'status': 'approved'},
                        {'doc_id': self.doc['id'], 'column': 'name', 'variable': 'name', 'unit': None,
                         'convert': None, 'status': 'approved'}], 'constants': []}

    def approval(self, schema=None):
        schema = schema or self.schema
        return m.approve(m.review_request(schema, self.docs), schema, self.docs, 1, 'test reviewer')

    def test_gate_rejects_proposed_stale_multiple_partitions(self):
        for change in ('proposed', 'version', 'partition'):
            s = copy.deepcopy(self.schema)
            request = m.review_request(s, self.docs)
            if change == 'proposed': s['columns'][0]['status'] = 'proposed'
            if change == 'version': s['version'] = 2
            if change == 'partition':
                for v in s['variables']: v['role'] = 'partition'
            with self.subTest(change=change), self.assertRaises(ValueError):
                m.approve(request, s, self.docs, 1, 'reviewer')
        with self.assertRaises(ValueError):
            m.approve(m.review_request(self.schema, self.docs), self.schema, self.docs, 1, '')

    def test_changed_schema_and_corpus_cannot_extract(self):
        approval = self.approval()
        approval['schema']['variables'][0]['unit'] = 'other'
        with self.assertRaises(ValueError): m.extract_tables(approval, self.docs)
        approval = self.approval()
        approval['documents'][self.doc['id']] = 'changed'
        with self.assertRaises(ValueError): m.extract_tables(approval, self.docs)

    def test_values_preserve_citations_ranges_conversion_and_rejections(self):
        result = m.extract_tables(self.approval(), self.docs)
        self.assertEqual(result['records'][0]['values']['amount'], [150, 150])
        self.assertEqual(result['records'][1]['values']['amount'], [200, 300])
        self.assertEqual(result['records'][0]['citations']['amount']['text'], '1.5')
        self.assertEqual(result['records'][0]['provenance']['amount']['source_unit'], 'm')
        self.assertEqual(len(result['rejected']), 1)
        self.assertNotIn('amount', result['records'][2]['values'])

    def test_flagged_units_are_retained_as_rejections_not_canonical_values(self):
        self.schema['columns'][0].update(convert=None, status='flagged')
        result = m.extract_tables(self.approval(), self.docs)
        self.assertEqual(len(result['rejected']), 3)
        self.assertEqual(result['rejected'][0]['reason'], 'unit_unconverted')

    def test_constants_need_scope_and_semantic_review(self):
        self.schema['constants'] = [{'doc_id': self.doc['id'], 'variable': 'amount', 'value': [3, 3], 'note': 'all'}]
        with self.assertRaises(ValueError): self.approval()
        c = self.schema['constants'][0]
        c.update(rows=[2], source_value=[3, 3], source_unit='cm', convert=None, semantic_support='reviewed', citation={'kind': 'table', 'doc_id': self.doc['id'], 'row': 2, 'column': 'amount', 'text': '1.5'})
        result = m.extract_tables(self.approval(), self.docs)
        self.assertEqual(len(result['conflicts']), 1)
        self.assertNotIn('amount', result['records'][0]['values'])

    def test_pdf_text_match_does_not_approve_semantics_or_scope(self):
        d = {'id': 'paper', 'sha256': 'hash', 'status': 'done', 'kind': 'paper', 'pages': [{'page': 1, 'text': 'Pressure 1 atm.'}]}
        self.docs['paper'] = d
        approval = self.approval()
        base = {'variable': 'amount', 'value': [1, 1], 'unit': 'cm', 'scope': 'candidate scope',
                'citation': {'kind': 'paper', 'doc_id': 'paper', 'page': 1, 'quote': 'Pressure 1 atm.'}}
        wrong = copy.deepcopy(base); wrong['citation']['quote'] = 'Pressure 5 atm.'
        result = m.verify_paper_candidates({'candidates': [base, wrong]}, approval, self.docs)
        self.assertEqual(len(result['candidates']), 1)
        self.assertEqual(result['candidates'][0]['status'], 'awaiting_semantic_review')
        self.assertEqual(len(result['rejected']), 1)
        self.assertFalse(result['published'])
        result = m.verify_paper_candidates({'candidates': [base]}, approval, self.docs, 'other-doc', [1])
        self.assertEqual(result['rejected'][0]['reason'], 'citation outside requested document')
        result = m.verify_paper_candidates({'candidates': [base]}, approval, self.docs, 'paper', [2])
        self.assertEqual(result['rejected'][0]['reason'], 'citation outside requested pages')

    def test_reviewer_can_merge_columns_but_conflicts_are_not_overwritten(self):
        self.schema['columns'][1].update(variable='amount', unit='cm')
        # Both columns have numbers in this fixture row; two mappings to same concept.
        self.doc['rows'][0]['values'][1] = '9'
        result = m.extract_tables(self.approval(), self.docs)
        self.assertEqual(len(result['conflicts']), 1)
        self.assertEqual(len(result['conflicts'][0]['candidates']), 2)

    def test_cross_document_constant_keeps_both_origins(self):
        self.docs['paper'] = {'id': 'paper', 'sha256': 'paper-hash', 'name': 'article.pdf', 'status': 'done',
                              'kind': 'paper', 'pages': [{'page': 2, 'text': 'This sample is 4 cm.'}]}
        self.schema['columns'][0]['status'] = 'rejected'
        self.schema['constants'] = [{'doc_id': self.doc['id'], 'variable': 'amount', 'value': [4, 4],
            'source_value': [0.04, 0.04], 'source_unit': 'm', 'convert': {'factor': 100, 'offset': 0},
            'rows': [2], 'note': 'Reviewer established sample scope', 'semantic_support': 'reviewed',
            'citation': {'kind': 'paper', 'doc_id': 'paper', 'page': 2, 'quote': 'This sample is 4 cm.'}}]
        result = m.extract_tables(self.approval(), self.docs)
        provenance = result['records'][0]['provenance']['amount']
        self.assertEqual(provenance['sha256'], 'paper-hash')
        self.assertEqual(provenance['path'], 'article.pdf')
        self.assertEqual(provenance['target_sha256'], self.doc['sha256'])
        self.assertEqual(provenance['source_unit'], 'm')
        self.schema['constants'][0]['value'] = [400, 400]
        with self.assertRaises(ValueError): self.approval()

    def test_invalid_bool_nonfinite_values_and_unreviewed_units_rejected(self):
        for value in ([True, True], [float('nan'), 1], [2, 1]):
            with self.subTest(value=value), self.assertRaises(ValueError):
                m.validate_value(value, {'type': 'num'})
        self.schema['columns'][0]['convert'] = None
        with self.assertRaises(ValueError): self.approval()


if __name__ == '__main__':
    unittest.main()
