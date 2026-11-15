#!/usr/bin/env python3
"""validate_pack.py - validador minimo del contrato prometeo.pack/1 (pack, mapping y lens).

Comprueba la forma del contrato y, para el pack de PSI, los hallazgos conocidos de AGENTS.md 5
(0 de 268 pruebas de solidos registran presion; O2 maximo de solidos 22.2 % en BASS-II).

Uso: python3 -I pipeline/validate_pack.py [carpeta]      Solo libreria estandar.
"""
import json, os, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FLAGS = {"unit_unconverted", "suspect_value", "range_row", "quote_fuzzy", "mapping_uncertain"}
errores = []


def err(msg):
    errores.append(msg)


def main(carpeta):
    pack = json.load(open(os.path.join(carpeta, "pack.json"), encoding="utf-8"))
    mapping = json.load(open(os.path.join(carpeta, "mapping.json"), encoding="utf-8"))
    lens = json.load(open(os.path.join(carpeta, "lens.json"), encoding="utf-8"))

    if pack.get("contract") != "prometeo.pack/1":
        err("contract != prometeo.pack/1")
    for k in ("meta", "schema", "sources", "studies", "records", "claims"):
        if k not in pack:
            err(f"falta pack.{k}")
    variables = {v["id"]: v for v in pack["schema"]["variables"]}
    for v in variables.values():
        if v["type"] not in ("num", "cat"):
            err(f"variable {v['id']}: type invalido")
        if v["type"] == "num" and not (v.get("sigma", 0) > 0 and len(v.get("range", [])) == 2):
            err(f"variable {v['id']}: num sin sigma o range")
        if v.get("risk") and not v["risk"].get("source"):
            err(f"variable {v['id']}: risk sin fuente")
    if sum(1 for v in variables.values() if v.get("role") == "partition") > 1:
        err("mas de una variable de particion")
    for k in ("grade_a", "tolerance", "closeness_reach"):
        if k not in pack["schema"]["thresholds"]:
            err(f"falta thresholds.{k}")

    fuentes = {s["id"]: s for s in pack["sources"]}
    estudios = {s["id"] for s in pack["studies"]}
    if len(estudios) != len(pack["studies"]):
        err("ids de estudio repetidos")
    for s in pack["sources"]:
        if s["study"] not in estudios:
            err(f"fuente {s['id']}: estudio desconocido")
        if len(s.get("sha256", "")) != 64:
            err(f"fuente {s['id']}: sha256 invalido")
    ids = set()
    for candidate in pack.get('contextual_evidence', []):
        citation, decision = candidate.get('citation', {}), candidate.get('review', {})
        source = fuentes.get(citation.get('doc_id'), {})
        if (candidate.get('status') != 'contextual' or candidate.get('variable') not in variables
                or citation.get('kind') != 'paper' or source.get('kind') != 'paper'
                or type(citation.get('page')) is not int or citation['page'] < 1 or not citation.get('quote')
                or citation.get('verified') is not True or decision.get('supports_value') is not True
                or decision.get('use_in_records') is not False or decision.get('propagate_to_tables') is not False
                or not all(decision.get(k) for k in ('by', 'at', 'reason', 'scope'))
                or candidate.get('scope') != decision.get('scope')):
            err('contextual_evidence: falta revisión contextual explícita, variable o cita válida')
    for r in pack["records"]:
        rid = r.get("id")
        if rid in ids:
            err(f"registro repetido {rid}")
        ids.add(rid)
        if r.get("study") not in estudios:
            err(f"{rid}: estudio desconocido")
        if r.get("kind") not in ("test", "campaign"):
            err(f"{rid}: kind invalido")
        src = r.get("source") or {}
        if src.get("id") not in fuentes:
            err(f"{rid}: fuente desconocida")
        if r.get("confidence") == "table":
            if not isinstance(src.get("row"), int) or src["row"] < 2:
                err(f"{rid}: fila de origen invalida")
        elif r.get("confidence") == "paper":
            if not r.get("quote") or not isinstance(src.get("page"), int):
                err(f"{rid}: confidence=paper sin quote o page")
        else:
            err(f"{rid}: confidence invalido")
        if set(r.get("flags", [])) - FLAGS:
            err(f"{rid}: bandera desconocida")
        for k, val in r.get("values", {}).items():
            v = variables.get(k)
            if v is None:
                err(f"{rid}: variable {k} fuera del esquema"); continue
            if v["type"] == "num":
                if not (isinstance(val, list) and len(val) == 2 and all(isinstance(x, (int, float)) for x in val) and val[0] <= val[1]):
                    err(f"{rid}: {k} no es rango [min, max]")
                elif not (v["range"][0] <= val[0] and val[1] <= v["range"][1]):
                    err(f"{rid}: {k}={val} fuera de range {v['range']}")
            elif not (isinstance(val, str) and val):
                err(f"{rid}: {k} categorico vacio")
            if v["type"] == "num" and k not in r.get("orig", {}) and k not in _constantes(mapping, src.get("id")):
                err(f"{rid}: {k} sin procedencia (ni columna ni constante del mapeo)")
    for s in pack["studies"]:
        n = sum(1 for r in pack["records"] if r["study"] == s["id"])
        if s["counts"]["records"] != n:
            err(f"estudio {s['id']}: counts.records {s['counts']['records']} != {n}")
    st = pack["meta"]["stats"]
    if st["records"] != len(pack["records"]) or st["studies"] != len(pack["studies"]) or st["sources"] != len(pack["sources"]):
        err("meta.stats no coincide con el contenido")

    for t in mapping["tables"]:
        if t["source"] not in fuentes:
            err(f"mapping: fuente desconocida {t['source']}")
        for c in t["columns"]:
            if c["status"] not in ("approved", "flagged", "rejected"):
                err(f"mapping {t['source']}: status invalido en {c['column']}")
            if c.get("variable") and c["variable"] not in variables:
                err(f"mapping {t['source']}: variable desconocida {c['variable']}")

    for pr in lens.get("presets", []):
        if not pr.get("source"):
            err(f"preset {pr['id']}: sin fuente")
        for k, val in pr["values"].items():
            v = variables.get(k)
            if v is None:
                err(f"preset {pr['id']}: variable {k} fuera del esquema")
            elif v["type"] == "num" and not (v["range"][0] <= val <= v["range"][1]):
                err(f"preset {pr['id']}: {k} fuera de range")
        if set(pr.get("active", [])) - set(pr["values"]):
            err(f"preset {pr['id']}: variable activa sin valor")
    for a in lens.get("default_axes", []):
        if variables.get(a, {}).get("type") != "num":
            err(f"lens.default_axes: {a} no es numerica")
    if not isinstance(lens.get("evidence", {}).get("min_studies"), int):
        err("lens.evidence.min_studies ausente")
    for g in lens.get("known_gaps", []):
        if g["variable"] not in variables or not g.get("source"):
            err("lens.known_gaps: variable desconocida o sin fuente")

    if pack["meta"]["id"] == "psi-fire":   # hallazgos conocidos (AGENTS.md 5)
        solidos = [r for r in pack["records"] if r["kind"] == "test" and r["values"].get("phase") == "solid"]
        con_p = sum(1 for r in solidos if "p" in r["values"])
        o2 = [(r["values"]["o2"][1], r["study"]) for r in solidos if "o2" in r["values"]]
        if len(solidos) != 268 or con_p != 0:
            err(f"hallazgo conocido: se esperaban 0 de 268 solidos con presion, hay {con_p} de {len(solidos)}")
        if not o2 or max(o2) != (22.2, "PSI-25"):
            err(f"hallazgo conocido: O2 maximo de solidos deberia ser 22.2 (PSI-25), es {max(o2) if o2 else None}")
        print(f"hallazgos conocidos: {con_p} de {len(solidos)} solidos con presion | O2 maximo de solidos {max(o2)[0]} % ({max(o2)[1]})")

    if errores:
        print(f"validate_pack: {len(errores)} errores")
        for e in errores[:40]:
            print("  -", e)
        sys.exit(1)
    print(f"validate_pack: OK ({st['studies']} estudios, {st['records']} registros, {st['sources']} fuentes)")


_cache = {}


def _constantes(mapping, sid):
    if not _cache:
        for t in mapping["tables"]:
            _cache[t["source"]] = t.get("constants", {})
    return _cache.get(sid, {})


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(RAIZ, "web/public/demo"))
