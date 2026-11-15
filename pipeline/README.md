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

## T32: perfiles y propuestas de esquema

Cada ejecución produce `profiles`: conteos de vacíos/no vacíos, números estrictos finitos,
rango numérico observado y hasta cinco celdas citadas por columna. Los rangos no son rangos
científicos aprobados ni escalas del motor. No interpreta porcentajes, intervalos, unidades
ni separadores decimales ambiguos. PDF: inventario de páginas y cantidad de texto.

Preparar una petición (sin SDK ni AWS), usando un ID de `documents` del artefacto:

```bash
python3 -I api/ingest_propose.py /tmp/prometeo-ingest/parsed.json \
  --doc-id doc_HASH --prepare-only --output /tmp/proposal-request.json
```

Para PDF, agregar `--pages 1 2` con páginas físicas seleccionadas. Cada petición está limitada
a 60,000 caracteres; no se recorta texto silenciosamente. Este límite técnico no decide D3.

En una laptop con el perfil `prometeo` y las dependencias de `api/requirements.txt` instaladas:

```bash
export AWS_PROFILE=prometeo
source infra/config.env
# Usar el Python del entorno con anthropic[bedrock]. Omitir --prepare-only invoca el modelo.
python3 -I api/ingest_propose.py /tmp/prometeo-ingest/parsed.json \
  --doc-id doc_HASH --output /tmp/proposal-response.json
python3 -I pipeline/ingest.py /ruta/al/corpus \
  --proposal-response /tmp/proposal-response.json --output /tmp/prometeo-ingest/review.json
```

El adaptador utiliza el SDK oficial AnthropicBedrock, `MODEL_ID`, región `us-east-1`,
6,000 tokens máximos de salida y cero reintentos automáticos. El JSON que guarda es una
**respuesta sin validar**, nunca un esquema aprobado. Rechaza respuestas truncadas y JSON
ilegible; la segunda orden valida campos, referencias, conversiones finitas y citas contra
los documentos. `proposal_check.status` informa `valid` o `rejected` con motivo.
Un rechazo devuelve código 1. `valid` solo permite revisión; no implica corrección científica.

El formato de respuesta está en `api/ingest_propose.py:SYSTEM`. Cada petición cubre un documento;
no fusiona variables entre documentos. El validador produce `SchemaProposal` con todos los
estados `proposed`, conteos extraídos en cero y sin constantes. Las constantes, fusiones,
aprobación humana y extracción siguen pendientes; no se deducen de la validación textual.
La comprobación de evidencia no prueba que una unidad propuesta tenga sentido semántico.

Pruebas locales sin SDK ni AWS:

```bash
python3 -I pipeline/test_ingest.py
python3 -I api/test_ingest_propose.py
```
