#!/usr/bin/env python3
"""
psi_explorar.py - descubre y baja investigaciones de combustion/fuego de PSI.

PSI no publica una lista de IDs, asi que este script recorre un rango (PSI-1..PSI-N),
lee el JSON de cada una y se queda con las que parecen de combustion/fuego
(palabras clave y siglas: BASS, SAFFIRE, SAME, SPICE, SLICE, FLEX, ACME, DAFT, CFI...).

Para cada una:
  - guarda su JSON               -> datos_psi/json/<ID>.json
  - lista los "grupos de archivos" que trae (experimentalTable y cualquier otro
    con file_name/version) y cuantos archivos tiene cada uno
  - baja los CSV de experimentalTable -> datos_psi/tablas/<ID>/<archivo>
  - lee la primera linea de cada CSV y marca si tiene columna de presion

Salidas (carpeta datos_psi):
  catalogo_psi.csv        todas las investigaciones leidas: id, titulo, si coincide, grupos
  columnas_tablas.csv     por cada CSV: filas, columnas, tiene_presion, tiene_o2, tiene_flujo
  json/  tablas/

Uso (solo libreria estandar):
  python psi_explorar.py                      # explora PSI-1..PSI-200, baja las de combustion
  python psi_explorar.py --hasta 300
  python psi_explorar.py --ids PSI-25 PSI-69 PSI-117     # solo esos IDs (sin filtro)
  python psi_explorar.py --todas              # baja tablas de TODAS las que tengan (sin filtro)
  python psi_explorar.py --catalogo           # solo el catalogo, sin bajar CSV
  python psi_explorar.py --otros-grupos       # ademas de experimentalTable, baja los demas grupos
"""
import argparse, csv, io, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

PSI = "https://psi.nasa.gov/geode-py/ws"
UA = {"User-Agent": "Mozilla/5.0 (equipo-space-apps)"}

PALABRAS = ["combustion", "flame", "fire", "smoke", "burn", "ignit", "flammab", "soot",
            "droplet", "aerosol", "extinguish", "microgravity combustion", "cool flame"]
SIGLAS = re.compile(r"\b(BASS|BASS-II|SAFFIRE|SAME|SAME-R|SPICE|SLICE|FLEX|FLEX-2|ACME|DAFT|DAFT-2|CFI|CFI-G|BRE)\b")


def get(url, intentos=3):
    ultimo = None
    for i in range(intentos):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r:
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


def textos_cortos(meta):
    """Cadenas de nivel superior cortas (titulo, nombre, siglas...) + inicio de la descripcion."""
    cortos, largos = [], []
    for k, v in meta.items():
        if isinstance(v, str):
            (cortos if len(v) <= 300 else largos).append(v)
    return cortos, " ".join(x[:1500] for x in largos[:3])


def titulo_de(meta):
    for k in ("title", "name", "investigation_name", "investigationTitle", "shortTitle", "short_name"):
        if isinstance(meta.get(k), str) and meta[k].strip():
            return meta[k].strip()
    cortos, _ = textos_cortos(meta)
    return cortos[0] if cortos else ""


def es_combustion(meta):
    cortos, largo = textos_cortos(meta)
    solo_titulos = " ".join(cortos)
    if SIGLAS.search(solo_titulos):
        return True
    bajo = (solo_titulos + " " + largo).lower()
    return any(p in bajo for p in PALABRAS)


def grupos_de_archivos(meta):
    """Claves cuyo valor es una lista de dicts con file_name (experimentalTable y similares)."""
    g = {}
    for k, v in meta.items():
        if isinstance(v, list) and v and all(isinstance(x, dict) and "file_name" in x for x in v):
            g[k] = v
    return g


def leer_investigacion(psi_id):
    try:
        datos = get(f"{PSI}/repo/investigations/{psi_id}")
        return psi_id, datos, None
    except Exception as e:
        return psi_id, None, str(e)


def bajar_archivo(psi_id, t, destino):
    q = urllib.parse.urlencode({"file": t["file_name"], "version": t.get("version", 1), "redirect": "false"})
    url = get(f"{PSI}/studies/{psi_id}/download?{q}").decode().strip().strip('"')
    if "amazonaws.com" not in urllib.parse.urlparse(url).netloc:
        raise RuntimeError("no devolvio una URL de S3: " + url[:150])
    datos = get(url)                      # enlace firmado: caduca, se usa de inmediato
    os.makedirs(destino, exist_ok=True)
    ruta = os.path.join(destino, limpio(t["file_name"]))
    with open(ruta, "wb") as f:
        f.write(datos)
    return ruta, len(datos)


def decodificar(raw):
    for enc in ("utf-8-sig", "cp1252"):
        try:
            return raw.decode(enc), enc
        except UnicodeDecodeError:
            pass
    return raw.decode("latin-1"), "latin-1"


def resumen_csv(ruta):
    raw = open(ruta, "rb").read()
    texto, enc = decodificar(raw)
    filas = list(csv.reader(io.StringIO(texto)))
    cols = [c.strip() for c in (filas[0] if filas else [])]
    bajo = " | ".join(cols).lower()
    return {
        "codificacion": enc,
        "filas": max(len(filas) - 1, 0),
        "columnas": " | ".join(cols),
        "tiene_presion": int(bool(re.search(r"press|psi|kpa|torr|atm", bajo))),
        "tiene_o2": int(bool(re.search(r"o2|oxygen|oxigen", bajo))),
        "tiene_flujo": int(bool(re.search(r"flow|fan|velocity|speed|cm/s|air", bajo))),
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--desde", type=int, default=1)
    ap.add_argument("--hasta", type=int, default=200)
    ap.add_argument("--ids", nargs="+")
    ap.add_argument("--todas", action="store_true", help="no filtrar por combustion")
    ap.add_argument("--catalogo", action="store_true", help="solo catalogo, sin bajar CSV")
    ap.add_argument("--otros-grupos", action="store_true", help="bajar tambien grupos distintos de experimentalTable")
    ap.add_argument("--hilos", type=int, default=4)
    ap.add_argument("--salida", default="datos_psi")
    a = ap.parse_args()

    ids = a.ids or [f"PSI-{i}" for i in range(a.desde, a.hasta + 1)]
    os.makedirs(os.path.join(a.salida, "json"), exist_ok=True)
    catalogo, columnas = [], []
    sin_respuesta = 0

    print(f"Leyendo {len(ids)} IDs con {a.hilos} hilos...")
    with ThreadPoolExecutor(max_workers=a.hilos) as ex:
        for psi_id, datos, err in ex.map(leer_investigacion, ids):
            if err:
                sin_respuesta += 1
                continue
            try:
                meta = json.loads(datos)
            except Exception:
                continue
            titulo = titulo_de(meta)
            coincide = bool(a.ids) or es_combustion(meta)
            grupos = grupos_de_archivos(meta)
            resumen_g = "; ".join(f"{k}={len(v)}" for k, v in grupos.items())
            catalogo.append([psi_id, titulo, int(coincide), resumen_g, len(grupos.get("experimentalTable", []))])
            print(f"{psi_id:8s} {'*' if coincide else ' '} {titulo[:70]}  [{resumen_g or 'sin archivos'}]")
            if not (coincide or a.todas):
                continue
            with open(os.path.join(a.salida, "json", f"{psi_id}.json"), "wb") as f:
                f.write(datos)
            if a.catalogo:
                continue
            for nombre, lista in grupos.items():
                if nombre != "experimentalTable" and not a.otros_grupos:
                    continue
                for t in lista:
                    try:
                        ruta, n = bajar_archivo(psi_id, t, os.path.join(a.salida, "tablas" if nombre == "experimentalTable" else nombre, psi_id))
                    except Exception as e:
                        print(f"   {t['file_name']}: FALLO ({e})")
                        continue
                    aviso = "" if t.get("file_size") in (None, n) else "  (tamano distinto al de metadatos)"
                    print(f"   {t['file_name']}: {n} bytes{aviso}")
                    if nombre == "experimentalTable" and ruta.lower().endswith(".csv"):
                        r = resumen_csv(ruta)
                        columnas.append([psi_id, titulo, t["file_name"], r["filas"], r["tiene_presion"], r["tiene_o2"], r["tiene_flujo"], r["codificacion"], r["columnas"]])

    with open(os.path.join(a.salida, "catalogo_psi.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["psi_id", "titulo", "combustion", "grupos_de_archivos", "n_tablas_experimentos"])
        w.writerows(catalogo)
    if columnas:
        with open(os.path.join(a.salida, "columnas_tablas.csv"), "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["psi_id", "titulo", "archivo", "filas", "tiene_presion", "tiene_o2", "tiene_flujo", "codificacion", "columnas"])
            w.writerows(columnas)

    comb = [c for c in catalogo if c[2]]
    print(f"\nLeidas: {len(catalogo)} | sin respuesta: {sin_respuesta} | de combustion: {len(comb)} "
          f"| con tabla de experimentos: {sum(1 for c in comb if c[4])}")
    print(f"Catalogo: {os.path.join(a.salida, 'catalogo_psi.csv')}")
    if columnas:
        print(f"Columnas por tabla (con presion/O2/flujo): {os.path.join(a.salida, 'columnas_tablas.csv')}")
    print("Mandame catalogo_psi.csv y columnas_tablas.csv (o su contenido).")


if __name__ == "__main__":
    main()