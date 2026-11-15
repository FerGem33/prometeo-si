"""Explicit contextual PDF decisions, separate from experimental table records."""
import copy

try:
    from .projects import fail, stamp
    from .paper_worker import artifact_key
except ImportError:
    from projects import fail, stamp
    from paper_worker import artifact_key


class PaperReview:
    def papers(self, uid, pid, data=None, candidate_id=None, exclude_doc=None):
        parent, approval, documents, _, _, state = self.context(uid, pid)
        items, jobs = [], []
        for did, document in documents.items():
            if document['kind'] != 'paper': continue
            raw = self.schemas.optional(artifact_key(uid, pid, did, approval))
            if raw is None:
                jobs.append({'doc_id': did, 'status': 'pending'})
                continue
            if (raw.get('artifact_sha256') != self.digest({k: v for k, v in raw.items() if k != 'artifact_sha256'})
                    or raw['source_sha256'] != document['sha256'] or raw['schema_sha256'] != approval['schema_sha256']):
                fail(409, 'conflict', 'PDF candidate source/schema changed')
            jobs.append({'doc_id': did, 'status': 'failed' if raw.get('failure') else 'done',
                         'pages': raw.get('pages', []), 'rejected': raw.get('rejected', []),
                         'failure': raw.get('failure'), 'usage': raw.get('usage', {})})
            for candidate in raw['candidates']:
                item = copy.deepcopy(candidate)
                item['id'] = 'pc_'+self.digest([did, approval['schema_sha256'], candidate])[:32]
                item.update(state.get('paper_reviews', {}).get(item['id'], {}))
                if item['status'] == 'contextual':
                    item['proposed_scope'] = item['scope']; item['scope'] = item['review']['scope']
                items.append(item)
        for candidate in state.get('manual_paper_candidates', []):
            item = copy.deepcopy(candidate); item.update(state.get('paper_reviews', {}).get(item['id'], {}))
            if item['status'] == 'contextual':
                item['proposed_scope'] = item['scope']; item['scope'] = item['review']['scope']
            items.append(item)
        if data is None:
            return {'items': items, 'documents': jobs, 'exclusions': state.get('paper_exclusions', {}),
                    'next_cursor': None, 'note': 'Literal validation is not semantic support; contextual values never populate table records.'}
        updated = copy.deepcopy(state)
        if exclude_doc:
            if (exclude_doc not in documents or documents[exclude_doc]['kind'] != 'paper'): fail(404, 'not_found', 'Paper not found')
            if (not isinstance(data, dict) or set(data) != {'reason'} or not isinstance(data['reason'], str)
                    or not 1 <= len(data['reason'].strip()) <= 4000): fail(400, 'invalid_request', 'Expected exclusion reason')
            updated.setdefault('paper_exclusions', {})[exclude_doc] = {'by': uid, 'at': stamp(), 'reason': data['reason'].strip()}
            result = updated['paper_exclusions'][exclude_doc]
        elif candidate_id:
            candidate = next((c for c in items if c['id'] == candidate_id), None)
            if not candidate: fail(404, 'not_found', 'PDF candidate not found')
            if (not isinstance(data, dict) or set(data)-{'status', 'reason', 'scope', 'supports_value'}
                    or data.get('status') not in ('contextual', 'rejected') or not isinstance(data.get('reason'), str)
                    or not 1 <= len(data['reason'].strip()) <= 4000): fail(400, 'invalid_request', 'Expected explicit contextual/rejected decision and reason')
            if data['status'] == 'contextual' and (data.get('supports_value') is not True or not isinstance(data.get('scope'), str)
                    or not 1 <= len(data['scope'].strip()) <= 4000):
                fail(400, 'invalid_request', 'Contextual acceptance requires reviewed scope and supports_value=true')
            result = {'status': data['status'], 'review': {'by': uid, 'at': stamp(), 'reason': data['reason'].strip(),
                'scope': data.get('scope', candidate['scope']), 'supports_value': data.get('supports_value') is True,
                'use_in_records': False, 'propagate_to_tables': False}}
            updated.setdefault('paper_reviews', {})[candidate_id] = result
        else:
            if not isinstance(data, dict) or set(data) != {'candidate', 'reason'} or not isinstance(data['reason'], str) or not data['reason'].strip():
                fail(400, 'invalid_request', 'Expected manually reviewed candidate and reason')
            try:
                checked = self.review_core.verify_paper_candidates({'candidates': [data['candidate']]}, approval, documents)
                if checked['rejected']: raise ValueError(checked['rejected'][0]['reason'])
                result = checked['candidates'][0]
            except (ValueError, KeyError, TypeError) as exc: fail(400, 'invalid_request', str(exc))
            result.update(id='pc_'+self.digest([approval['schema_sha256'], result])[:32], origin='manual',
                          submitted_by=uid, submitted_at=stamp(), reason=data['reason'].strip())
            if any(c['id'] == result['id'] for c in state.get('manual_paper_candidates', [])): return result
            updated.setdefault('manual_paper_candidates', []).append(result)
        updated['version'] += 1; updated['previous_sha256'] = state['review_sha256']
        updated['history'].append({'change': 'paper_review', 'by': uid, 'at': stamp(), 'result': copy.deepcopy(result)})
        self.record_review.seal(updated)
        self.persist_review(uid, pid, parent, updated)
        return result

    def reviewed_papers(self, uid, pid):
        response = self.papers(uid, pid)
        excluded = response['exclusions']
        if any(d['status'] != 'done' and d['doc_id'] not in excluded for d in response['documents']):
            fail(409, 'conflict', 'Wait for PDF extraction or explicitly exclude failed/pending papers')
        active = [c for c in response['items'] if c['citation']['doc_id'] not in excluded]
        if any(c['status'] == 'awaiting_semantic_review' for c in active):
            fail(409, 'conflict', 'Review PDF candidates before publication')
        return [c for c in active if c['status'] == 'contextual']

    def extract_paper(self, uid, pid, did, data):
        if data != {}: fail(400, 'invalid_request', 'PDF extraction takes the current approved schema')
        _, approval, documents, _, _, _ = self.context(uid, pid)
        if did not in documents or documents[did]['kind'] != 'paper': fail(404, 'not_found', 'Paper not found')
        import json
        self.schemas.sqs.send_message(QueueUrl=self.schemas.queue, MessageBody=json.dumps({'version': 1,
            'action': 'paper_extract', 'uid': uid, 'project_id': pid, 'doc_id': did,
            'schema_version': approval['schema']['version'], 'schema_sha256': approval['schema_sha256']}))
        return {'doc_id': did, 'status': 'queued', 'note': 'Matching completed extractor checkpoints are reused.'}
