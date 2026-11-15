"""Auditable edits with synthetic local fixtures; no real corpus corrections are authorized here."""
import copy
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('review_records', Path(__file__).with_name('review_records.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class RecordReviewTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        path = Path(self.tmp.name)/'fixture.csv'
        path.write_text('a,b\n1,2\n')
        self.doc = m.review.ingest.parse_document(path)
        self.docs = {self.doc['id']: self.doc}

    def state(self, conflict=False):
        did = self.doc['id']
        schema = {'version': 1, 'status': 'proposed', 'variables': [
            {'id': 'quantity', 'label': 'Fixture quantity', 'type': 'num', 'unit': 'm', 'sigma': 1, 'status': 'approved'}],
            'columns': [{'doc_id': did, 'column': c, 'variable': 'quantity' if c == 'a' or conflict else None,
                         'unit': 'm', 'convert': None, 'status': 'approved' if c == 'a' or conflict else 'rejected'} for c in ('a', 'b')],
            'constants': []}
        approval = m.review.approve(m.review.review_request(schema, self.docs), schema, self.docs, 1, 'fixture reviewer')
        return m.begin(approval, self.docs, m.review.extract_tables(approval, self.docs))

    def test_repeated_corrections_keep_initial_value_citation_author_and_history(self):
        original = self.state()
        rid = original['records'][0]['id']
        first = m.apply(original, self.docs, [{'op': 'correct', 'record_id': rid, 'variable': 'quantity',
            'value': [3, 3], 'reason': 'Unit-test correction'}], 1, 'reviewer-one')
        second = m.apply(first, self.docs, [{'op': 'correct', 'record_id': rid, 'variable': 'quantity',
            'value': [4, 4], 'reason': 'Second unit-test correction'}], 2, 'reviewer-two')
        record = second['records'][0]
        self.assertEqual(record['values']['quantity'], [4, 4])
        self.assertEqual(record['corrections']['quantity']['from'], [1, 1])
        self.assertEqual(record['corrections']['quantity']['by'], 'reviewer-two')
        self.assertEqual(record['original_citations']['quantity']['text'], '1')
        self.assertEqual(len(record['correction_history']), 2)
        self.assertEqual(original['records'][0]['values']['quantity'], [1, 1])
        self.assertEqual(second['previous_sha256'], first['review_sha256'])

    def test_exclusion_preserves_values_and_citations(self):
        state = self.state()
        record = state['records'][0]
        result = m.apply(state, self.docs, [{'op': 'exclude', 'record_id': record['id'], 'reason': 'Fixture exclusion'}], 1, 'reviewer')
        self.assertTrue(result['records'][0]['excluded'])
        self.assertEqual(result['records'][0]['values'], record['values'])
        self.assertEqual(result['records'][0]['citations'], record['citations'])
        self.assertFalse(result['published'])

    def test_fully_conflicting_row_is_reviewable_without_selecting_a_value(self):
        state = self.state(conflict=True)
        self.assertEqual(state['records'][0]['values'], {})
        cid = state['conflicts'][0]['id']
        result = m.apply(state, self.docs, [{'op': 'resolve', 'conflict_id': cid, 'choice': 1, 'reason': 'Fixture selection'}], 1, 'reviewer')
        self.assertEqual(result['records'][0]['values']['quantity'], [2, 2])
        self.assertEqual(result['records'][0]['citations']['quantity']['column'], 'b')
        self.assertEqual(result['conflicts'][0]['status'], 'resolved')

    def test_retained_alternatives_are_distinct_flagged_records_with_one_parent(self):
        state = self.state(conflict=True)
        result = m.apply(state, self.docs, [{'op': 'resolve', 'conflict_id': state['conflicts'][0]['id'],
            'choice': 'keep_all', 'reason': 'Retain uncertainty in fixture'}], 1, 'reviewer')
        self.assertTrue(result['records'][0]['excluded'])
        variants = result['records'][1:]
        self.assertEqual(len({r['id'] for r in variants}), 2)
        self.assertTrue(all(r['alternative_of'] == state['records'][0]['id'] for r in variants))
        self.assertTrue(all('mapping_uncertain' in r['flags'] for r in variants))

    def test_stale_sources_false_citations_invalid_values_and_empty_reason_are_blocked(self):
        state = self.state()
        rid = state['records'][0]['id']
        change = {'op': 'correct', 'record_id': rid, 'variable': 'quantity', 'value': [3, 3], 'reason': 'Fixture'}
        for problem in ('version', 'source', 'citation', 'value', 'reason'):
            with self.subTest(problem=problem):
                local, docs, edit, version = copy.deepcopy(state), copy.deepcopy(self.docs), copy.deepcopy(change), 1
                if problem == 'version': version = 2
                if problem == 'source': docs[self.doc['id']]['rows'][0]['values'][0] = '99'
                if problem == 'citation':
                    local['records'][0]['citations']['quantity']['text'] = 'does not exist'
                    m.seal(local)
                if problem == 'value': edit['value'] = [4, 3]
                if problem == 'reason': edit['reason'] = ''
                with self.assertRaises(ValueError): m.apply(local, docs, [edit], version, 'reviewer')

    def test_boolean_choice_cannot_be_used_as_candidate_index(self):
        state = self.state(conflict=True)
        with self.assertRaises(ValueError):
            m.apply(state, self.docs, [{'op': 'resolve', 'conflict_id': state['conflicts'][0]['id'],
                'choice': True, 'reason': 'Fixture'}], 1, 'reviewer')

    def test_claim_requires_literal_paper_quote_and_reviewed_study_identity(self):
        quote = 'The fixture leaves quantity unmeasured.'
        self.docs['paper-fixture'] = {'id': 'paper-fixture', 'kind': 'paper', 'name': 'fixture.pdf',
            'status': 'done', 'sha256': 'd'*64, 'pages': [{'page': 1, 'text': quote}]}
        state = self.state()
        state['source_studies']['paper-fixture'] = 'fixture-study'  # Explicit fixture metadata, not a real source.
        m.seal(state)
        claim = {'id': 'fixture-gap', 'kind': 'gap', 'variables': ['quantity'], 'statement': quote,
            'study': 'fixture-study', 'citation': {'kind': 'paper', 'doc_id': 'paper-fixture',
            'page': 1, 'quote': quote, 'verified': False}}
        change = {'op': 'claim', 'claim': claim, 'reason': 'Fixture author statement reviewed'}
        result = m.apply(state, self.docs, [change], 1, 'reviewer')
        self.assertTrue(result['claims'][0]['citation']['verified'])
        self.assertEqual(result['claims'][0]['statement'], quote)
        for field, value in [('statement', 'A new inference'), ('study', 'unknown-study')]:
            invalid = copy.deepcopy(change)
            invalid['claim'][field] = value
            with self.assertRaises(ValueError): m.apply(state, self.docs, [invalid], 1, 'reviewer')
        invalid = copy.deepcopy(change)
        invalid['claim']['citation']['quote'] = 'A sentence absent from the paper.'
        with self.assertRaisesRegex(ValueError, 'citation rejected'):
            m.apply(state, self.docs, [invalid], 1, 'reviewer')


if __name__ == '__main__':
    unittest.main()
