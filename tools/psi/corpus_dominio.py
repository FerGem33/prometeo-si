#!/usr/bin/env python3
"""
corpus_dominio.py - arma un corpus de PSI de un dominio DISTINTO a combustion (D10, T37).

Basado en legacy/psi_explorar.py y legacy/psi_pdfs.py. Solo libreria estandar (Python 3.12);
si pypdf esta instalado lo usa para contar paginas y detectar PDF sin capa de texto.

Pasos:
  1. Catalogo: lee la metadata publica de PSI-<desde>..PSI-<hasta> (cache en <salida>/json/) y elige
     las investigaciones del dominio: area de investigacion + palabras clave del titulo. Nunca toma
     investigaciones de "Combustion Science" ni con siglas/palabras de combustion.
  2. Tablas: baja las experimentalTable (CSV) de las elegidas  -> <salida>/tablas/<ID>/
  3. PDF:    baja Reports y Presentations (<= --max-mb)          -> <salida>/pdfs/<ID>/<categoria>/
  4. Lote:   copia a <salida>/lote/ hasta 30 documentos que cumplen D3 (20 MB por archivo, 60 paginas
     por PDF): primero todas las tablas, luego PDF alternando investigaciones, de menor a mayor.
  5. Manifiesto: <salida>/manifest.csv y manifest.json con procedencia de cada archivo (ID, titulo,
     DOI, archivo PSI, version, categoria, bytes, SHA-256, paginas) e incluido/motivo de exclusion.

El lote es lo que se sube a un proyecto (T33/T37). Los datos quedan fuera de git (D9).

Uso:
  python3 -I tools/psi/corpus_dominio.py                          # dominio "ebullicion", PSI-1..200
  python3 -I tools/psi/corpus_dominio.py --dominio dendritas
  python3 -I tools/psi/corpus_dominio.py --solo-catalogo          # elige investigaciones, no baja archivos
  python3 -I tools/psi/corpus_dominio.py --solo-semilla           # sin recorrer PSI: solo los IDs semilla
  python3 -I tools/psi/corpus_dominio.py --ids PSI-4 PSI-85        # estos IDs (se sigue excluyendo combustion)
"""
import argparse, csv, hashlib, io, json, os, re, shutil, sys, time, urllib.error, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

PSI = "https://psi.nasa.gov/geode-py/ws"
UA = {"User-Agent": "Mozilla/5.0 (psi-corpus-script)"}

# D3 (aprobado 15-nov): limites de carga por proyecto.
MAX_BYTES = 20_000_000
MAX_PAGINAS = 60
MAX_DOCUMENTOS = 30

DOMINIOS = {
    "ebullicion": {
        "titulo": "Boiling and phase-change heat transfer in microgravity",
        "areas": {"Fluid Physics"},
        "palabras": ["boiling", "condensation", "two-phase", "phase change", "vapor bubble", "heat transfer"],
        # Revisadas el 15-nov: tablas con gravedad, presion, subenfriamiento, flujo de calor, sobrecalentamiento.
        "semilla": ["PSI-4", "PSI-85", "PSI-87", "PSI-138"],
    },
    "dendritas": {
        "titulo": "Dendritic solidification in microgravity",
        "areas": {"Materials Science"},
        "palabras": ["dendritic", "dendrite"],
        "semilla": ["PSI-71", "PSI-72", "PSI-73"],
    },
}

# Exclusion explicita del dominio de la demo (mismas listas que legacy/psi_explorar.py).
COMBUSTION = ["combustion", "flame", "fire", "smoke", "burn", "ignit", "flammab", "soot", "extinguish"]
SIGLAS_COMBUSTION = re.compile(r"\b(BASS|BASS-II|SAFFIRE|SAME|SAME-R|SPICE|SLICE|FLEX|FLEX-2|ACME|DAFT|DAFT-2|CFI|CFI-G|BRE)\b")


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


def nombre_local(s, maximo=100):
    """Nombre seguro y corto: PSI usa nombres de >200 caracteres y Windows limita la ruta a 260."""
    s = limpio(s)
    if len(s) <= maximo:
        return s
    base, ext = os.path.splitext(s)
    return f"{base[:maximo - len(ext) - 9]}_{hashlib.sha1(s.encode()).hexdigest()[:8]}{ext}"


def leer_meta(psi_id, carpeta_json):
    ruta = os.path.join(carpeta_json, f"{psi_id}.json")
    if os.path.exists(ruta):
        with open(ruta, "rb") as f:
            return psi_id, json.loads(f.read()), None
    try:
        datos = get(f"{PSI}/repo/investigations/{psi_id}")
        meta = json.loads(datos)
    except Exception as e:
        return psi_id, None, str(e)
    with open(ruta, "wb") as f:
        f.write(datos)
    return psi_id, meta, None


def es_combustion(meta):
    titulo = meta.get("title") or ""
    if meta.get("researchArea") == "Combustion Science" or SIGLAS_COMBUSTION.search(titulo):
        return True
    return any(p in titulo.lower() for p in COMBUSTION)


def es_del_dominio(meta, dom):
    titulo = (meta.get("title") or "").lower()
    return meta.get("researchArea") in dom["areas"] and any(p in titulo for p in dom["palabras"])


def categoria(x):
    partes = (x.get("remote_path") or "").split("/")      # /Home/psi-data/PSI-85/Reports/archivo
    return partes[4] if len(partes) > 5 else "Otros"


def bajar(psi_id, x, destino):
    os.makedirs(destino, exist_ok=True)
    ruta = os.path.join(destino, nombre_local(x["file_name"]))
    if os.path.exists(ruta) and (x.get("file_size") in (None, os.path.getsize(ruta))):
        return ruta, "ya_estaba"
    q = urllib.parse.urlencode({"file": x["file_name"], "version": x.get("version", 1), "redirect": "false"})
    url = get(f"{PSI}/studies/{psi_id}/download?{q}").decode().strip().strip('"')
    if "amazonaws.com" not in urllib.parse.urlparse(url).netloc:
        raise RuntimeError("no devolvio una URL de S3")
    datos = get(url)                      # enlace firmado: caduca, se usa de inmediato
    tmp = ruta + ".part"
    with open(tmp, "wb") as f:
        f.write(datos)
    os.replace(tmp, ruta)
    return ruta, "ok"


def sha256(ruta):
    h = hashlib.sha256()
    with open(ruta, "rb") as f:
        for bloque in iter(lambda: f.read(1 << 20), b""):
            h.update(bloque)
    return h.hexdigest()


def revisar_pdf(ruta):
    """(paginas, con_texto, metodo). paginas None = no se pudo determinar."""
    try:
        import pypdf  # opcional; el worker usa pypdf 7.1.0
        lector = pypdf.PdfReader(ruta)
        paginas = len(lector.pages)
        muestra = "".join((lector.pages[i].extract_text() or "") for i in range(min(paginas, 3)))
        return paginas, len(muestra.strip()) >= 200, "pypdf"
    except ImportError:
        pass
    except Exception:
        return None, False, "pypdf_error"
    with open(ruta, "rb") as f:
        raw = f.read()
    hojas = len(re.findall(rb"/Type\s*/Page(?![s\w])", raw))
    cuentas = [int(n) for n in re.findall(rb"/Type\s*/Pages\b[^>]*?/Count\s+(\d+)", raw)]
    paginas = max(cuentas) if cuentas else (hojas or None)
    # Sin pypdf no se puede comprobar el texto: se marca desconocido (None) y se decide abajo.
    return paginas, None, "regex"


def resumen_csv(ruta):
    raw = open(ruta, "rb").read()
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            texto = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    filas = list(csv.reader(io.StringIO(texto)))
    return max(len(filas) - 1, 0), [c.strip() for c in (filas[0] if filas else []) if c.strip()]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dominio", choices=sorted(DOMINIOS), default="ebullicion")
    ap.add_argument("--desde", type=int, default=1)
    ap.add_argument("--hasta", type=int, default=200)
    ap.add_argument("--ids", nargs="+", help="solo estos IDs (sin recorrer PSI)")
    ap.add_argument("--solo-semilla", action="store_true", help="solo los IDs semilla del dominio")
    ap.add_argument("--solo-catalogo", action="store_true", help="elegir investigaciones sin bajar archivos")
    ap.add_argument("--categorias", nargs="+", default=["Reports", "Presentations"])
    ap.add_argument("--max-mb", type=float, default=20, help="tope por PDF a descargar (D3: 20 MB)")
    ap.add_argument("--max-documentos", type=int, default=MAX_DOCUMENTOS)
    ap.add_argument("--hilos", type=int, default=4)
    ap.add_argument("--salida", help="carpeta de salida (por defecto tools/psi/data/dominio_<dominio>)")
    a = ap.parse_args()
    if hasattr(sys.stdout, "reconfigure"):          # consola de Windows (cp1252) y titulos con simbolos
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    dom = DOMINIOS[a.dominio]
    raiz = os.path.dirname(os.path.abspath(__file__))
    salida = a.salida or os.path.join(raiz, "data", f"dominio_{a.dominio}")
    carpeta_json = os.path.join(salida, "json")
    os.makedirs(carpeta_json, exist_ok=True)
    max_docs = min(a.max_documentos, MAX_DOCUMENTOS)

    # 1. Catalogo
    if a.ids:
        ids = a.ids
    elif a.solo_semilla:
        ids = dom["semilla"]
    else:
        ids = sorted(set([f"PSI-{i}" for i in range(a.desde, a.hasta + 1)] + dom["semilla"]),
                     key=lambda s: int(s.split("-")[1]))
    print(f"Dominio: {a.dominio} ({dom['titulo']}) | leyendo {len(ids)} IDs con {a.hilos} hilos...")
    elegidas, catalogo = {}, []
    with ThreadPoolExecutor(max_workers=a.hilos) as ex:
        for psi_id, meta, err in ex.map(lambda i: leer_meta(i, carpeta_json), ids):
            if err or not isinstance(meta, dict):
                continue
            combustion = es_combustion(meta)
            elegida = not combustion and (bool(a.ids) or psi_id in dom["semilla"] or es_del_dominio(meta, dom))
            n_tablas = len(meta.get("experimentalTable") or [])
            catalogo.append([psi_id, meta.get("title") or "", meta.get("researchArea") or "", meta.get("doi") or "",
                             n_tablas, int(combustion), int(elegida)])
            if elegida:
                elegidas[psi_id] = meta
    with open(os.path.join(salida, "catalogo.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["psi_id", "titulo", "area", "doi", "n_tablas", "combustion", "elegida"])
        w.writerows(sorted(catalogo, key=lambda r: int(r[0].split("-")[1])))
    if not elegidas:
        sys.exit("Ninguna investigacion del dominio; revisar --ids o el rango.")
    for psi_id, meta in sorted(elegidas.items(), key=lambda kv: int(kv[0].split("-")[1])):
        print(f"  {psi_id:8s} [{meta.get('researchArea')}] {(meta.get('title') or '')[:80]}"
              f"  tablas={len(meta.get('experimentalTable') or [])} doi={meta.get('doi')}")
    if a.solo_catalogo:
        print(f"Catalogo: {os.path.join(salida, 'catalogo.csv')}")
        return

    # 2-3. Descargas
    trabajos = []
    for psi_id, meta in elegidas.items():
        for t in meta.get("experimentalTable") or []:
            if t["file_name"].lower().endswith(".csv"):
                trabajos.append((psi_id, t, "table", "Experimental table", os.path.join(salida, "tablas", psi_id)))
        for grupo in ("added", "modified"):
            for x in meta.get(grupo) or []:
                if not (x.get("file_name") or "").lower().endswith(".pdf") or categoria(x) not in a.categorias:
                    continue
                if (x.get("file_size") or 0) / 1e6 > a.max_mb:
                    continue
                trabajos.append((psi_id, x, "paper", categoria(x), os.path.join(salida, "pdfs", psi_id, limpio(categoria(x)))))
    print(f"Descargando {len(trabajos)} archivos...")

    def tarea(t):
        psi_id, x, tipo, cat, destino = t
        try:
            ruta, estado = bajar(psi_id, x, destino)
        except Exception as e:
            return t, None, f"error: {e}"
        return t, ruta, estado

    docs = []
    with ThreadPoolExecutor(max_workers=a.hilos) as ex:
        for (psi_id, x, tipo, cat, _), ruta, estado in ex.map(tarea, trabajos):
            meta = elegidas[psi_id]
            d = {"psi_id": psi_id, "investigacion": meta.get("title") or "", "area": meta.get("researchArea") or "",
                 "doi": meta.get("doi") or "", "tipo": tipo, "categoria": cat, "archivo_psi": x["file_name"],
                 "version": x.get("version", 1), "bytes": None, "sha256": "", "paginas": None, "filas": None,
                 "columnas": "", "texto": None, "estado_descarga": estado, "incluido": False, "motivo": "",
                 "lote": ""}
            print(f"  {psi_id} [{cat}] {x['file_name'][:70]} -> {estado}")
            if ruta:
                d["bytes"], d["sha256"], d["_ruta"] = os.path.getsize(ruta), sha256(ruta), ruta
                if tipo == "table":
                    d["filas"], cols = resumen_csv(ruta)
                    d["columnas"] = " | ".join(cols)
                else:
                    d["paginas"], d["texto"], _ = revisar_pdf(ruta)
            docs.append(d)

    # 4. Lote D3
    vistos, candidatos = set(), []
    for d in docs:
        if "_ruta" not in d:
            d["motivo"] = "descarga_fallida"
        elif d["sha256"] in vistos:
            d["motivo"] = "duplicado"
        elif d["bytes"] > MAX_BYTES:
            d["motivo"] = "too_large"
        elif d["tipo"] == "table" and not d["filas"]:
            d["motivo"] = "tabla_vacia"
        elif d["tipo"] == "paper" and d["paginas"] is None:
            d["motivo"] = "paginas_desconocidas"
        elif d["tipo"] == "paper" and d["paginas"] > MAX_PAGINAS:
            d["motivo"] = "too_many_pages"
        elif d["tipo"] == "paper" and d["texto"] is False:
            d["motivo"] = "no_text_layer"
        else:
            vistos.add(d["sha256"])
            candidatos.append(d)
    tablas = sorted((d for d in candidatos if d["tipo"] == "table"), key=lambda d: (d["psi_id"], d["archivo_psi"]))
    por_inv = {}
    for d in sorted((d for d in candidatos if d["tipo"] == "paper"),
                    key=lambda d: (d["categoria"] != "Reports", d["bytes"])):
        por_inv.setdefault(d["psi_id"], []).append(d)
    papers = []
    while any(por_inv.values()):                     # alterna investigaciones para no sesgar el corpus
        for psi_id in sorted(por_inv, key=lambda s: int(s.split("-")[1])):
            if por_inv[psi_id]:
                papers.append(por_inv[psi_id].pop(0))
    lote_dir = os.path.join(salida, "lote")
    if os.path.isdir(lote_dir):
        shutil.rmtree(lote_dir)
    os.makedirs(lote_dir)
    for d in tablas + papers:
        if sum(1 for x in docs if x["incluido"]) >= max_docs:
            d["motivo"] = "fuera_del_cupo_D3"
            continue
        nombre = limpio(f"{d['psi_id']}__{os.path.basename(d['_ruta'])}")
        shutil.copy2(d["_ruta"], os.path.join(lote_dir, nombre))
        d["incluido"], d["lote"] = True, nombre

    # 5. Manifiesto
    campos = ["incluido", "motivo", "lote", "psi_id", "investigacion", "area", "doi", "tipo", "categoria",
              "archivo_psi", "version", "bytes", "sha256", "paginas", "texto", "filas", "columnas", "estado_descarga"]
    filas = [{k: d.get(k) for k in campos} for d in docs]
    filas.sort(key=lambda r: (not r["incluido"], r["tipo"] != "table", int(r["psi_id"].split("-")[1]), r["archivo_psi"]))
    with open(os.path.join(salida, "manifest.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=campos)
        w.writeheader()
        w.writerows(filas)
    resumen = {"dominio": a.dominio, "titulo": dom["titulo"], "generado": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
               "limites_d3": {"max_bytes": MAX_BYTES, "max_pages": MAX_PAGINAS, "max_documents": MAX_DOCUMENTOS},
               "investigaciones": sorted(elegidas, key=lambda s: int(s.split("-")[1])),
               "incluidos": sum(1 for r in filas if r["incluido"]), "documentos": filas}
    with open(os.path.join(salida, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(resumen, f, ensure_ascii=False, indent=2)
    excl = {}
    for r in filas:
        if not r["incluido"]:
            excl[r["motivo"]] = excl.get(r["motivo"], 0) + 1
    print(f"\nLote: {resumen['incluidos']} documentos en {lote_dir} "
          f"({sum(1 for r in filas if r['incluido'] and r['tipo'] == 'table')} tablas)")
    print(f"Excluidos: {excl or 'ninguno'}")
    print(f"Manifiesto: {os.path.join(salida, 'manifest.csv')}")


if __name__ == "__main__":
    main()
