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
Las siguientes secciones describen perfilado, propuesta con Bedrock y la revisión/extracción local.
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
estados `proposed`, conteos extraídos en cero y sin constantes. Las constantes, fusiones y aprobación humana no se deducen de la validación textual;
se revisan explícitamente mediante el flujo local descrito abajo.
La comprobación de evidencia no prueba que una unidad propuesta tenga sentido semántico.

Pruebas locales sin SDK ni AWS:

```bash
python3 -I pipeline/test_ingest.py
python3 -I api/test_ingest_propose.py
```

## T32: entorno reproducible y evidencia real

```bash
python3.12 -m venv /tmp/prometeo-t32-venv
/tmp/prometeo-t32-venv/bin/python -m pip install -r api/requirements.txt 'botocore[crt]' pytest
# macOS, si pdftotext no existe:
brew install poppler
export AWS_PROFILE=prometeo
source infra/config.env
aws sts get-caller-identity --query '{Account:Account,Arn:Arn}' --output json
```

`botocore[crt]` permite usar la sesión AWS Login de esta laptop; no copia credenciales al
repositorio. Conservar el `MODEL_ID` aprobado en D6. Agregar `--raw-output /tmp/response-raw.json`
al adaptador para guardar la respuesta completa del SDK (incluido uso de tokens) **antes** de
validar JSON o truncamiento. Los archivos de respuesta deben ser nuevos. Solo se acepta JSON
puro o un único bloque Markdown JSON completo; texto adicional sigue siendo un rechazo.

Informe de llamadas reales, fallos, métricas y fuentes: [T32_EVALUACION.md](../docs/T32_EVALUACION.md).
No confundir los tests con dobles (`test_ingest_propose.py`) con estas llamadas a AWS.

## T32: revisión explícita → aprobación local → extracción

`review_extract.py` es una herramienta local, de librería estándar. No es una ruta HTTP,
no autentica al revisor ni publica un pack. Guarda la identidad **declarada** del operador;
los hashes detectan cambios respecto al artefacto guardado, no prueban autoría.

1. Leer el original con `ingest.py` y validar `--proposal-response`. Guardar
   `proposal_check.schema` en un archivo JSON separado; sigue con estados `proposed`.
2. Preparar una solicitud inmutable de revisión:

```bash
python3.12 -I pipeline/review_extract.py prepare /tmp/parsed-and-checked.json \
  --schema /tmp/schema-proposed.json --output /tmp/review-request.json
```

3. Una **persona** copia el esquema a `/tmp/schema-reviewed.json` y decide cada estado:
   `approved`, `flagged` o `rejected`. Revisa IDs, tipos, unidades, conversiones lineales
   (`factor`, `offset`), roles y evidencia. Puede fusionar referencias de columnas hacia
   un único ID y conservar `merged_from`; no se infiere que dos variables son equivalentes.
   Conserva el `version` de la solicitud. Guarda cada revisión en un archivo nuevo.
4. Solo tras esas decisiones, la persona ejecuta (sustituir el nombre y versión reales):

```bash
python3.12 -I pipeline/review_extract.py approve /tmp/parsed-and-checked.json \
  --schema /tmp/review-request.json --reviewed-schema /tmp/schema-reviewed.json \
  --version 1 --reviewer 'Nombre del revisor' --output /tmp/schema-approved.json
python3.12 -I pipeline/review_extract.py extract /tmp/parsed-and-checked.json \
  --schema /tmp/schema-approved.json --output /tmp/records-draft.json
```

La aprobación rechaza elementos `proposed`, referencias inexistentes, unidades incompatibles
sin conversión (o bandera), versiones/corpus distintos y más de una partición activa. La
aprobación incrementa versión y conserva la solicitud previa. La extracción comprueba el hash
del esquema y del inventario de documentos antes de trabajar. Los artefactos son nuevos,
fuera del repositorio y del corpus; un artefacto antiguo sin `corpus_root` debe regenerarse
con `ingest.py`. La edición concurrente/historial del servidor corresponde a T35.

Los números admiten escalares finitos o intervalos explícitos (`2-3`). Expresiones ambiguas
quedan en `rejected`, con celda/cita original. No se infieren unidades ni se normalizan categorías
sin una decisión revisada. Una columna `flagged` sin conversión válida no aporta un número
canónico: queda retenida como rechazo `unit_unconverted`. Los valores admitidos conservan
`citations`, `provenance`, unidad original, conversión, SHA y ruta. Dos columnas para la misma
variable producen un conflicto; no se elige una silenciosamente. Estos borradores no incluyen
por inferencia el tipo `test/campaign`, DOI o pertenencia a estudio del contrato publicable.

**Constantes:** extensión local de revisión, aún no un contrato nuevo del servidor. Además de
`doc_id`, `variable`, `value`, `note`, exigen `rows` (lista de filas destino), `citation` y
`semantic_support: "reviewed"`. La persona debe justificar el alcance de cada constante;
una cita encontrada no autoriza a extender presión a todas las pruebas. Se conserva la
procedencia del documento de evidencia y del documento destino por separado. No se importan
constantes del pack automáticamente para esta evaluación.

Para artículos, `verify-paper` verifica candidatos contra el esquema aprobado y las páginas
originales. Un candidato admisible queda `awaiting_semantic_review`, nunca aprobado ni aplicado
a filas de tablas. Los candidatos tienen `variable`, `value` (intervalo numérico o categoría),
`unit`, `citation` y `scope`. Se rechazan unidades distintas de la variable destino hasta que
exista una conversión revisada. `Citation.verified` solo indica coincidencia literal.

```bash
python3.12 -I pipeline/review_extract.py verify-paper /tmp/papers-parsed.json \
  --schema /tmp/papers-schema-approved.json --paper-response /tmp/paper-response.json \
  --output /tmp/paper-candidates-checked.json
python3.12 -I pipeline/test_review_extract.py
```

## Evaluadores acotados (no publican)

Todos escriben en directorios **nuevos** fuera del repositorio/corpus:

```bash
# Modelo real: vocabulario del esquema publicado, sin enviar el mapping.
/tmp/prometeo-t32-venv/bin/python -I api/evaluate_ingest.py \
  --tables-dir tools/datos_psi/tablas --output-dir /tmp/t32-tables-run
# Para diagnosticar una fuente, se permite repetir --source sN; conservar intentos anteriores.

# Sin modelo: extracción de celdas contra el mapping ya aprobado del pack.
python3.12 -I pipeline/evaluate_extraction.py \
  --tables-dir tools/datos_psi/tablas --output-dir /tmp/t32-extraction-run

# Modelo real sobre páginas seleccionadas de PDFs previamente parseados.
/tmp/prometeo-t32-venv/bin/python -I api/evaluate_papers.py /tmp/papers-parsed.json \
  --output-dir /tmp/t32-papers-run
```

La selección de tablas sale de las 22 fuentes de `pack.json` y exige su SHA original.
El mapping publicado recorta espacios externos de cabeceras: se alinean solo cuando la
correspondencia es unívoca, preservando el encabezado literal en citas; faltantes o colisiones
se rechazan.
PSI-142 se intenta pero no se puntúa porque no tiene mapping de registros aprobado; el
resto suma 227 columnas. El denominador de cumplimiento incluye también las columnas de
propuestas fallidas. Se comparan asignación y unidad exactas; no roles ni conversiones.
No se debe equiparar esta métrica al T14 anterior ni llamarla precisión científica antes de D7.

El evaluador PDF usa el vocabulario previamente aprobado del pack, sin aprobar valores nuevos.
Selecciona hasta cuatro páginas físicas con `pressure|atm|kPa|Torr|psi`; no es cobertura completa
del documento. Las respuestas, peticiones, uso de tokens y rechazos permanecen locales.
Una salida 1 en evaluación señala propuestas/candidatos rechazados, no tests unitarios fallidos.

Los cinco originales de la evaluación se obtienen desde las páginas oficiales NTRS enlazadas
en el informe. Descarga reproducible (no ejecutar sobre una carpeta con originales que deban
conservarse; usar carpeta nueva):

```bash
mkdir -p /tmp/t32-pdfs-new
curl -fL 'https://ntrs.nasa.gov/api/citations/20210011385/downloads/TM-20210011385.pdf?attachment=true' -o /tmp/t32-pdfs-new/20210011385.pdf
curl -fL https://ntrs.nasa.gov/api/citations/20150019858/downloads/20150019858.pdf -o /tmp/t32-pdfs-new/20150019858.pdf
curl -fL https://ntrs.nasa.gov/api/citations/20150008961/downloads/20150008961.pdf -o /tmp/t32-pdfs-new/20150008961.pdf
curl -fL https://ntrs.nasa.gov/api/citations/20150023456/downloads/20150023456.pdf -o /tmp/t32-pdfs-new/20150023456.pdf
curl -fL https://ntrs.nasa.gov/api/citations/20120015928/downloads/20120015928.pdf -o /tmp/t32-pdfs-new/20120015928.pdf
python3.12 -I pipeline/ingest.py /tmp/t32-pdfs-new --output /tmp/papers-parsed.json
```

El último PDF no tiene capa de texto en la descarga probada. El parser lo registra sin OCR;
no se sustituye silenciosamente por un documento ajeno. Ver los SHA en el informe.

## Recorrido unificado y reanudable

Crea un manifiesto **local** con rutas absolutas, documentos y páginas físicas opcionales:

```json
{"documents":[
 {"path":"/ruta/PSI-25_Experimental table_BASS-II.csv"},
 {"path":"/ruta/20150023456.pdf","pages":[16]}
]}
```

Una propuesta conjunta requiere un vocabulario revisado explícito. Puede generarse desde el pack existente:

```bash
python3.12 -c 'import json; p=json.load(open("web/public/demo/pack.json")); json.dump([{k:v[k] for k in ("id","label","type","unit") if k in v} for v in p["schema"]["variables"]], open("/tmp/prometeo-t32/vocabulary.json","w"), indent=2)'
export AWS_PROFILE=prometeo
source infra/config.env
python3.12 -I pipeline/ingest_run.py run --manifest /tmp/prometeo-t32/manifest.json \
  --work-dir /tmp/prometeo-t32/run --vocabulary /tmp/prometeo-t32/vocabulary.json \
  --import-results /tmp/prometeo-t32/tables-final --import-results /tmp/prometeo-t32/papers-real
```

Por omisión no hace llamadas. Reusa solo respuestas crudas cuyo modelo, prompt y contenido
coincidan exactamente. `--invoke` autoriza llamadas para solicitudes sin caché; un error se
registra por documento y pide `--retry-failed` para un nuevo intento. Cambiar fuente, parser,
versión de Poppler, páginas, vocabulario o prompt crea una clave nueva. Los artefactos se
conservan por hash; `state.json` apunta al estado vigente. El bloqueo evita dos escritores
sobre el mismo workspace. Copia el workspace al archivarlo: los paths y fuentes son locales.

La salida normal queda en `awaiting_review`; los IDs de variables se prefijan con el hash del
documento. Coincidencias de nombre/unidad aparecen en `possible_merges` y no se fusionan solas.
Una persona edita `state.json`-referenciado `schema_file` o exporta JSON, luego registra cada
decisión con `edit` (la versión se incrementa y cualquier aprobación/extracción previa se
invalida). Ejemplo: `{"op":"set_status","target":"variable","id":"v_...","status":"approved"}`.
Operaciones soportadas: `set_status`, `rename`, `merge`, `set_unit`, `set_convert`,
`map_column`, `set_role`, `set_sigma`. La fusión solo acepta tipo y unidad iguales; equivalencias
distintas requieren decisión y conversión explícitas.

```bash
python3.12 -I pipeline/ingest_run.py edit --work-dir /tmp/prometeo-t32/run \
  --version 1 --edits /tmp/prometeo-t32/revision-1.json
# revisar la nueva versión y completar variables, columnas y constantes antes de aprobar
python3.12 -I pipeline/ingest_run.py approve --work-dir /tmp/prometeo-t32/run \
  --version 2 --reviewer 'Nombre del revisor'
python3.12 -I pipeline/ingest_run.py run --manifest /tmp/prometeo-t32/manifest.json \
  --work-dir /tmp/prometeo-t32/run --vocabulary /tmp/prometeo-t32/vocabulary.json
```

El revisor debe tomar cada decisión usando su identidad; el CLI local guarda el nombre declarado,
pero no autentica una cuenta. No aprueba respuestas del modelo en automático. El hash del
manifiesto y de cada original se vuelve a comprobar antes de aprobar. Un documento fallido
conserva el resto del lote y bloquea la aprobación; corrige la fuente o quítala explícitamente
del manifiesto revisado. La extracción aprobada genera artefactos de borrador separados del pack.
Los PDF requieren páginas seleccionadas en el manifiesto; candidatos verificados por texto
quedan en `awaiting_semantic_review`, sin entrar a registros tabulares. La aprobación de tabla
no convierte una cita PDF en soporte semántico.

Las constantes locales requieren filas destino, `source_value`, `source_unit`, `convert`,
valor canónico, nota, cita y `semantic_support: "reviewed"`. El revisor documenta el alcance;
la extracción rechaza valores que no correspondan a la conversión y retiene ambos documentos
cuando la evidencia proviene de otra fuente.
