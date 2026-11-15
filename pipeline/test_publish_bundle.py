"""Local publication contract tests. Synthetic fixtures are unit tests, not corpus evidence."""
import copy
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('publish_bundle', Path(__file__).with_name('publish_bundle.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        path = Path(self.tmp.name)/'fixture.csv'
        path.write_text('length [m]\n1\n2\n')
        self.doc = m.review.ingest.parse_document(path)
        self.did = self.doc['id']
        self.docs = {self.did: self.doc}
        self.schema = {'version': 1, 'status': 'proposed', 'variables': [
            {'id': 'length', 'label': 'Length', 'type': 'num', 'unit': 'm', 'sigma': 1, 'status': 'approved'}],
            'columns': [{'doc_id': self.did, 'column': 'length [m]', 'variable': 'length',
                         'unit': 'm', 'convert': None, 'status': 'approved'}], 'constants': []}
        self.approval = m.review.approve(m.review.review_request(self.schema, self.docs), self.schema, self.docs, 1, 'fixture reviewer')
        self.extraction = m.review.extract_tables(self.approval, self.docs)
        self.meta = {'id': 'fixture', 'parsed_documents_sha256': m.review.digest(self.docs), 'documents': {self.did: {'sha256': self.doc['sha256'],
            'study': 'fixture-study', 'title': 'Unit test fixture', 'doi': '10.1234/fixture',
            'kind': 'test', 'kind_note': 'Synthetic test record',
            'kind_evidence': self.extraction['records'][0]['citations']['length']}},
            'thresholds': {'grade_a': 1, 'tolerance': 0.25, 'closeness_reach': 3},
            'lens': {'title': 'Fixture lens', 'default_axes': ['length'], 'evidence': {'min_studies': 2},
                'presets': [{'id': 'observed', 'label': 'Observed', 'blurb': '', 'values': {'length': 1},
                             'active': ['length'], 'source': self.extraction['records'][0]['id']}]}}
        self.approve_metadata()

    def approve_metadata(self):
        self.meta.pop('approval', None)
        self.meta['approval'] = {'metadata_sha256': m.review.digest(self.meta), 'sources': m.review.snapshot(self.docs),
            'by': 'fixture reviewer', 'at': '2026-11-15T00:00:00Z', 'authority': 'Unit test only'}

    def build(self):
        return m.build(self.approval, self.docs, self.extraction, self.meta, 1, 1)

    def test_preserves_source_values_units_group_identity_and_immutable_versions(self):
        bundle = self.build()
        pack = bundle['pack']
        self.assertEqual(pack['contract'], 'prometeo.pack/1')
        self.assertEqual(pack['records'][0]['values']['length'], [1, 1])
        self.assertEqual(pack['records'][0]['orig']['length']['text'], '1')
        self.assertEqual(pack['records'][0]['source'], {'id': self.did, 'row': 2})
        self.assertEqual(pack['studies'][0]['counts']['records'], 2)
        self.assertEqual(pack['studies'][0]['summary']['subjects'], [])
        self.assertEqual(pack['studies'][0]['counts']['publications'], 0)
        self.assertIsNone(pack['sources'][0]['license'])
        self.assertNotIn('license', pack['meta'])
        self.assertFalse(bundle['receipt']['published'])
        self.assertEqual(bundle['receipt']['files']['pack'], m.review.digest(pack))
        self.assertEqual(bundle, self.build())

    def test_tampered_values_and_changed_source_or_metadata_are_rejected(self):
        for kind in ('value', 'source', 'metadata', 'parsed'):
            with self.subTest(kind=kind):
                docs, extraction, metadata = copy.deepcopy(self.docs), copy.deepcopy(self.extraction), copy.deepcopy(self.meta)
                if kind == 'value': extraction['records'][0]['values']['length'] = [100, 100]
                if kind == 'source': docs[self.did]['sha256'] = 'f'*64
                if kind == 'metadata': metadata['documents'][self.did]['study'] = 'new-study'
                if kind == 'parsed': docs[self.did]['rows'][0]['values'][0] = '100'
                with self.assertRaises(ValueError):
                    m.build(self.approval, docs, extraction, metadata, 1, 1)

    def test_unreviewed_record_kind_missing_sigma_and_unfounded_preset_are_blocked(self):
        for kind in ('kind', 'sigma', 'preset'):
            with self.subTest(kind=kind):
                meta, approval = copy.deepcopy(self.meta), copy.deepcopy(self.approval)
                if kind == 'kind': meta['documents'][self.did].pop('kind_note')
                if kind == 'preset': meta['lens']['presets'][0]['values']['length'] = 10
                if kind == 'sigma':
                    approval['schema']['variables'][0].pop('sigma')
                    approval['schema_sha256'] = m.review.digest(approval['schema'])
                meta.pop('approval')
                meta['approval'] = {**self.meta['approval'], 'metadata_sha256': m.review.digest(meta)}
                extraction = m.review.extract_tables(approval, self.docs)
                with self.assertRaises(ValueError):
                    m.build(approval, self.docs, extraction, meta, 1, 1)

    def test_conflicts_require_resolution_and_proposal_never_publishes(self):
        self.approval['stage'] = 'awaiting_review'
        with self.assertRaises(ValueError): self.build()

    def test_unresolved_conflicts_block_bundle_generation(self):
        path = Path(self.tmp.name)/'conflicting.csv'
        path.write_text('a,b\n1,2\n')
        doc = m.review.ingest.parse_document(path)
        docs = {doc['id']: doc}
        schema = copy.deepcopy(self.schema)
        schema['columns'] = [{**schema['columns'][0], 'doc_id': doc['id'], 'column': key} for key in ('a', 'b')]
        approval = m.review.approve(m.review.review_request(schema, docs), schema, docs, 1, 'fixture reviewer')
        extraction = m.review.extract_tables(approval, docs)
        meta = copy.deepcopy(self.meta)
        meta['documents'] = {doc['id']: {**next(iter(meta['documents'].values())), 'sha256': doc['sha256']}}
        meta['parsed_documents_sha256'] = m.review.digest(docs)
        meta.pop('approval')
        meta['approval'] = {**self.meta['approval'], 'sources': m.review.snapshot(docs), 'metadata_sha256': m.review.digest(meta)}
        with self.assertRaisesRegex(ValueError, 'Resolve conflicts'):
            m.build(approval, docs, extraction, meta, 1, 1)


if __name__ == '__main__':
    unittest.main()
