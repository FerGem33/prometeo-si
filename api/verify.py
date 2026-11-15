"""Verificación conservadora: no basta que los números existan en el caso.
La frase completa debe coincidir con una redacción permitida del hallazgo.
"""
import math


def number(value):
    if type(value) not in (int, float) or not math.isfinite(value):
        raise ValueError('Expected a finite number')
    return str(value) if isinstance(value, int) else format(value, '.12g')


def candidates(findings, schema, source_ids):
    labels = {v['id']: v.get('long', v.get('label', v['id'])) for v in schema['variables']}
    out = []
    seen = set()
    for f in findings:
        if not isinstance(f, dict) or not isinstance(f.get('id'), str) or f['id'] in seen:
            raise ValueError('Invalid or duplicate finding')
        seen.add(f['id'])
        refs = f.get('sources')
        if not isinstance(refs, list) or any(not isinstance(r, str) or r not in source_ids for r in refs):
            raise ValueError('Unknown source')
        p = f.get('params')
        if not isinstance(p, dict):
            raise ValueError('Invalid finding parameters')
        label = labels.get(f.get('variable'), '')
        code = f.get('code')
        text = None
        if code == 'never_measured' and label:
            text = f"{label} is not recorded in any of the {number(p['n'])} comparable tests."
        elif code in ('above_tested', 'below_tested') and label:
            direction = 'above' if code == 'above_tested' else 'below'
            extreme = 'highest' if code == 'above_tested' else 'lowest'
            text = (f"{label} is {number(p['delta'])} {p['delta_unit']} {direction} the tested range; "
                    f"the {extreme} recorded value is {number(p['edge'])} {p['unit']}.")
        elif code == 'tested_elsewhere' and label:
            text = (f"{number(p['n'])} tests in other partitions cover this value of {label}; "
                    f"they are not comparable with the scenario and are context only.")
        elif code == 'within_tested' and label:
            text = f"{label} is inside the tested range; {number(p['n'])} tests cover it."
        elif code == 'category_tested':
            text = f"{p['value']} appears in {number(p['n'])} comparable tests."
        elif code == 'full_coverage':
            text = f"{number(p['n'])} tests record every active variable of the scenario."
        # Unsupported codes and missing provenance are omitted, never improvised.
        if text and refs:
            out.append({'finding': f['id'], 'text': text, 'sources': list(dict.fromkeys(refs))})
    return out


def verify(payload, allowed):
    if not isinstance(payload, dict) or set(payload) != {'sentences'}:
        raise ValueError('Invalid analysis response')
    sentences = payload['sentences']
    if not isinstance(sentences, list) or len(sentences) > 8:
        raise ValueError('Invalid sentences')
    lookup = {s['finding']: s for s in allowed}
    accepted, seen = [], set()
    for item in sentences:
        if not isinstance(item, dict) or set(item) != {'finding', 'text'}:
            continue
        key = item['finding']
        if isinstance(key, str) and key not in seen and key in lookup and item['text'] == lookup[key]['text']:
            accepted.append(lookup[key])
            seen.add(key)
    dropped = len(sentences) - len(accepted)
    fallback = not accepted or dropped > len(sentences) / 2
    return {'mode': 'template' if fallback else 'ai',
            'sentences': allowed[:5] if fallback else accepted,
            'dropped': dropped}


def validate_facts(findings, pack, scenario):
    """Comprueba solo los hechos que este verificador permite publicar.
    No asigna niveles ni ranking: comprueba contra registros el subconjunto usado.
    """
    variables = pack['schema']['variables']
    values, active = scenario['values'], scenario['active']
    cats = [v for v in variables if v['type'] == 'cat' and v.get('role') != 'partition' and v['id'] in active]
    pv = next((v['id'] for v in variables if v.get('role') == 'partition'), None)
    partition = values.get(pv)
    if pv and not partition:
        for v in cats:
            seen = {r['values'][pv] for r in pack['records'] if r['values'].get(v['id']) == values[v['id']] and pv in r['values']}
            if len(seen) == 1:
                partition = next(iter(seen)); break
    pool = [r for r in pack['records'] if r['kind'] == 'test' and (not partition or r['values'].get(pv) == partition)]
    ids = [v['id'] for v in variables if v['id'] in active and v.get('role') != 'partition']
    supported = {'never_measured', 'above_tested', 'below_tested', 'within_tested', 'category_tested', 'full_coverage', 'tested_elsewhere'}
    for f in findings:
        if not isinstance(f, dict):
            raise ValueError('Invalid finding')
        code = f.get('code')
        if code not in supported:
            continue
        key, p = f.get('variable'), f.get('params', {})
        v = next((v for v in variables if v['id'] == key), None)
        expected_id = code + (':' + key if key else '')
        if f.get('id') != expected_id or (key and key not in active):
            raise ValueError('Finding does not match scenario')
        expected = {}
        if code == 'full_coverage':
            rows = [r for r in pool if ids and all(k in r['values'] for k in ids)]
            expected['n'] = len(rows)
            refs = {r['study'] for r in rows}
        elif code == 'category_tested':
            if not v or v['type'] != 'cat' or v.get('role') == 'partition':
                raise ValueError('Invalid category finding')
            rows = [r for r in pool if r['values'].get(key) == values[key]]
            expected = {'value':values[key], 'n':len(rows)}
            refs = {r['study'] for r in rows}
        elif code == 'tested_elsewhere':
            if not v or v['type'] != 'num' or not partition:
                raise ValueError('Invalid context finding')
            t = values[key]
            tol = pack['schema']['thresholds']['tolerance'] * scenario.get('sigma', {}).get(key, v['sigma'])
            rows = [r for r in pack['records'] if r['kind'] == 'test' and r['values'].get(pv) != partition
                    and isinstance(r['values'].get(key), list) and r['values'][key][0]-tol <= t <= r['values'][key][1]+tol]
            if not rows: raise ValueError('Not covered elsewhere')
            expected['n'] = len(rows)
            refs = {r['study'] for r in rows}
        else:
            if not v or v['type'] != 'num':
                raise ValueError('Invalid numeric finding')
            have = [r for r in pool if isinstance(r['values'].get(key), list)]
            if code == 'never_measured':
                if have: raise ValueError('Variable was measured')
                expected['n'] = len(pool)
                refs = {r['study'] for r in pool}
            else:
                if not have: raise ValueError('Missing observations')
                low = min(r['values'][key][0] for r in have)
                high = max(r['values'][key][1] for r in have)
                t = values[key]
                tol = pack['schema']['thresholds']['tolerance'] * scenario.get('sigma', {}).get(key, v['sigma'])
                if code == 'within_tested':
                    if not low-tol <= t <= high+tol: raise ValueError('Outside range')
                    rows = [r for r in have if r['values'][key][0]-tol <= t <= r['values'][key][1]+tol]
                    expected['n'] = len(rows)
                    refs = {r['study'] for r in (rows or have)}
                else:
                    above = code == 'above_tested'
                    if not (t > high+tol if above else t < low-tol): raise ValueError('Wrong range direction')
                    edge = high if above else low
                    row = next(r for r in have if r['values'][key][1 if above else 0] == edge)
                    expected = {'delta':math.floor(abs(t-edge)*100+.5)/100, 'delta_unit':v.get('delta_unit', v['unit']), 'edge':edge, 'unit':v['unit']}
                    refs = {row['id']}
        if any(p.get(k) != value or isinstance(p.get(k), bool) for k, value in expected.items()) or set(f.get('sources', [])) != refs:
            raise ValueError('Finding not supported by records')
