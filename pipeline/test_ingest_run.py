import copy
import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('ingest_run', Path(__file__).with_name('ingest_run.py'))
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name); self.work = self.root / 'work'; self.work.mkdir()
        self.request = {'model': 'test-model', 'system': 'instructions', 'content': 'data'}
        self.calls = 0

    def caller(self, request, raw, output):
        self.calls += 1
        m.save(raw, {'stop_reason': 'end_turn', 'content': [{'type': 'text', 'text': '{"ok":true}'}],
                     'usage': {'input_tokens': 2, 'output_tokens': 3}})
        m.save(output, {'ok': True})

    def test_success_is_reused_and_changed_request_invalidates(self):
        first, receipt = m.model_response(self.request, self.work, {}, invoke=True, caller=self.caller)
        second, again = m.model_response(self.request, self.work, {}, invoke=True, caller=self.caller)
        self.assertEqual(first, second); self.assertEqual(self.calls, 1)
        self.assertTrue(receipt['called_now']); self.assertFalse(again['called_now'])
        for key in ('model', 'system', 'content'):
            changed = {**self.request, key: 'changed'}
            m.model_response(changed, self.work, {}, invoke=True, caller=self.caller)
        self.assertEqual(self.calls, 4)

    def test_invalid_json_is_preserved_and_not_reinvoked(self):
        def bad(request, raw, output):
            self.calls += 1
            m.save(raw, {'stop_reason': 'end_turn', 'content': [{'type': 'text', 'text': 'malformed'}]})
        stats = {'calls_now': 0, 'reused_responses': 0}
        for _ in range(2):
            with self.assertRaises(ValueError):
                m.model_response(self.request, self.work, {}, invoke=True, caller=bad, stats=stats)
        self.assertEqual(self.calls, 1); self.assertEqual(stats, {'calls_now': 1, 'reused_responses': 1})
        self.assertEqual(len(list(self.work.rglob('raw.json'))), 1)

    def test_transport_error_requires_explicit_retry(self):
        def fail(request, raw, output):
            self.calls += 1; raise OSError('network failure')
        for _ in range(2):
            with self.assertRaises(ValueError):
                m.model_response(self.request, self.work, {}, invoke=True, caller=fail)
        self.assertEqual(self.calls, 1)
        m.model_response(self.request, self.work, {}, invoke=True, retry_failed=True, caller=self.caller)
        self.assertEqual(self.calls, 2)
        self.assertEqual(len(list(self.work.rglob('attempt-*'))), 2)

    def test_raw_integrity_and_unmatched_import_fail_closed(self):
        _, receipt = m.model_response(self.request, self.work, {}, invoke=True, caller=self.caller)
        Path(receipt['raw']).write_text('{}')
        with self.assertRaisesRegex(ValueError, 'retry-failed'):
            m.model_response(self.request, self.work, {}, invoke=True, caller=self.caller)
        self.assertEqual(self.calls, 1)
        m.model_response(self.request, self.work, {}, invoke=True, retry_failed=True, caller=self.caller)
        self.assertEqual(self.calls, 2)
        with self.assertRaisesRegex(ValueError, 'pending'):
            m.model_response({**self.request, 'content': 'changed corpus'}, self.work, {})

    def test_parser_cache_invalidates_changed_sources_and_paths(self):
        path = self.root / 'one.csv'; path.write_text('value\n1\n')
        first, hit = m.parse_cached(path, self.work); self.assertFalse(hit)
        same, hit = m.parse_cached(path, self.work); self.assertTrue(hit)
        path.write_text('value\n2\n')
        changed, hit = m.parse_cached(path, self.work)
        self.assertFalse(hit); self.assertNotEqual(first['id'], changed['id'])
        folder = self.root / 'other'; folder.mkdir(); moved = folder / 'one.csv'; moved.write_bytes(path.read_bytes())
        moved_doc, hit = m.parse_cached(moved, self.work)
        self.assertFalse(hit); self.assertEqual(moved_doc['path'], str(moved))

    def proposal(self, doc):
        return {'doc_id': doc['id'], 'variables': [{'id': 'amount', 'label': 'Amount', 'type': 'num', 'unit': None,
                'evidence': [{'kind': 'table', 'doc_id': doc['id'], 'row': 2, 'column': 'value', 'text': doc['rows'][0]['values'][0]}]}],
                'columns': [{'column': 'value', 'variable': 'amount', 'unit': None, 'convert': None}]}

    def prepare_corpus(self, corrupt=False):
        imported = self.root / 'imports'; imported.mkdir()
        documents = []
        for index in (1, 2):
            path = self.root / f'{index}.csv'; path.write_text(f'value\n{index}\n')
            documents.append({'path': str(path)})
            doc = m.ingest.parse_document(path)
            content = m.adapter.request_data({'documents': [doc], 'profiles': [m.ingest.profile_document(doc)]}, doc['id'], None)
            request = {'model': 'test-model', 'system': m.adapter.proposal_system(), 'content': content}
            folder = imported / str(index); folder.mkdir()
            m.save(folder / 'request.json', request)
            m.save(folder / 'raw.json', {'stop_reason': 'end_turn', 'content': [{'type': 'text', 'text': json.dumps(self.proposal(doc))}]})
        if corrupt:
            path = self.root / 'bad.csv'; path.write_text('duplicate,duplicate\n1,2\n'); documents.append({'path': str(path)})
        manifest = self.root / 'manifest.json'; m.save(manifest, {'documents': documents})
        return SimpleNamespace(work_dir=self.work, manifest=manifest, vocabulary=None, import_results=[imported],
                               invoke=False, retry_failed=False, approval=None)

    def test_corrupt_document_keeps_successful_batch_and_blocks_approval(self):
        args = self.prepare_corpus(corrupt=True)
        with patch.dict(m.os.environ, {'MODEL_ID': 'test-model'}):
            self.assertEqual(m.run(args), 1)
            state = m.load(self.work / 'state.json')
            self.assertEqual(state['failures'], 1); self.assertEqual(len(state['proposals']), 2)
            self.assertEqual(state['calls_now'], 0); self.assertEqual(state['reused_responses'], 2)
            with self.assertRaisesRegex(ValueError, 'resolve failures'):
                m.approve_run(SimpleNamespace(work_dir=self.work))
            self.assertEqual(m.run(args), 1)
            self.assertEqual(m.load(self.work / 'state.json')['parse_hits'], 3)

    def test_joint_proposals_never_merge_by_matching_name(self):
        args = self.prepare_corpus()
        with patch.dict(m.os.environ, {'MODEL_ID': 'test-model'}): m.run(args)
        state = m.load(self.work / 'state.json'); joint = m.load(state['joint_proposal'])
        variables = joint['schema']['variables']
        self.assertEqual(len(variables), 2); self.assertNotEqual(variables[0]['id'], variables[1]['id'])
        self.assertEqual(len(joint['possible_merges']), 1)
        self.assertTrue(all(v['status'] == 'proposed' for v in variables))

    def test_explicit_approval_resume_and_source_change(self):
        args = self.prepare_corpus()
        with patch.dict(m.os.environ, {'MODEL_ID': 'test-model'}):
            m.run(args); state = m.load(self.work / 'state.json')
            schema = m.load(state['joint_proposal'])['schema']
            for element in schema['variables'] + schema['columns']: element['status'] = 'approved'
            edited = self.root / 'reviewed.json'; m.save(edited, schema)
            approve_args = SimpleNamespace(work_dir=self.work, reviewed_schema=edited, version=1, reviewer='test reviewer')
            m.approve_run(approve_args)
            m.run(args); state = m.load(self.work / 'state.json')
            self.assertEqual(state['stage'], 'extracted_draft'); self.assertEqual(state['calls_now'], 0)
            self.assertEqual(len(m.load(state['extraction'])['records']), 2)
            (self.root / '1.csv').write_text('value\n99\n')
            m.run(args); state = m.load(self.work / 'state.json')
            self.assertEqual(state['stage'], 'awaiting_review')
            self.assertIn('approval_invalidated', state); self.assertNotIn('extraction', state)
            self.assertEqual(state['reused_responses'], 1); self.assertEqual(state['calls_now'], 0)


if __name__ == '__main__':
    unittest.main()
