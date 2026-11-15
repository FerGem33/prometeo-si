#!/usr/bin/env python3
"""
construir_corpus.py - arma el CONTRATO DE DATOS del proyecto a partir de lo que ya bajaste.

Entrada  : datos_psi/json/*.json y datos_psi/tablas/PSI-xx/*.csv   (psi_explorar.py)
Salida   : corpus/corpus.json   fichas + pruebas armonizadas + cobertura (lo que consume el dashboard)
           corpus/tests.csv     una fila por prueba, esquema comun (para modelado / Excel)
           corpus/resumen.txt   cifras para el demo y para la descripcion del proyecto

Esquema comun de una prueba (tests):
  psi_id, acronym, phase (gas|liquid|solid|aerosol), row_type (prueba|campana), test_id, date, fuel_raw, fuel_class,
  o2_min, o2_max (% vol), p_min, p_max (atm), flow_min, flow_max (cm/s),
  outcome, extra, source_file, source_row, flags
  - Las tablas de "campana" traen rangos ("21; 26.5; 40"): se guardan como min/max.
  - Todo valor que la tabla no trae queda VACIO. Nunca se inventa.
  - flags: avisos de calidad (valor sospechoso, flujo en voltaje, presion tomada de una nota...)

Ranking de ejemplo (la logica que implementa el dashboard):
  python construir_corpus.py --escenario o2=30 p_psi=10.2 flow=5 material=PMMA

Solo libreria estandar. Uso:
  python construir_corpus.py                       # lee ./datos_psi, escribe ./corpus
  python construir_corpus.py --datos datos_psi --salida corpus
"""
import argparse, csv, glob, io, json, math, os, re, sys

ATM_POR_MMHG, ATM_POR_BAR, ATM_POR_PSI = 1 / 760.0, 0.986923, 1 / 14.6959

# ---------------------------------------------------------------- utilidades
NUM = re.compile(r"\d+(?:\.\d+)?")


def leer_csv(ruta):
    raw = open(ruta, "rb").read()
    for enc in ("utf-8-sig", "cp1252"):
        try:
            texto = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        texto = raw.decode("latin-1")
    filas = list(csv.reader(io.StringIO(texto)))
    return [c.strip() for c in filas[0]], [[c.strip() for c in f] for f in filas[1:]]


def numeros(texto):
    """Todos los numeros de un texto, sin letras tipo O2/N2 ni signos de rango."""
    if texto is None:
        return []
    t = re.sub(r"[A-Za-z]+\d+", " ", str(texto))          # quita O2, N2, CH4...
    t = re.sub(r"(?<=\d)\s*[-–]\s*(?=\d)", " ", t)   # 21.5 - 21.7 -> dos numeros
    return [float(x) for x in NUM.findall(t)]


def rango(texto, a_unidad=1.0, tope=None):
    n = numeros(texto)
    if tope is not None:
        n = [x for x in n if x <= tope]
    return (round(min(n) * a_unidad, 4), round(max(n) * a_unidad, 4)) if n else (None, None)


def col(cabeceras, prefijo):
    p = prefijo.lower()
    for i, c in enumerate(cabeceras):
        if c.lower().startswith(p):
            return i
    return None


def val(fila, i):
    return fila[i] if i is not None and i < len(fila) else ""


CLASES = [
    (r"pmma", "PMMA"), (r"sibal", "SIBAL"), (r"nomex", "Nomex"), (r"kapton", "Kapton"),
    (r"teflon|ptfe", "Teflon"), (r"silicone", "Silicona"), (r"cotton", "Algodon"), (r"wax|candle", "Cera/vela"),
    (r"ethylene|c2h4", "Etileno"), (r"methane|\bch4|ch\d", "Metano"), (r"ethane|c2h6", "Etano"),
    (r"propane|c3h8", "Propano"), (r"heptane", "Heptano"), (r"octane", "Octano"), (r"dodecane|c12h26", "Dodecano"),
    (r"decane", "Decano"), (r"methanol", "Metanol"), (r"ethanol", "Etanol"), (r"road dust|\bard\b", "Polvo"),
]


def clase_material(texto):
    t = (texto or "").lower()
    for patron, nombre in CLASES:
        if re.search(patron, t):
            return nombre
    return (texto or "").strip()[:40] or None


# ---------------------------------------------------------------- especificacion por tabla
# o2/p/flow = (prefijo de columna, unidad)   unidades: pct | frac  /  atm | mmhg | bar  /  cms
SPECS = [
    ("PSI-10", "Normal", dict(phase="gas", id="Test", fuel=["Fuel"], o2=("XO2 (init)", "frac"), p=("pinit (atm)", "atm"), date="Day", outcome=[])),
    ("PSI-10", "Inverse", dict(phase="gas", id="Test", fuel_const="Etileno", o2=("XO2", "frac"), p=("pinit (atm)", "atm"), date="Day", outcome=[])),
    ("PSI-20", "", dict(phase="gas", id="Date", fuel=["Fuel Bottle"], o2=("Oxygen Conc", "pct"), outcome=["Flames Ignited"])),
    ("PSI-21", "", dict(phase="gas", id="Test Day", fuel=["Fuel Bottle"], outcome=["Flames ignited"])),
    ("PSI-22", "", dict(phase="gas", id="Test Day", fuel=["Fuel Bottle"], outcome=["Flames Ignited"])),
    ("PSI-23", "", dict(phase="gas", id="Test Day", fuel=["Fuel Bottle"], o2=("Atmosphere", "pct"), p_nota=(1.0, "presion ~1 atm segun nota de la tabla"), outcome=["Flames Ignited"])),
    ("PSI-25", "", dict(phase="solid", id="Test #", fuel=["Fuel Sample Material"], o2=("Calibrated  initial O2", "pct"), o2_final=("Calibrated final O2", "pct"), flow_voltaje="Fan display", date="Date", outcome=[])),
    ("PSI-26", "", dict(phase="solid", id="Test #", fuel=["Fuel Sample Material"], date="Date", outcome=[])),
    ("PSI-39", "", dict(phase="liquid", id="Flex Number", fuel=["Fuel"], o2=("Oxygen", "frac"), p=("Pressure", "atm"), date="Test Date", outcome=["Fiber"])),
    ("PSI-47", "", dict(phase="aerosol", id="Session Name", fuel=["Sample Material"], date="Actual Day", outcome=[])),
    ("PSI-68", "", dict(phase="liquid", id="Sample", fuel=["Sample (Fuel Type)"], o2=("Oxygen Mole Fraction", "frac"), p=("Ambient Pressure", "atm"), flow=("Flow Velocity", "cms"), outcome=[])),
    ("PSI-69", "", dict(phase="liquid", id="FLEX Test #", fuel=["Fuel"], o2=("O initial ambient", "frac"), p=("Ambient pressure", "mmhg"), date="Test Date", outcome=["Test end", "Burn time"])),
    ("PSI-98", "", dict(phase="solid", id="Sample Number", fuel=["Material"], o2=("Percent O2", "pct"), flow=("Air Flow", "cms"), outcome=["Burn Time", "Flow Direction"])),
    ("PSI-99", "", dict(phase="solid", id="Sample Number", fuel=["Material"], o2=("Percent O2", "pct"), flow=("Air Flow", "cms"), outcome=["Burn Time", "Flow Direction"])),
    ("PSI-100", "", dict(phase="solid", id="Sample Number", fuel=["Material"], flow=("Air Flow", "cms"), outcome=["Direction"])),
    ("PSI-101", "", dict(phase="aerosol", id="SAME Test #", fuel=["Sample Type"], flow=("Inlet velocity", "cms"), date="Date", outcome=["Description"])),
    ("PSI-102", "", dict(phase="aerosol", id="Sample #", fuel=["Sample Material"], flow=("Air Flow", "cms"), outcome=[])),
    ("PSI-106", "", dict(phase="gas", id="Test Date", fuel=["Fuel Type"], outcome=[])),
    ("PSI-107", "", dict(phase="gas", id="GMT ignition", fuel=["Fuel"], flow=("Air Rate", "cms"), date="GMT date", outcome=["GMT  Flame Off"])),
    ("PSI-159", "Normal", dict(phase="gas", id="Test", fuel=["Fuel"], o2=("XO2 before test", "frac"), p=("approx p", "bar"), date="Day", outcome=["Hot ignition", "burn time"])),
    ("PSI-159", "Inverse", dict(phase="gas", id="Test", fuel=["Fuel"], o2=("XO2", "frac"), p=("approx p", "bar"), date="Day", outcome=["Hot ignition", "burn time"])),
]
CAMPANA = {"PSI-20", "PSI-21", "PSI-22", "PSI-23", "PSI-68"}   # filas = campanas con rangos, no pruebas individuales
SOLIDOS = {"PMMA", "SIBAL", "Nomex", "Kapton", "Teflon", "Silicona", "Algodon", "Cera/vela"}
SIN_PRUEBAS = {"PSI-142"}   # tabla resumen de datos de otra publicacion: no son pruebas


def spec_de(archivo):
    base = os.path.basename(archivo)
    for psi, sub, spec in SPECS:
        if base.startswith(psi + "_") and sub in base:
            return psi, spec
    return None, None


def convertir(valor, unidad, hacia):
    return round(valor * hacia, 4)


def pruebas_de(ruta, psi_id, acronimo, spec):
    cab, filas = leer_csv(ruta)
    ix = {k: col(cab, spec[k]) for k in ("id", "date") if spec.get(k)}
    ix_fuel = [col(cab, c) for c in spec.get("fuel", [])]
    ix_out = [col(cab, c) for c in spec.get("outcome", [])]
    def par(k):
        return (col(cab, spec[k][0]), spec[k][1]) if spec.get(k) else (None, None)
    (io2, uo2), (ip, up), (ifl, ufl) = par("o2"), par("p"), par("flow")
    (io2f, _) = par("o2_final")
    iflv = col(cab, spec["flow_voltaje"]) if spec.get("flow_voltaje") else None
    out = []
    for n, f in enumerate(filas, start=2):
        material = " ".join(val(f, i) for i in ix_fuel).strip() or spec.get("fuel_const", "")
        pid = val(f, ix.get("id"))
        if not (material or pid):
            continue
        if material.lower().startswith("pre-test") or material.lower().startswith("n/a"):
            continue
        flags = []
        o2 = rango(val(f, io2), 100.0 if uo2 == "frac" else 1.0, tope=(1.0 if uo2 == "frac" else 100.0)) if io2 is not None else (None, None)
        if ip is not None:
            mult = {"atm": 1.0, "mmhg": ATM_POR_MMHG, "bar": ATM_POR_BAR}[up]
            tope = None
            p = rango(val(f, ip), mult, tope)
        else:
            p = (None, None)
        if p == (None, None) and spec.get("p_nota"):
            p = (spec["p_nota"][0], spec["p_nota"][0]); flags.append(spec["p_nota"][1])
        fl = rango(val(f, ifl)) if ifl is not None else (None, None)
        if iflv is not None and fl == (None, None):
            flags.append("flujo en unidades del ventilador (voltaje/pasos): sin conversion a cm/s")
        if io2f is not None:
            o2f = rango(val(f, io2f))
            if o2f[0] is not None and o2[0] is not None and (o2f[1] < 5 or o2f[1] > 35 or abs(o2f[1] - o2[1]) > 10):
                flags.append(f"O2 final sospechoso ({o2f[1]} %): posible error de captura")
        out.append(dict(
            psi_id=psi_id, acronym=acronimo, phase=spec["phase"], row_type=("campana" if psi_id in CAMPANA else "prueba"), test_id=pid, date=val(f, ix.get("date")),
            fuel_raw=material, fuel_class=clase_material(material),
            o2_min=o2[0], o2_max=o2[1], p_min=p[0], p_max=p[1], flow_min=fl[0], flow_max=fl[1],
            outcome=" | ".join(x for x in (val(f, i) for i in ix_out) if x),
            source_file=os.path.basename(ruta), source_row=n, flags="; ".join(flags)))
    return out, cab


# ---------------------------------------------------------------- fichas
def ficha(meta, pruebas, cols_tabla, n_pdfs):
    pubs = [{"title": p.get("title", ""), "doi": p.get("doi", "")} for p in meta.get("publications") or []]
    def lim(k):
        v = [p[k] for p in pruebas if p[k] is not None]
        return [min(v), max(v)] if v else None
    return dict(
        psi_id=meta["accession"], acronym=meta.get("investigationAcronym") or "", title=meta.get("title", ""),
        sub_area=meta.get("subResearchArea", ""), project_type=meta.get("projectType", ""),
        program=meta.get("flightProgram", ""), hardware=meta.get("experimentHardware", ""),
        start=meta.get("investigationStartDate", ""), end=meta.get("investigationEndDate", ""),
        doi=meta.get("doi", ""), related=[x for x in (meta.get("related_glds") or "").split(",") if x],
        objective=meta.get("objective", ""), hypothesis=meta.get("hypothesis", ""), approach=meta.get("approach", ""),
        impacts=meta.get("researchImpacts", ""),
        total_gb=round(float(meta.get("totalFileSize") or 0) / 1e9, 1), n_publications=len(pubs), publications=pubs,
        n_pdfs=n_pdfs, n_tests=len(pruebas), has_table=bool(cols_tabla), table_columns=cols_tabla,
        has_o2=any(p["o2_min"] is not None for p in pruebas), has_pressure=any(p["p_min"] is not None for p in pruebas),
        has_flow=any(p["flow_min"] is not None for p in pruebas),
        o2_range=lim("o2_min") and [lim("o2_min")[0], lim("o2_max")[1]], p_range=lim("p_min") and [lim("p_min")[0], lim("p_max")[1]],
        flow_range=lim("flow_min") and [lim("flow_min")[0], lim("flow_max")[1]],
        materials=sorted({p["fuel_class"] for p in pruebas if p["fuel_class"]}),
        phase=sorted({p["phase"] for p in pruebas}))


# ---------------------------------------------------------------- ranking y notas
SIGMA = {"o2": 5.0, "p": 0.3, "flow": 10.0}      # escala de cada variable (propuesta, configurable)
PENALIZACION_MATERIAL = 2.0
UMBRAL_A = 1.0
TOLERANCIA = 0.25     # fraccion de sigma que se perdona al decir "fuera de lo probado"


def _dist_intervalo(x, lo, hi):
    return 0.0 if lo <= x <= hi else (lo - x if x < lo else x - hi)


def rank(escenario, corpus):
    """escenario: dict con o2 (%), p (atm), flow (cm/s), material (clase). Devuelve lista ordenada."""
    ejes = {k: escenario[k] for k in ("o2", "p", "flow") if escenario.get(k) is not None}
    resultado = []
    por_inv = {}
    for t in corpus["tests"]:
        por_inv.setdefault(t["psi_id"], []).append(t)
    for f in corpus["investigations"]:
        ts = por_inv.get(f["psi_id"], [])
        usables = {e: [t for t in ts if t[f"{e}_min"] is not None] for e in ejes}
        ejes_ok = [e for e in ejes if usables[e]]
        faltan = [e for e in ejes if not usables[e]]
        mat = escenario.get("material")
        mat_probado = (mat in f["materials"]) if mat else None
        if mat in SOLIDOS and mat_probado is False and not (set(f["phase"]) & {"solid", "aerosol"}):
            resultado.append(dict(psi_id=f["psi_id"], acronym=f["acronym"] or f["title"][:30], grade="D", distance=None,
                                  why=[(f"estudia combustibles {'/'.join(f['phase'])}, no solidos como {mat}" if f["phase"] else "no tiene tabla de pruebas comparable")],
                                  missing_axes=faltan, n_tests=len(ts)))
            continue
        if not ts or not ejes_ok:
            resultado.append(dict(psi_id=f["psi_id"], acronym=f["acronym"] or f["title"][:30], grade="D", distance=None,
                                  why=["no hay variables comparables con tu escenario en esta investigacion"] + ([f"material {mat} no probado"] if mat and mat_probado is False else []),
                                  missing_axes=faltan, n_tests=len(ts)))
            continue
        mejor, mejor_t = None, None
        for t in ts:
            s, usados = 0.0, 0
            for e in ejes_ok:
                if t[f"{e}_min"] is None:
                    continue
                d = _dist_intervalo(ejes[e], t[f"{e}_min"], t[f"{e}_max"]) / SIGMA[e]
                s += d * d; usados += 1
            if usados == 0:
                continue
            if mat and t["fuel_class"] and t["fuel_class"] != mat:
                s += PENALIZACION_MATERIAL ** 2
            d_t = math.sqrt(s)
            if mejor is None or d_t < mejor:
                mejor, mejor_t = d_t, t
        fuera = []
        for e in ejes_ok:
            lo = min(t[f"{e}_min"] for t in usables[e]); hi = max(t[f"{e}_max"] for t in usables[e])
            if _dist_intervalo(ejes[e], lo, hi) > TOLERANCIA * SIGMA[e]:
                nom = {"o2": "O2 (%)", "p": "presion (atm)", "flow": "flujo (cm/s)"}[e]
                fuera.append(f"{nom}: tu valor {ejes[e]} esta fuera de lo probado [{lo:g}, {hi:g}]")
        if mat and mat_probado is False:
            fuera.append(f"material {mat} no aparece en esta investigacion")
        nombres = {"o2": "O2", "p": "presion", "flow": "flujo"}
        if mejor is not None and mejor <= UMBRAL_A and not fuera and not faltan:
            g = "A"
        elif not fuera:
            g = "B"
        else:
            g = "C"
        resultado.append(dict(psi_id=f["psi_id"], acronym=f["acronym"] or f["title"][:30], grade=g, distance=round(mejor, 2) if mejor is not None else None,
                              why=(fuera or ["dentro de lo probado"]) + ([f"no registra {', '.join(nombres[e] for e in faltan)}: no se puede confirmar"] if faltan else []), nearest_test=(mejor_t or {}).get("test_id"),
                              source=(mejor_t or {}).get("source_file"), source_row=(mejor_t or {}).get("source_row"),
                              missing_axes=faltan, n_tests=len(ts)))
    orden = {"A": 0, "B": 1, "C": 2, "D": 3}
    resultado.sort(key=lambda r: (orden[r["grade"]], len(r["missing_axes"]), r["distance"] if r["distance"] is not None else 9e9))
    return resultado


# ---------------------------------------------------------------- cobertura
O2_BINS = [(0, 15), (15, 19), (19, 23), (23, 30), (30, 40), (40, 101)]
P_BINS = [(0, 0.5), (0.5, 0.8), (0.8, 1.2), (1.2, 2.0), (2.0, 99)]


def cobertura(pruebas):
    celdas = {}
    for t in pruebas:
        if t["o2_min"] is None or t["p_min"] is None:
            continue
        for i, (a, b) in enumerate(O2_BINS):
            if t["o2_max"] >= a and t["o2_min"] < b:
                for j, (c, d) in enumerate(P_BINS):
                    if t["p_max"] >= c and t["p_min"] < d:
                        k = f"{i},{j}"
                        celdas.setdefault(k, {"n": 0, "inv": set()})
                        celdas[k]["n"] += 1; celdas[k]["inv"].add(t["psi_id"])
    return {"o2_bins": O2_BINS, "p_bins_atm": P_BINS,
            "cells": [{"o2_bin": int(k.split(",")[0]), "p_bin": int(k.split(",")[1]), "n_tests": v["n"], "investigations": sorted(v["inv"])} for k, v in sorted(celdas.items())]}


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--datos", default="datos_psi")
    ap.add_argument("--salida", default="corpus")
    ap.add_argument("--escenario", nargs="+", help="o2=30 p_psi=10.2 flow=5 material=PMMA")
    a = ap.parse_args()

    jsons = {}
    for p in glob.glob(os.path.join(a.datos, "json", "*.json")):
        m = json.load(open(p, encoding="utf-8"))
        if m.get("researchArea") == "Combustion Science" or m.get("accession") in {"PSI-179"}:
            jsons[m["accession"]] = m
    pdfs = {}
    for p in glob.glob(os.path.join(a.datos, "json", "*.json")):
        m = json.load(open(p, encoding="utf-8"))
        pdfs[m["accession"]] = sum(1 for g in ("added", "modified") for x in m.get(g) or [] if (x.get("file_name") or "").lower().endswith(".pdf"))

    todas, fichas, aviso = [], [], []
    for psi_id in sorted(jsons, key=lambda s: int(s.split("-")[1])):
        meta, pruebas, cols = jsons[psi_id], [], []
        for ruta in sorted(glob.glob(os.path.join(a.datos, "tablas", psi_id, "*.csv"))):
            if psi_id in SIN_PRUEBAS:
                cols = leer_csv(ruta)[0]; continue
            _, spec = spec_de(ruta)
            if spec is None:
                aviso.append(f"sin especificacion para {os.path.basename(ruta)}: se omite"); continue
            ps, cab = pruebas_de(ruta, psi_id, meta.get("investigationAcronym") or meta.get("title", "")[:20], spec)
            pruebas += ps; cols = cols or cab
        todas += pruebas
        fichas.append(ficha(meta, pruebas, cols, pdfs.get(psi_id, 0)))

    corpus = dict(investigations=fichas, tests=todas, coverage=cobertura(todas),
                  config=dict(sigma=SIGMA, penalizacion_material=PENALIZACION_MATERIAL, umbral_A=UMBRAL_A, tolerancia=TOLERANCIA))
    os.makedirs(a.salida, exist_ok=True)
    json.dump(corpus, open(os.path.join(a.salida, "corpus.json"), "w", encoding="utf-8"), ensure_ascii=False)
    campos = ["psi_id", "acronym", "phase", "row_type", "test_id", "date", "fuel_raw", "fuel_class", "o2_min", "o2_max", "p_min", "p_max",
              "flow_min", "flow_max", "outcome", "source_file", "source_row", "flags"]
    with open(os.path.join(a.salida, "tests.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=campos); w.writeheader(); w.writerows(todas)

    # resumen para el demo
    n = len(todas)
    con = lambda k: sum(1 for t in todas if t[k] is not None)
    indiv = [t for t in todas if t["row_type"] == "prueba"]
    o2_30 = [t for t in indiv if t["o2_max"] is not None and t["o2_max"] >= 30]
    lunar = [t for t in o2_30 if t["p_min"] is not None and t["p_min"] <= 0.75]
    por_fase = []
    for ph in ("solid", "liquid", "gas", "aerosol"):
        ts = [t for t in indiv if t["phase"] == ph]
        o = [t["o2_max"] for t in ts if t["o2_max"] is not None]
        p = [t for t in ts if t["p_min"] is not None]
        por_fase.append(f"  fase {ph}: {len(ts)} pruebas | con O2 registrado: {len(o)} (maximo {max(o) if o else '-'} %) | con presion registrada: {len(p)}")
    lineas = [
        f"Investigaciones en el corpus: {len(fichas)} (con tabla de pruebas: {sum(1 for f in fichas if f['n_tests'])})",
        f"Pruebas armonizadas: {n} | con O2: {con('o2_min')} | con presion: {con('p_min')} | con flujo (cm/s): {con('flow_min')}",
        f"Publicaciones listadas: {sum(f['n_publications'] for f in fichas)} | PDFs alojados en PSI: {sum(f['n_pdfs'] for f in fichas)} | datos: {sum(f['total_gb'] for f in fichas)/1000:.1f} TB",
        f"Filas de campana (rangos, no pruebas individuales): {n - len(indiv)} | pruebas individuales: {len(indiv)}",
        f"Pruebas individuales con O2 >= 30 %: {len(o2_30)} en {sorted({t['psi_id'] for t in o2_30})}",
        f"... y ademas presion <= 0.75 atm (~11 psi o menos, como la base lunar del reto): {len(lunar)} en {sorted({t['psi_id'] for t in lunar})}",
        "Por fase (solo pruebas individuales):", *por_fase,
        f"Tests con aviso de calidad: {sum(1 for t in todas if t['flags'])}",
    ] + [f"AVISO: {x}" for x in aviso]
    open(os.path.join(a.salida, "resumen.txt"), "w", encoding="utf-8").write("\n".join(lineas))
    print("\n".join(lineas))

    if a.escenario:
        kv = dict(x.split("=", 1) for x in a.escenario)
        esc = dict(o2=float(kv["o2"]) if "o2" in kv else None,
                   p=float(kv["p_psi"]) * ATM_POR_PSI if "p_psi" in kv else (float(kv["p_atm"]) if "p_atm" in kv else None),
                   flow=float(kv["flow"]) if "flow" in kv else None, material=kv.get("material"))
        print(f"\nEscenario: {esc}")
        for r in rank(esc, corpus):
            print(f"  [{r['grade']}] {r['psi_id']:8s} {str(r['acronym'])[:26]:26s} d={r['distance']}  {r['why'][0] if r['why'] else ''}")


if __name__ == "__main__":
    main()