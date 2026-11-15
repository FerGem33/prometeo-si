#!/usr/bin/env python3
"""
nasa_fuego_todo.py - automatiza la recoleccion de datos para Flame in Freefall.

  A) PSI: para cada investigacion, baja el JSON, busca "experimentalTable",
     descarga cada CSV y deja un indice (psi_indice.csv).
  B) NTRS: busca papers y baja los PDF.

Solo libreria estandar. Ejemplos:

  # todo con los valores por defecto (PSI-25, PSI-69 + 50 papers, baja 10 PDF)
  python nasa_fuego_todo.py

  # tus propias investigaciones y busqueda
  python nasa_fuego_todo.py --psi PSI-25 PSI-69 PSI-117 --ntrs "microgravity flammability" --n 50 --pdfs 10

  # explorar un rango de IDs para descubrir cuales tienen tabla de experimentos
  python nasa_fuego_todo.py --rango 1 130 --solo-psi

  # solo NTRS
  python nasa_fuego_todo.py --solo-ntrs

Salida (carpeta ./datos_fuego):
  psi_json/<ID>.json        metadatos crudos
  psi_tablas/<archivo>.csv  tablas de experimentos
  psi_indice.csv            ID, titulo, archivo, bytes, ok
  ntrs_resultados.csv       id, anio, titulo, url del pdf
  ntrs_pdfs/<id>.pdf        PDFs descargados
"""
import argparse, csv, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

PSI = "https://psi.nasa.gov/geode-py/ws"
NTRS = "https://ntrs.nasa.gov"
UA = {"User-Agent": "Mozilla/5.0 (equipo-space-apps)"}


def get(url, intentos=3):
    ultimo = None
    for i in range(intentos):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=180) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (400, 401, 403, 404):      # no tiene caso reintentar
                raise
            ultimo = e
        except Exception as e:
            ultimo = e
        time.sleep(2 * (i + 1))
    raise ultimo


def limpio(nombre):
    return re.sub(r'[\\/:*?"<>|]', "_", nombre)


# ---------------------------------------------------------------- PSI
def psi_meta(psi_id, carpeta):
    datos = get(f"{PSI}/repo/investigations/{psi_id}")
    os.makedirs(os.path.join(carpeta, "psi_json"), exist_ok=True)
    with open(os.path.join(carpeta, "psi_json", f"{psi_id}.json"), "wb") as f:
        f.write(datos)
    return json.loads(datos)


def psi_bajar_csv(psi_id, t, carpeta):
    q = urllib.parse.urlencode({"file": t["file_name"], "version": t.get("version", 1), "redirect": "false"})
    url = get(f"{PSI}/studies/{psi_id}/download?{q}").decode().strip().strip('"')
    if "amazonaws.com" not in urllib.parse.urlparse(url).netloc:
        raise RuntimeError("no devolvio una URL de S3: " + url[:150])
    datos = get(url)                                  # el enlace firmado caduca: se usa de inmediato
    os.makedirs(os.path.join(carpeta, "psi_tablas"), exist_ok=True)
    ruta = os.path.join(carpeta, "psi_tablas", limpio(t["file_name"]))
    with open(ruta, "wb") as f:
        f.write(datos)
    return ruta, len(datos)


def hacer_psi(ids, carpeta):
    indice = []
    for psi_id in ids:
        try:
            meta = psi_meta(psi_id, carpeta)
        except Exception as e:
            print(f"{psi_id}: no se pudo leer ({e})")
            continue
        titulo = meta.get("title") or meta.get("name") or ""
        tablas = meta.get("experimentalTable") or []
        print(f"{psi_id}: {titulo[:60]!r} -> {len(tablas)} tabla(s)")
        for t in tablas:
            try:
                ruta, n = psi_bajar_csv(psi_id, t, carpeta)
                ok = (t.get("file_size") in (None, n))
                print(f"   {t['file_name']}: {n} bytes {'OK' if ok else '(tamano distinto al de metadatos!)'}")
                indice.append([psi_id, titulo, t["file_name"], n, "ok" if ok else "tamano_distinto"])
            except Exception as e:
                print(f"   {t['file_name']}: FALLO ({e})")
                indice.append([psi_id, titulo, t["file_name"], 0, f"error: {e}"])
        time.sleep(0.5)                              # no saturar el servidor
    if indice:
        with open(os.path.join(carpeta, "psi_indice.csv"), "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["psi_id", "titulo", "archivo", "bytes", "estado"])
            w.writerows(indice)
        print(f"indice: {os.path.join(carpeta, 'psi_indice.csv')}")


# ---------------------------------------------------------------- NTRS
def hacer_ntrs(consulta, n, n_pdfs, carpeta):
    q = urllib.parse.urlencode({"q": consulta, "page.size": n})
    data = json.loads(get(f"{NTRS}/api/citations/search?{q}"))
    res = data.get("results", [])
    total = (data.get("stats") or {}).get("total", len(res))
    print(f"NTRS: {total} resultados en total, {len(res)} recibidos")
    filas = []
    for r in res:
        pdf = ""
        for d in r.get("downloads") or []:
            p = (d.get("links") or {}).get("pdf")
            if p:
                pdf = p
                break
        anio = (r.get("distributionDate") or r.get("created") or "")[:4]
        filas.append([r.get("id"), anio, (r.get("title") or "").strip(), pdf])
    with open(os.path.join(carpeta, "ntrs_resultados.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "anio", "titulo", "pdf"])
        w.writerows(filas)
    os.makedirs(os.path.join(carpeta, "ntrs_pdfs"), exist_ok=True)
    bajados = 0
    for id_, anio, titulo, pdf in filas:
        if bajados >= n_pdfs:
            break
        if not pdf:
            continue
        url = pdf if pdf.startswith("http") else NTRS + pdf
        try:
            datos = get(url)
            with open(os.path.join(carpeta, "ntrs_pdfs", f"{id_}.pdf"), "wb") as f:
                f.write(datos)
            bajados += 1
            print(f"   PDF {id_} ({len(datos)//1024} KB) {titulo[:55]}")
        except Exception as e:
            print(f"   PDF {id_}: FALLO ({e})")
        time.sleep(0.5)
    print(f"{bajados} PDF descargados; lista completa en ntrs_resultados.csv")


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--psi", nargs="+", default=["PSI-25", "PSI-69"], help="IDs de PSI")
    ap.add_argument("--rango", nargs=2, type=int, metavar=("DESDE", "HASTA"), help="explora PSI-DESDE..PSI-HASTA")
    ap.add_argument("--ntrs", default="microgravity combustion flammability", help="busqueda en NTRS")
    ap.add_argument("--n", type=int, default=50, help="cuantos resultados pedir a NTRS")
    ap.add_argument("--pdfs", type=int, default=10, help="cuantos PDF bajar")
    ap.add_argument("--salida", default="datos_fuego")
    ap.add_argument("--solo-psi", action="store_true")
    ap.add_argument("--solo-ntrs", action="store_true")
    a = ap.parse_args()
    os.makedirs(a.salida, exist_ok=True)
    if not a.solo_ntrs:
        ids = [f"PSI-{i}" for i in range(a.rango[0], a.rango[1] + 1)] if a.rango else a.psi
        hacer_psi(ids, a.salida)
    if not a.solo_psi:
        hacer_ntrs(a.ntrs, a.n, a.pdfs, a.salida)


if __name__ == "__main__":
    main()
