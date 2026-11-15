# Pipeline fuera de línea

Los scripts Python usan solo librería estándar. Ejecutarlos con `python3 -I` (versión del proyecto: 3.12).
El pack publicado vive en `web/public/demo/`. La descarga PSI permanece local y fuera de git (D9).

## T32: lectura y verificación local (primera etapa)

```bash
python3 -I pipeline/ingest.py /ruta/al/corpus --output /tmp/prometeo-ingest/parsed.json
python3 -I pipeline/ingest.py /ruta/al/corpus \
  --citations /tmp/citations.json --output /tmp/prometeo-ingest/checked.json
python3 -I pipeline/test_ingest.py
```

Acepta un CSV/PDF o una carpeta recursiva. PDF requiere Poppler (`pdftotext` en PATH);
no hace OCR ni llama a AWS. La salida debe estar fuera del corpus y contiene texto fuente:
conservarla local, sin subirla a git. No modifica el pack ni los originales.

- Identidad: SHA-256 de los bytes originales; copias idénticas se marcan `skipped/duplicate`.
- CSV: coma como delimitador; UTF-8 con BOM, CP1252 o Latin-1. No se recortan celdas.
  `row` es la fila lógica CSV (cabecera = 1), incluso con campos multilínea.
  Cabeceras vacías/duplicadas y filas de ancho incorrecto se rechazan para evitar citas ambiguas.
- PDF: texto por página física (1-based, no el folio impreso), preservando páginas vacías.
  PDFs sin texto extraíble se marcan `no_text_layer`; no se inventa contenido.
- Los fallos se registran por documento y el lote continúa. Código de salida 1 si hay documentos
  fallidos o citas rechazadas; 0 en otro caso. Duplicados no cuentan como fallo.
- No se aplican todavía los límites de subida D3; esto es una herramienta local.

`--citations` recibe una lista JSON de objetos del contrato `Citation`:
`{kind, doc_id, row, column, text}` para tablas, o
`{kind, doc_id, page, quote}` para artículos. Usar los IDs del artefacto de lectura.
Cada comprobación devuelve `verified` y un motivo. Ignora el `verified` enviado por el cliente.
Las tablas requieren igualdad exacta de celda; los PDF buscan la cita solo en la página indicada,
normalizando Unicode NFC y espacios. No se eliminan signos ni números ni se unen palabras partidas.

**Alcance:** encontrar texto no demuestra que respalde semánticamente un valor extraído.
Todavía faltan perfilado, propuesta de esquema con Bedrock, aprobación y extracción de registros.
Este artefacto no es un pack publicable ni sustituye la revisión humana.

## Pack de demo existente

`build_pack.py` y `validate_pack.py` generan/validan el pack mediante el mapping revisado de PSI.
El generador requiere `data/psi/tables` y `data/psi/meta` locales; falla sin sobrescribir el pack
si no están presentes. T18 sigue pendiente: documentar la descarga y unificar las rutas configurables.
`induce_schema.py` es la prueba T14 de mapeo de columnas; no es el extractor T32.
