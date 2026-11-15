#!/usr/bin/env python3
"""collect_data.py - copia al repo los datos de combustion de NASA PSI (T01).

Lee una o mas carpetas de descarga (cada una con psi_json/ y psi_tablas/), se queda con las
investigaciones con researchArea == "Combustion Science" y escribe:
  data/psi/tables/*.csv   tablas experimentales, sin tocar (byte a byte)
  data/psi/meta/*.json    metadatos sin los listados de archivos ni los contactos

Uso:  python3 -I pipeline/collect_data.py ../datos_fuego ../datos_fuego_131_260
Solo libreria estandar.
"""
import glob, json, os, shutil, sys

DROP = ("added", "modified", "removed", "contacts", "images")   # listados de archivos y datos personales
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main(carpetas):
    tablas, metas = os.path.join(RAIZ, "data/psi/tables"), os.path.join(RAIZ, "data/psi/meta")
    os.makedirs(tablas, exist_ok=True); os.makedirs(metas, exist_ok=True)
    n_inv = n_csv = 0
    for carpeta in carpetas:
        for ruta in sorted(glob.glob(os.path.join(carpeta, "psi_json", "*.json"))):
            m = json.load(open(ruta, encoding="utf-8"))
            if m.get("researchArea") != "Combustion Science":
                continue
            archivos = [x for g in ("added", "modified") for x in m.get(g) or []]
            m["n_files"] = len(archivos)
            m["n_pdfs"] = sum(1 for x in archivos if (x.get("file_name") or "").lower().endswith(".pdf"))
            for k in DROP:
                m.pop(k, None)
            psi = m["accession"]
            json.dump(m, open(os.path.join(metas, psi + ".json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
            n_inv += 1
            for csv_ruta in sorted(glob.glob(os.path.join(carpeta, "psi_tablas", psi + "_*.csv"))):
                shutil.copyfile(csv_ruta, os.path.join(tablas, os.path.basename(csv_ruta)))
                n_csv += 1
    print(f"investigaciones de combustion: {n_inv} | tablas CSV: {n_csv}")


if __name__ == "__main__":
    main(sys.argv[1:] or [os.path.join(RAIZ, "..", "datos_fuego"), os.path.join(RAIZ, "..", "datos_fuego_131_260")])
