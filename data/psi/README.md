# Datos de NASA PSI (solo combustión)

- **Origen:** NASA Physical Sciences Informatics (PSI), <https://psi.nasa.gov>. Cada investigación tiene su DOI en `meta/<PSI-id>.json` (`doi`).
- **Licencia:** CC0-1.0 (campo `licenseIdentifier` de cada investigación).
- **Filtro:** investigaciones con `researchArea == "Combustion Science"`: **24** (PSI-10, 20, 21, 22, 23, 25, 26, 39, 47, 60, 62, 68, 69, 98, 99, 100, 101, 102, 106, 107, 115, 117, 142, 159).
- **`tables/`:** 22 tablas experimentales (CSV) de 20 investigaciones, copiadas byte a byte. PSI-60, 62, 115 y 117 no publican tabla.
- **`meta/`:** metadatos de PSI sin los listados de archivos (`added`, `modified`, `removed`), contactos ni imágenes. Se agregan `n_files` y `n_pdfs` (conteos de esos listados).
- **Cómo se regenera:** `python3 -I pipeline/collect_data.py <carpeta_descarga>...` (las descargas se hicieron con `pipeline/legacy/nasa_fuego_todo.py`).
