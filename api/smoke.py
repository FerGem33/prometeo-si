"""Invocación local real de los eventos; requiere AWS_PROFILE y MODEL_ID."""
import json
from pathlib import Path
from .handler import handler

for name in ('ask', 'analysis'):
    body = (Path(__file__).parent / 'events' / f'{name}.json').read_text()
    result = handler({'rawPath': '/' + name, 'requestContext': {'http': {'method': 'POST'}}, 'body': body})
    print(name, result['statusCode'], result['body'])
    assert result['statusCode'] == 200
    payload = json.loads(result['body'])
    if name == 'ask':
        assert payload['values']['o2'] == 25 and payload['values']['p'] == .5 and payload['values']['material'] == 'Nomex'
    else:
        assert payload['mode'] == 'ai' and payload['sentences']
