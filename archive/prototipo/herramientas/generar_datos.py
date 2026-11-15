#!/usr/bin/env python3
"""Genera prototipo/datos.js a partir de tablas experimentales reales de PSI.

Uso: python3 -I generar_datos.py <carpeta_psi_tablas> <salida datos.js>
Solo libreria estandar. Cada punto conserva archivo y fila de origen.
"""
import csv, io, json, re, sys, os

MMHG_KPA = 0.133322
ATM_KPA = 101.325


def leer(ruta):
    b = open(ruta, "rb").read()
    try:
        t = b.decode("utf-8-sig")
    except UnicodeDecodeError:
        t = b.decode("cp1252")
    return list(csv.DictReader(io.StringIO(t)))


def num(s):
    m = re.search(r"-?\d+(?:\.\d+)?", s or "")
    return float(m.group()) if m else None


def material_bass(s):
    s = s.lower()
    for k, v in [("pmma", "PMMA"), ("acrylic", "PMMA"), ("sibal", "SIBAL"), ("cotton", "Algodón"),
                 ("delrin", "Delrin"), ("polyethylene", "Polietileno"), ("ultem", "Ultem"),
                 ("nomex", "Nomex"), ("kapton", "Kapton"), ("candle", "Vela"), ("silicone", "Silicona"),
                 ("paper", "Papel"), ("kimwipe", "Papel"), ("fabric", "Tela"), ("fiberglass", "Fibra de vidrio"),
                 ("plexiglas", "PMMA"), ("rod", "Barra (sin material)"), ("spherical", "Esfera (sin material)"),
                 ("micron", "Película (sin material)"), ("film", "Película (sin material)")]:
        if k in s:
            return v
    return "Otro"


def main(carpeta, salida):
    puntos = []

    def f(nombre):
        return os.path.join(carpeta, nombre)

    # FLEX (PSI-69): presion y O2 registrados, desenlace por prueba
    arch = "PSI-69_Experimental table_FLEX.csv"
    for i, r in enumerate(leer(f(arch)), start=2):
        p, o = num(r["Ambient pressure; mmHg"]), num(r["O initial ambient composition; mole fraction"])
        if p is None or o is None:
            continue
        nota = None
        if p <= 0:                                   # dato invalido en la tabla original
            nota, p = f"presión registrada como {r['Ambient pressure; mmHg']} mmHg (dato inválido)", None
        fin = {"Extinction": "extincion", "Disruption": "ruptura", "Completion": "consumo_total"}.get(r["Test end"].strip(), "otro")
        puntos.append(dict(inv="FLEX", psi="PSI-69", prueba=r["FLEX Identifier"], combustible={"Methanol": "Metanol", "Heptane": "Heptano"}.get(r["Fuel"], r["Fuel"]), original=r["Fuel"],
                           tipo="gota", o2=round(o * 100, 1), p_kpa=None if p is None else round(p * MMHG_KPA, 1),
                           fin=fin, fuente=arch, fila=i, grado="A", nota=nota))

    # CFI (PSI-39)
    arch = "PSI-39_Experimental table_CFI.csv"
    for i, r in enumerate(leer(f(arch)), start=2):
        p, o = num(r["Pressure"]), num(r["Oxygen"])
        if p is None or o is None:
            continue
        puntos.append(dict(inv="CFI", psi="PSI-39", prueba=r["Flex Number"], combustible=r["Fuel "].strip().replace("C12H26", "n-dodecano").replace("iso-dodecane", "isododecano"),
                           tipo="gota", o2=round(o * 100, 1), p_kpa=round(p * ATM_KPA, 1),
                           fin=None, fuente=arch, fila=i, grado="A"))

    # BASS-II (PSI-25): O2 registrado, presion NO registrada en la tabla
    arch = "PSI-25_Experimental table_BASS-II.csv"
    for i, r in enumerate(leer(f(arch)), start=2):
        o = num(r["Calibrated  initial O2 % by vol "])
        if o is None:
            continue
        puntos.append(dict(inv="BASS-II", psi="PSI-25", prueba=r["Test #"], combustible=material_bass(r["Fuel Sample Material"]), original=r["Fuel Sample Material"].strip(),
                           tipo="solido", o2=round(o, 1), p_kpa=None, fin=None, fuente=arch, fila=i, grado="A"))

    # SAFFIRE-I y II: O2 aproximado, presion no registrada
    for arch, inv, psi in [("PSI-98_Experimental table_SAFFIRE-1.csv", "SAFFIRE-I", "PSI-98"),
                           ("PSI-99_Experimental table_SAFFIRE-2.csv", "SAFFIRE-II", "PSI-99")]:
        for i, r in enumerate(leer(f(arch)), start=2):
            k = next((c for c in r if c and c.startswith("Percent O2")), None)
            o = num(r.get(k, "")) if k else None
            if o is None:
                continue
            puntos.append(dict(inv=inv, psi=psi, prueba=r[next(iter(r))].strip(), combustible=material_bass(r["Material"]), original=r["Material"].strip(),
                               tipo="solido", o2=round(o, 1), p_kpa=None, fin=None, fuente=arch, fila=i, grado="B"))

    with open(salida, "w", encoding="utf-8") as fh:
        fh.write("// Generado por herramientas/generar_datos.py desde tablas experimentales de PSI (CC0).\n")
        fh.write("window.PUNTOS = ")
        json.dump(puntos, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write(";\n")
    from collections import Counter
    print(len(puntos), Counter(p["inv"] for p in puntos))
    print("con presion:", sum(p["p_kpa"] is not None for p in puntos))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
