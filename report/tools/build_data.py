#!/usr/bin/env python3
"""Build report/data.js from NASA PSI experiment tables and investigation metadata.

Usage:
  python3 -I build_data.py <psi_tablas dir> <psi_json dir> <out data.js>

Standard library only. Every test keeps its source file and row number.
This is the hand-written stand-in for engine stages E2-E4 (mapping, extraction,
normalisation) restricted to five tables, so the report UI can be built against
real data before the engine exists.
"""
import csv, io, json, os, re, sys
from collections import Counter

MMHG_KPA = 0.133322
ATM_KPA = 101.325

FUELS = {"Methanol": "methanol", "Heptane": "n-heptane"}


def read(path):
    raw = open(path, "rb").read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp1252")
    return list(csv.DictReader(io.StringIO(text)))


def num(s):
    m = re.search(r"-?\d+(?:\.\d+)?", s or "")
    return float(m.group()) if m else None


def material(s):
    s = (s or "").lower()
    for k, v in [("pmma", "PMMA"), ("acrylic", "PMMA"), ("plexiglas", "PMMA"), ("sibal", "SIBAL (cotton-fiberglass)"),
                 ("nomex", "Nomex"), ("candle", "Wax candle"), ("silicone", "Silicone"),
                 ("rod", "Rod, material not stated"), ("spherical", "Sphere, material not stated"),
                 ("micron", "Film, material not stated"), ("film", "Film, material not stated")]:
        if k in s:
            return v
    return "Not stated" if not s.strip() else "Other"


def main(tables, jsons, out):
    T = []
    f = lambda n: os.path.join(tables, n)

    # FLEX (PSI-69): pressure, O2, diluents, outcome, burning rate
    src = "PSI-69_Experimental table_FLEX.csv"
    for row, r in enumerate(read(f(src)), start=2):
        p, o = num(r["Ambient pressure; mmHg"]), num(r["O initial ambient composition; mole fraction"])
        if o is None:
            continue
        note = None
        if p is not None and p <= 0:
            note, p = f"Pressure recorded as {r['Ambient pressure; mmHg']} mmHg (invalid value, excluded)", None
        dil = [f"{k} {num(r[c]):.2f}" for k, c in [("N₂", "N initial ambient composition; mole fraction"),
               ("CO₂", "CO initial ambient composition; mole fraction"), ("He", "He initial ambient composition; mole fraction")]
               if num(r[c])]
        T.append(dict(inv="FLEX", psi="PSI-69", test=r["FLEX Identifier"], kind="droplet",
                      fuel=FUELS.get(r["Fuel"], r["Fuel"]), o2=round(o * 100, 1),
                      p=None if p is None else round(p * MMHG_KPA, 1),
                      outcome={"Extinction": "extinction", "Disruption": "disruption", "Completion": "burned out"}.get(r["Test end"].strip()),
                      diluent=", ".join(dil), d0=num(r["Droplet initial diameter; mm"]),
                      rate=num(r["Burning rate; mm"]), burn=num(r["Burn time; s"]),
                      date=r["Test Date"], src=src, row=row, grade="A", note=note))

    # CFI (PSI-39)
    src = "PSI-39_Experimental table_CFI.csv"
    for row, r in enumerate(read(f(src)), start=2):
        p, o = num(r["Pressure"]), num(r["Oxygen"])
        if p is None or o is None:
            continue
        he = num(r["Helium"])
        fuel = r["Fuel "].strip().replace("C12H26", "n-dodecane").replace("iso-dodecane", "iso-dodecane")
        T.append(dict(inv="CFI", psi="PSI-39", test=r["Flex Number"], kind="droplet", fuel=fuel,
                      o2=round(o * 100, 1), p=round(p * ATM_KPA, 1), outcome=None,
                      diluent=f"N₂ {num(r['Nitrogen']):.2f}" + (f", He {he:.2f}" if he else ""),
                      fiber=r["Fiber"].strip() or None, date=r["Test Date"], src=src, row=row, grade="A"))

    # BASS-II (PSI-25): no pressure column
    src = "PSI-25_Experimental table_BASS-II.csv"
    for row, r in enumerate(read(f(src)), start=2):
        o = num(r["Calibrated  initial O2 % by vol "])
        if o is None:
            continue
        T.append(dict(inv="BASS-II", psi="PSI-25", test=r["Test #"], kind="solid",
                      fuel=material(r["Fuel Sample Material"]), sample=r["Fuel Sample Material"].strip(),
                      o2=round(o, 1), p=None, outcome=None, o2_final=num(r["Calibrated final O2 % by vol"]),
                      pi=r["PI"], date=r["Date"], src=src, row=row, grade="A"))

    # SAFFIRE-I / II: approximate O2, flow, no pressure column
    for src, inv, psi in [("PSI-98_Experimental table_SAFFIRE-1.csv", "SAFFIRE-I", "PSI-98"),
                          ("PSI-99_Experimental table_SAFFIRE-2.csv", "SAFFIRE-II", "PSI-99")]:
        for row, r in enumerate(read(f(src)), start=2):
            k = next((c for c in r if c and c.startswith("Percent O2")), None)
            o = num(r.get(k, "")) if k else None
            if o is None:
                continue
            fl = next((c for c in r if c and c.startswith("Air Flow")), None)
            dr = next((c for c in r if c and c.startswith("Flow Direction")), None)
            th = next((c for c in r if c and ("Thickness" in c or "Samle Thickness" in c)), None)
            T.append(dict(inv=inv, psi=psi, test=r[next(iter(r))].strip(), kind="solid",
                          fuel=material(r["Material"]), sample=r["Material"].strip() or None,
                          o2=round(o, 1), o2_raw=r[k].strip(), p=None, outcome=None,
                          flow=num(r.get(fl, "")) if fl else None, direction=(r.get(dr) or "").strip() or None,
                          thickness=(r.get(th) or "").strip() or None, src=src, row=row, grade="B"))

    # Investigation metadata from PSI JSON
    S = []
    for psi in ["PSI-69", "PSI-39", "PSI-25", "PSI-98", "PSI-99"]:
        d = json.load(open(os.path.join(jsons, psi + ".json"), encoding="utf-8"))
        people = []
        for c in d.get("contacts") or []:
            roles = " ".join(x.get("annotationValue", "") for x in (c.get("roles") or []) if isinstance(x, dict))
            name = f"{c.get('firstName', '')} {c.get('lastName', '')}".strip()
            if "Principal Investigator" in roles:
                people.insert(0, name)
            elif "Investigator" in roles and len(people) < 4:
                people.append(name)
        hw = d.get("experimentHardware") or ""
        S.append(dict(psi=psi, acronym=d.get("investigationAcronym"), title=d.get("title"), doi=d.get("doi"),
                      start=d.get("investigationStartDate"), end=d.get("investigationEndDate"),
                      hardware=hw, platform="Cygnus" if "Cygnus" in hw else "ISS",
                      people=people[:4], publications=len(d.get("publications") or []),
                      license=d.get("licenseName"),
                      tests=sum(1 for t in T if t["psi"] == psi)))

    with open(out, "w", encoding="utf-8") as fh:
        fh.write("// Generated by tools/build_data.py from NASA PSI experiment tables and metadata (CC0).\n")
        fh.write("window.TESTS = "); json.dump(T, fh, ensure_ascii=False, separators=(",", ":")); fh.write(";\n")
        fh.write("window.SOURCES = "); json.dump(S, fh, ensure_ascii=False, separators=(",", ":")); fh.write(";\n")
    print(len(T), Counter(t["inv"] for t in T))
    for s in S:
        print(s["psi"], s["acronym"], s["platform"], s["people"], s["publications"], s["tests"])


if __name__ == "__main__":
    main(*sys.argv[1:4])
