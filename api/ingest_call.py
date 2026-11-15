#!/usr/bin/env python3
"""Invoke one prepared T32 request; the stdlib pipeline owns caching and validation."""
import argparse
import importlib.util
import json
import os
from pathlib import Path

spec = importlib.util.spec_from_file_location('ingest_propose', Path(__file__).with_name('ingest_propose.py'))
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('request', type=Path)
    parser.add_argument('--raw-output', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    request = json.loads(args.request.read_text())
    if os.environ.get('AWS_PROFILE') != 'prometeo' or not os.environ.get('MODEL_ID') or request.get('model') != os.environ['MODEL_ID']:
        parser.error('profile/model must match prometeo and MODEL_ID from infra/config.env')
    if set(request) != {'model', 'system', 'content'} or not all(isinstance(v, str) and v for v in request.values()):
        parser.error('invalid prepared request')
    if args.output.exists() or args.raw_output.exists() or args.output.resolve() == args.raw_output.resolve():
        parser.error('outputs must be separate new files')
    from anthropic import AnthropicBedrock
    with AnthropicBedrock(aws_profile='prometeo', aws_region='us-east-1', timeout=90, max_retries=0) as client:
        response = adapter.propose(client, request['model'], request['content'], args.raw_output, system=request['system'])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(response, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
