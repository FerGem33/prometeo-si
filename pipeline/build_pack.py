#!/usr/bin/env python3
"""build_pack.py - genera el pack de demo (contrato prometeo.pack/1) desde data/psi.

Entrada : data/psi/tables/*.csv, data/psi/meta/*.json, pipeline/lens.json (escrita a mano)
          pipeline/legacy/construir_corpus.py  (SPECS = mapeo ya revisado de las tablas)
Salida  : web/public/demo/pack.json, mapping.json, lens.json

Ruta rapida de la guia 10.1: se reutiliza la logica revisada del corpus del companero
(pruebas_de + SPECS) y solo se cambia la forma de salida. Nada se rellena: lo que la
tabla no trae no aparece en `values`.

Uso: python3 -I pipeline/build_pack.py        Solo libreria estandar.
"""
import glob, hashlib, importlib.util, json, os, re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TABLAS = os.path.join(RAIZ, "data/psi/tables")
METAS = os.path.join(RAIZ, "data/psi/meta")
SALIDA = os.path.join(RAIZ, "web/public/demo")

_sp = importlib.util.spec_from_file_location("construir_corpus", os.path.join(RAIZ, "pipeline/legacy/construir_corpus.py"))
cc = importlib.util.module_from_spec(_sp)
_sp.loader.exec_module(cc)

# Nombres de clase en ingles (la interfaz es solo en ingles). Mismos patrones que el corpus revisado.
CLASE_EN = {"Silicona": "Silicone", "Algodon": "Cotton", "Cera/vela": "Wax / candle", "Etileno": "Ethylene", "Metano": "Methane",
            "Etano": "Ethane", "Propano": "Propane", "Heptano": "Heptane", "Octano": "Octane", "Dodecano": "Dodecane",
            "Decano": "Decane", "Metanol": "Methanol", "Etanol": "Ethanol", "Polvo": "Road dust"}
PATRON_EN = {CLASE_EN.get(nombre, nombre): patron for patron, nombre in cc.CLASES}

UNIDAD = {"pct": "%", "frac": "mole fraction", "atm": "atm", "mmhg": "mmHg", "bar": "bar", "cms": "cm/s"}
FACTOR = {"pct": None, "frac": 100.0, "atm": None, "mmhg": round(cc.ATM_POR_MMHG, 7), "bar": cc.ATM_POR_BAR, "cms": None}

SCHEMA = {
    "variables": [
        {"id": "o2", "label": "O₂", "long": "Oxygen concentration", "unit": "%", "type": "num", "sigma": 5, "range": [0, 100], "step": 0.5,
         "risk": {"direction": "up", "note": "Higher oxygen concentration makes materials much more flammable.",
                  "source": "NASA Space Apps 2026, Flame in Freefall challenge statement"}},
        {"id": "p", "label": "Pressure", "long": "Ambient pressure", "unit": "atm", "type": "num", "sigma": 0.3, "range": [0, 5], "step": 0.01,
         "display_units": [{"unit": "psi", "factor": 14.6959}, {"unit": "kPa", "factor": 101.325}]},
        {"id": "flow", "label": "Flow", "long": "Forced flow velocity", "unit": "cm/s", "type": "num", "sigma": 10, "range": [0, 100], "step": 1},
        {"id": "g", "label": "Gravity", "long": "Gravity level", "unit": "g", "type": "num", "sigma": 0.05, "range": [0, 1], "step": 0.01},
        {"id": "material", "label": "Material", "long": "Fuel / material", "type": "cat", "penalty": 2},
        {"id": "phase", "label": "Fuel phase", "long": "Fuel phase", "type": "cat", "role": "partition"},
    ],
    "thresholds": {"grade_a": 1.0, "tolerance": 0.25, "closeness_reach": 3},
    # a que variable afecta cada bandera (una bandera sin lista afecta a todo el registro)
    "flags": {
        "unit_unconverted": {"variables": ["flow"], "label": "Unit not converted"},
        "suspect_value": {"variables": ["o2"], "label": "Suspect value"},
        "mapping_uncertain": {"variables": ["p"], "label": "Value taken from a table note"},
    },
}

FLAG_NOTES = {
    "unit_unconverted": "Flow is recorded as a fan setting (voltage / steps), not in cm/s; it is left unconverted and does not enter any distance.",
    "suspect_value": "A companion column holds an implausible value (possible transcription error in the source table).",
    "mapping_uncertain": "Pressure (~1 atm) is taken from a note in the table, not from a per-test column.",
}


def clase_en(texto):
    c = cc.clase_material(texto)
    return CLASE_EN.get(c, c)


def banderas(texto):
    """Traduce los avisos del corpus a codigos del contrato + nota en ingles."""
    codigos, notas = [], []
    for aviso in [a.strip() for a in (texto or "").split(";") if a.strip()]:
        if aviso.startswith("flujo en unidades"):
            codigos.append("unit_unconverted")
        elif aviso.startswith("O2 final sospechoso"):
            codigos.append("suspect_value")
            m = re.search(r"\(([\d.]+) %\)", aviso)
            notas.append(f"Final O2 reads {m.group(1)} %: possible transcription error in the source table." if m else FLAG_NOTES["suspect_value"])
        elif aviso.startswith("presion ~1 atm"):
            codigos.append("mapping_uncertain")
        else:
            raise SystemExit(f"aviso del corpus sin traduccion: {aviso!r}")
    return codigos, notas


def mapeo_de_tabla(sid, cab, spec, es_microg):
    """mapping.tables[]: una entrada por columna de la tabla, con su estado."""
    usados = {}
    for var, clave in (("o2", "o2"), ("p", "p"), ("flow", "flow")):
        if spec.get(clave):
            i = cc.col(cab, spec[clave][0])
            if i is not None:
                u = spec[clave][1]
                usados[i] = {"column": cab[i], "variable": var, "unit": UNIDAD[u],
                             "convert": ({"factor": FACTOR[u], "offset": 0} if FACTOR[u] else None), "status": "approved"}
    if spec.get("o2_final"):
        i = cc.col(cab, spec["o2_final"][0])
        if i is not None:
            usados[i] = {"column": cab[i], "variable": None, "role": "quality_check", "status": "approved",
                         "note": "Used only to flag implausible values; not a scenario variable."}
    if spec.get("flow_voltaje"):
        i = cc.col(cab, spec["flow_voltaje"])
        if i is not None:
            usados[i] = {"column": cab[i], "variable": "flow", "unit": None, "convert": None, "status": "flagged",
                         "note": "Fan setting (voltage / steps), not cm/s: left unconverted."}
    for c in spec.get("fuel", []):
        i = cc.col(cab, c)
        if i is not None:
            usados[i] = {"column": cab[i], "variable": "material", "unit": None, "convert": None, "status": "approved"}
    for clave, rol in (("id", "label"), ("date", "date")):
        if spec.get(clave):
            i = cc.col(cab, spec[clave])
            if i is not None and i not in usados:
                usados[i] = {"column": cab[i], "variable": None, "role": rol, "status": "approved"}
    for c in spec.get("outcome", []):
        i = cc.col(cab, c)
        if i is not None and i not in usados:
            usados[i] = {"column": cab[i], "variable": None, "role": "outcome", "status": "approved"}
    columnas = [usados.get(i, {"column": c, "variable": None, "status": "rejected"}) for i, c in enumerate(cab) if c]
    constantes = {"phase": spec["phase"]}
    if es_microg:
        constantes["g"] = [0, 0]
    if spec.get("fuel_const"):
        constantes["material"] = clase_en(spec["fuel_const"])
    notas = ["Gravity constant (0 g) comes from the PSI investigation metadata: projectType = Microgravity Investigation."] if es_microg else []
    if spec.get("p_nota"):
        constantes["p"] = [spec["p_nota"][0], spec["p_nota"][0]]
        notas.append("Pressure constant (~1 atm) comes from a note in the table; records carry the flag mapping_uncertain.")
    return {"source": sid, "columns": columnas, "constants": constantes, "notes": notas}


def main():
    metas = {}
    for ruta in glob.glob(os.path.join(METAS, "*.json")):
        m = json.load(open(ruta, encoding="utf-8"))
        metas[m["accession"]] = m
    orden = sorted(metas, key=lambda s: int(s.split("-")[1]))

    sources, records, tablas_map, por_estudio, sin_spec = [], [], [], {}, []
    for psi in orden:
        meta = metas[psi]
        es_microg = meta.get("projectType") == "Microgravity Investigation"
        acr = meta.get("investigationAcronym") or meta.get("title", "")[:20]
        for ruta in sorted(glob.glob(os.path.join(TABLAS, psi + "_*.csv"))):
            nombre = os.path.basename(ruta)
            sid = f"s{len(sources) + 1}"
            fuente = {"id": sid, "kind": "table", "name": nombre, "study": psi,
                      "sha256": hashlib.sha256(open(ruta, "rb").read()).hexdigest(),
                      "path": f"data/psi/tables/{nombre}"}
            _, spec = cc.spec_de(ruta)
            if spec is None or psi in cc.SIN_PRUEBAS:
                fuente["used"] = False
                fuente["note"] = "Summary table of data from another publication: its rows are not individual tests, so no records are taken from it."
                sources.append(fuente); sin_spec.append(nombre)
                continue
            fuente["used"] = True
            sources.append(fuente)
            pruebas, cab = cc.pruebas_de(ruta, psi, acr, spec)
            _, filas = cc.leer_csv(ruta)
            tablas_map.append(mapeo_de_tabla(sid, cab, spec, es_microg))
            ix = {v: cc.col(cab, spec[v][0]) for v in ("o2", "p", "flow") if spec.get(v)}
            ix_fuel = [cc.col(cab, c) for c in spec.get("fuel", [])]
            ix_out = [cc.col(cab, c) for c in spec.get("outcome", [])]
            for t in pruebas:
                fila = filas[t["source_row"] - 2]
                values, orig = {}, {}
                for var in ("o2", "p", "flow"):
                    lo, hi = t[f"{var}_min"], t[f"{var}_max"]
                    if lo is None:
                        continue
                    values[var] = [lo, hi]
                    i = ix.get(var)
                    if i is not None and cc.val(fila, i):
                        u = spec[var][1]
                        orig[var] = {"column": cab[i], "text": cc.val(fila, i), "unit": UNIDAD[u], "factor": FACTOR[u]}
                    else:   # constante tomada de una nota de la tabla
                        orig[var] = {"column": None, "text": spec["p_nota"][1] if var == "p" else "", "unit": "atm", "factor": None, "constant": True}
                if es_microg:
                    values["g"] = [0, 0]
                if t["fuel_class"]:
                    values["material"] = clase_en(t["fuel_raw"])
                    cols = [cab[i] for i in ix_fuel if i is not None and cc.val(fila, i)]
                    orig["material"] = {"column": " + ".join(cols) if cols else None, "text": t["fuel_raw"], "unit": None, "factor": None,
                                        **({"constant": True} if not cols else {})}
                values["phase"] = t["phase"]
                codigos, notas = banderas(t["flags"])
                rec = {"id": f"{psi}/{sid}/r{t['source_row']}", "study": psi, "label": t["test_id"] or f"row {t['source_row']}",
                       "values": values, "kind": "campaign" if t["row_type"] == "campana" else "test",
                       "source": {"id": sid, "row": t["source_row"]}, "confidence": "table", "quote": None,
                       "flags": codigos, "orig": orig}
                if notas:
                    rec["flag_notes"] = notas
                if t["date"]:
                    rec["date"] = t["date"]
                outs = {cab[i]: cc.val(fila, i) for i in ix_out if i is not None and cc.val(fila, i)}
                if outs:
                    rec["outcomes"] = outs
                records.append(rec)
                por_estudio.setdefault(psi, []).append(rec)

    studies = []
    for psi in orden:
        m, recs = metas[psi], por_estudio.get(psi, [])
        variables = [v["id"] for v in SCHEMA["variables"] if any(v["id"] in r["values"] for r in recs)]
        pubs = [{"title": (p.get("title") or "").strip(), "doi": (p.get("doi") or "").strip(), "authors": (p.get("authorList") or "").strip()}
                for p in m.get("publications") or []]
        hardware = [h.strip() for h in re.split(r"[;\n]", m.get("experimentHardware") or "") if h.strip()]
        studies.append({
            "id": psi, "short": m.get("investigationAcronym") or psi, "title": m.get("title", ""),
            "summary": {"objective": m.get("objective") or None,
                        "subjects": sorted({r["values"]["material"] for r in recs if "material" in r["values"]}),
                        "conditions": m.get("approach") or None, "variables": variables,
                        "instruments": m.get("experimentHardware") or None},
            "attributes": {"hardware": hardware, "program": m.get("flightProgram") or None, "project_type": m.get("projectType") or None,
                           "sub_area": m.get("subResearchArea") or None, "center": m.get("managingNasaCenter") or None,
                           "start": m.get("investigationStartDate") or None, "end": m.get("investigationEndDate") or None,
                           "license": m.get("licenseIdentifier") or None},
            "related": [x.strip() for x in (m.get("related_glds") or "").split(",") if x.strip()],
            "links": ([{"kind": "doi", "url": "https://doi.org/" + m["doi"], "label": m["doi"]}] if m.get("doi") else []),
            "counts": {"records": len(recs), "tests": sum(1 for r in recs if r["kind"] == "test"),
                       "publications": len(pubs), "documents": m.get("n_pdfs", 0)},
            "publications": pubs,
        })

    # sinonimos: como se agruparon los nombres de material de las tablas
    sinonimos = {}
    for r in records:
        o = r["orig"].get("material")
        if o and r["values"].get("material") in PATRON_EN:
            sinonimos.setdefault(r["values"]["material"], set()).add(o["text"])
    mapping = {
        "tables": tablas_map,
        "synonyms": {"material": {k: sorted(v) for k, v in sorted(sinonimos.items())}},
        "synonym_rules": {"material": [{"value": k, "pattern": v} for k, v in PATRON_EN.items()]},
        "flag_notes": FLAG_NOTES,
        "unused_sources": sin_spec,
        "approved_by": "human", "approved_at": "2026-11-14",
        "note": "Column mapping reviewed by the team (pipeline/legacy/construir_corpus.py, SPECS). Unlisted material names are kept verbatim from the table.",
    }
    lens = json.load(open(os.path.join(RAIZ, "pipeline/lens.json"), encoding="utf-8"))
    pack = {
        "contract": "prometeo.pack/1",
        "meta": {"id": "psi-fire", "title": lens["title"], "created_at": "2026-11-14",
                 "source_note": f"NASA Physical Sciences Informatics (PSI), Combustion Science, {len(studies)} investigations",
                 "license": "CC0-1.0", "repository_url": "https://psi.nasa.gov",
                 "stats": {"studies": len(studies), "records": len(records),
                           "tests": sum(1 for r in records if r["kind"] == "test"),
                           "campaigns": sum(1 for r in records if r["kind"] == "campaign"),
                           "sources": len(sources), "flagged": sum(1 for r in records if r["flags"]),
                           "publications": sum(s["counts"]["publications"] for s in studies),
                           "documents": sum(s["counts"]["documents"] for s in studies)}},
        "schema": SCHEMA, "sources": sources, "studies": studies, "records": records, "claims": [],
    }
    os.makedirs(SALIDA, exist_ok=True)
    for nombre, obj in (("pack.json", pack), ("mapping.json", mapping), ("lens.json", lens)):
        with open(os.path.join(SALIDA, nombre), "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"), sort_keys=False)
    st = pack["meta"]["stats"]
    print(f"pack: {st['studies']} estudios | {st['records']} registros ({st['tests']} pruebas + {st['campaigns']} campanas) | "
          f"{st['sources']} fuentes | {st['flagged']} con bandera | {os.path.getsize(os.path.join(SALIDA, 'pack.json')) // 1024} KB")


for _k, _n in FLAG_NOTES.items():
    SCHEMA["flags"][_k]["note"] = _n


if __name__ == "__main__":
    main()
