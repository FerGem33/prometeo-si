#!/usr/bin/env python3
"""
psi_pdfs.py - baja los PDF de las investigaciones de PSI (y opcionalmente papers de NTRS).

Lee los JSON que ya bajaste con psi_explorar.py (datos_psi/json/*.json), asi que NO vuelve
a recorrer PSI. Fuentes de PDF:
  1) PDF alojados en PSI (informes finales, presentaciones, documentos de ingenieria...).
     Se clasifican por la carpeta del archivo: Reports, Presentations, Analyzed Data,
     Engineering Documents, Raw Data.
  2) (opcional) --ntrs-titulos: busca en NTRS el titulo de cada publicacion de la
     investigacion y baja el PDF si el titulo coincide (>= 0.85 de similitud).
  3) Enlaces de NTRS que aparezcan escritos dentro del JSON.

Solo libreria estandar. Ejemplos:
  python psi_pdfs.py --listar                 # cuenta PDF y MB por investigacion; no baja nada
  python psi_pdfs.py                          # baja Reports + Presentations de combustion (<=40 MB c/u)
  python psi_pdfs.py --categorias Reports Presentations "Analyzed Data" --max-mb 60
  python psi_pdfs.py --ids PSI-25 PSI-69 --todas-categorias
  python psi_pdfs.py --ntrs-titulos --max-titulos 150

Salida (carpeta datos_psi):  pdfs/<PSI-ID>/<categoria>/<archivo>.pdf , pdfs/ntrs/<id>.pdf , pdfs_indice.csv
"""
import argparse, csv, difflib, glob, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

PSI = "https://psi.nasa.gov/geode-py/ws"
NTRS = "https://ntrs.nasa.gov"
UA = {"User-Agent": "Mozilla/5.0 (equipo-space-apps)"}


def get(url, intentos=3):
    ultimo = None
    for i in range(intentos):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (400, 401, 403, 404):
                raise
            ultimo = e
        except Exception as e:
            ultimo = e
        time.sleep(2 * (i + 1))
    raise ultimo


def limpio(s):
    return re.sub(r'[\\/:*?"<>|]', "_", s)


def categoria(x):
    partes = (x.get("remote_path") or "").split("/")      # /Home/psi-data/PSI-117/Presentations/archivo
    return partes[4] if len(partes) > 5 else "Otros"


def pdfs_de(meta):
    out = []
    for grupo in ("added", "modified"):
        for x in meta.get(grupo) or []:
            if (x.get("file_name") or "").lower().endswith(".pdf"):
                out.append(x)
    return out


def bajar_psi(psi_id, x, carpeta):
    destino = os.path.join(carpeta, "pdfs", psi_id, limpio(categoria(x)))
    os.makedirs(destino, exist_ok=True)
    ruta = os.path.join(destino, limpio(x["file_name"]))
    if os.path.exists(ruta) and os.path.getsize(ruta) == x.get("file_size"):
        return ruta, "ya_estaba"
    q = urllib.parse.urlencode({"file": x["file_name"], "version": x.get("version", 1), "redirect": "false"})
    url = get(f"{PSI}/studies/{psi_id}/download?{q}").decode().strip().strip('"')
    if "amazonaws.com" not in urllib.parse.urlparse(url).netloc:
        raise RuntimeError("no devolvio URL de S3: " + url[:120])
    datos = get(url)
    with open(ruta, "wb") as f:
        f.write(datos)
    return ruta, "ok"


def bajar_ntrs(id_, carpeta, ruta_pdf=None):
    destino = os.path.join(carpeta, "pdfs", "ntrs")
    os.makedirs(destino, exist_ok=True)
    ruta = os.path.join(destino, f"{id_}.pdf")
    if os.path.exists(ruta):
        return ruta, "ya_estaba"
    url = NTRS + (ruta_pdf or f"/api/citations/{id_}/downloads/{id_}.pdf")
    with open(ruta, "wb") as f:
        f.write(get(url))
    return ruta, "ok"


def buscar_titulo_ntrs(titulo):
    q = urllib.parse.urlencode({"q": f'"{titulo}"', "page.size": 5})
    data = json.loads(get(f"{NTRS}/api/citations/search?{q}"))
    mejor = (0.0, None, None)
    for r in data.get("results", []):
        s = difflib.SequenceMatcher(None, titulo.lower(), (r.get("title") or "").lower()).ratio()
        pdf = next(((d.get("links") or {}).get("pdf") for d in (r.get("downloads") or []) if (d.get("links") or {}).get("pdf")), None)
        if s > mejor[0] and pdf:
            mejor = (s, r.get("id"), pdf)
    return mejor


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--carpeta", default="datos_psi")
    ap.add_argument("--ids", nargs="+", help="solo estas investigaciones (por defecto: todas las de Combustion Science)")
    ap.add_argument("--categorias", nargs="+", default=["Reports", "Presentations"])
    ap.add_argument("--todas-categorias", action="store_true")
    ap.add_argument("--max-mb", type=float, default=40)
    ap.add_argument("--listar", action="store_true", help="solo contar, sin descargar")
    ap.add_argument("--ntrs-titulos", action="store_true", help="buscar en NTRS los titulos de las publicaciones")
    ap.add_argument("--max-titulos", type=int, default=200)
    ap.add_argument("--hilos", type=int, default=3)
    a = ap.parse_args()

    archivos = sorted(glob.glob(os.path.join(a.carpeta, "json", "*.json")), key=lambda p: int(re.findall(r"\d+", os.path.basename(p))[0]))
    if not archivos:
        sys.exit(f"No hay JSON en {a.carpeta}/json. Corre primero psi_explorar.py")

    trabajos, metas = [], {}
    for p in archivos:
        meta = json.load(open(p, encoding="utf-8"))
        psi_id = meta.get("accession") or os.path.basename(p)[:-5]
        if a.ids and psi_id not in a.ids:
            continue
        if not a.ids and meta.get("researchArea") != "Combustion Science":
            continue
        metas[psi_id] = meta
        for x in pdfs_de(meta):
            if not a.todas_categorias and categoria(x) not in a.categorias:
                continue
            if (x.get("file_size") or 0) / 1e6 > a.max_mb:
                continue
            trabajos.append((psi_id, x))

    mb = sum((x.get("file_size") or 0) for _, x in trabajos) / 1e6
    print(f"{len(metas)} investigaciones | {len(trabajos)} PDF seleccionados | {mb:.0f} MB")
    resumen = {}
    for psi_id, x in trabajos:
        c = resumen.setdefault(psi_id, [0, 0.0])
        c[0] += 1
        c[1] += (x.get("file_size") or 0) / 1e6
    for k, (n, m) in resumen.items():
        print(f"  {k}: {n} PDF, {m:.0f} MB")
    if a.listar:
        return

    indice = []
    def tarea(t):
        psi_id, x = t
        try:
            ruta, est = bajar_psi(psi_id, x, a.carpeta)
        except Exception as e:
            ruta, est = "", f"error: {e}"
        return [psi_id, categoria(x), x["file_name"], round((x.get("file_size") or 0) / 1e6, 2), est]
    with ThreadPoolExecutor(max_workers=a.hilos) as ex:
        for fila in ex.map(tarea, trabajos):
            indice.append(fila)
            print(f"  {fila[0]} [{fila[1]}] {fila[2][:60]} -> {fila[4]}")

    # enlaces NTRS escritos dentro de los JSON
    ids_ntrs = {}
    for psi_id, meta in metas.items():
        for i in set(re.findall(r"ntrs\.nasa\.gov/(?:api/)?citations/(\d{11})", json.dumps(meta))):
            ids_ntrs[i] = psi_id
    for i, psi_id in ids_ntrs.items():
        try:
            _, est = bajar_ntrs(i, a.carpeta)
        except Exception as e:
            est = f"error: {e}"
        indice.append([psi_id, "NTRS(enlace en JSON)", f"{i}.pdf", "", est])
        print(f"  NTRS {i} (citado en {psi_id}) -> {est}")

    # publicaciones por titulo
    if a.ntrs_titulos:
        hechos = 0
        for psi_id, meta in metas.items():
            for pub in meta.get("publications") or []:
                if hechos >= a.max_titulos:
                    break
                titulo = (pub.get("title") or "").strip()
                if len(titulo) < 15:
                    continue
                hechos += 1
                try:
                    s, id_, pdf = buscar_titulo_ntrs(titulo)
                    if id_ and s >= 0.85:
                        _, est = bajar_ntrs(id_, a.carpeta, pdf)
                        indice.append([psi_id, "NTRS(titulo)", f"{id_}.pdf", round(s, 2), f"{est}: {titulo[:70]}"])
                        print(f"  {psi_id} NTRS {id_} sim={s:.2f} {titulo[:55]} -> {est}")
                    else:
                        indice.append([psi_id, "NTRS(titulo)", "", round(s, 2), f"sin coincidencia: {titulo[:70]}"])
                except Exception as e:
                    indice.append([psi_id, "NTRS(titulo)", "", "", f"error: {e}"])
                time.sleep(0.4)

    with open(os.path.join(a.carpeta, "pdfs_indice.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["psi_id", "categoria", "archivo", "mb_o_similitud", "estado"])
        w.writerows(indice)
    ok = sum(1 for r in indice if str(r[4]).startswith(("ok", "ya_estaba")))
    print(f"\nPDF listos: {ok}/{len(indice)} | indice: {os.path.join(a.carpeta, 'pdfs_indice.csv')}")


if __name__ == "__main__":
    main()