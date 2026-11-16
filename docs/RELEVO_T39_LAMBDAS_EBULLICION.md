# Relevo T39: publicar la Lambda y dejar la demo lista con ebullición

**Para:** la persona del equipo con acceso al perfil AWS `prometeo`.
**Rama:** `feat-si` (commit `efdeaa9` o posterior).
**Tiempo estimado:** 30–40 min.
**Reglas:** antes de empezar, lee `AGENTS.md` §5–§8.

---

## 1. Qué necesito de ti

1. Publicar la Lambda `prometeo-hack-api` con el código nuevo de `api/handler.py`.
2. Comprobar que la demo funciona de punta a punta con el corpus de **ebullición**: 23 documentos de PSI, Fluid Physics.

Hoy la demo ya funciona en local, pero **sin IA**. En esta laptop no existe el perfil `prometeo`: el perfil `default` apunta a otra cuenta AWS (970…, no la 352… del proyecto), así que no se publicó nada.

## 2. Qué cambió (T39)

La app tiene un flujo nuevo:

1. **Documents:** se suben los papers y tablas. Un algoritmo determinista ordena las variables detectadas y muestra para cada una su puntuación, el motivo y la cita.
2. **Purpose:** el usuario escribe su prompt.
3. **Dashboard GenUI:** módulos que contestan el prompt.
4. **Your case:** el usuario elige hasta 10 variables y les pone valores. Entonces aparecen niveles, ranking, mapa y huecos.
5. **Chat lateral:** con historial y citas por página o fila.

Spec completo: `docs/superpowers/specs/2026-11-15-genui-dashboard-por-proposito-design.md`.

### Rutas de la API que se publican con este despliegue

| Ruta | Estado antes | Qué hace |
|---|---|---|
| `/chat` | **nueva** | Responde preguntas usando solo los pasajes que manda el navegador. Cada oración debe citar un pasaje real; si no, se descarta. |
| `/design` v2 | **nueva** (`version: 2`) | Elige qué módulos mostrar en el dashboard. Nunca entrega números. |
| `/design` v1 y `/propose` | escritas en `nasa2genui`, **nunca publicadas** | Diseño de reporte y propuesta de variables con citas verificadas. |
| `/ask`, `/analysis`, `/projects*` | publicadas | Sin cambios. |

Detalles importantes:
- **Sin infraestructura nueva.** API Gateway usa la ruta `$default`: las rutas nuevas solo requieren actualizar el código de la Lambda.
- **Sin permisos nuevos.** Se usa el mismo rol, el mismo `bedrock:InvokeModel` y el mismo modelo.
- **`MODEL_ID` no cambia:** `us.anthropic.claude-haiku-4-5-20251001-v1:0` (D6).
- **Arreglo menor:** `pack()` ahora lee con `encoding='utf-8'`. En Lambda no cambia nada; en Windows evitaba un error.

## 3. Pasos

### 3.1 Traer la rama y comprobar AWS

```bash
git fetch origin && git checkout feat-si && git pull
export AWS_PROFILE=prometeo
source infra/config.env && source infra/outputs.env
bash infra/00_check.sh
aws sts get-caller-identity --query Account --output text   # debe ser 352818909129
```

### 3.2 Pruebas antes de publicar

```bash
python3.12 -m venv /tmp/prometeo-venv && /tmp/prometeo-venv/bin/pip install -q -r api/requirements.txt pytest
/tmp/prometeo-venv/bin/python -m pytest api/ -q        # esperado: 195 passed, 1 skipped
cd web && npm ci && npm test && cd ..                  # esperado: 283 passed, 4 skipped
bash scripts/check_agnostic.sh                         # esperado: check_agnostic: OK
```

> **En Windows:** ejecuta vitest desde `D:\` (unidad en mayúscula). Con `d:\` todas las pruebas fallan con "reading 'config'".

### 3.3 Publicar la Lambda

El script es idempotente: actualiza el código y la configuración de la función que ya existe.

```bash
EXTRA_ORIGINS=http://localhost:5173,http://127.0.0.1:5173 bash infra/20_api.sh
```

- `EXTRA_ORIGINS` permite probar desde el servidor de desarrollo además de CloudFront.
- `CF_URL` sigue siendo el origen principal.

### 3.4 Comprobación rápida de rutas

Un cuerpo vacío debe dar **400** (la ruta existe y valida), **no 404**.

```bash
for r in chat design propose ask analysis; do
  printf "%s: " $r; curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "content-type: application/json" -d '{}' "$API_URL/$r"
done
```

**`/chat` con un pasaje real.** El texto viene del manifiesto de ebullición, encabezados de la tabla del experimento MABE (PSI-81):

```bash
curl -s -X POST "$API_URL/chat" -H "content-type: application/json" -d '{
  "question": "Which variables does the Microheater Array Boiling Experiment table record?",
  "snippets": [{"docId": "PSI-81", "docName": "PSI-81_Experimental table_MABE_Experimental_table.csv", "row": 1,
    "text": "Day/GMT | Tests Run | Array | Pressure | Bulk Liquid Temperature | No. of Microheaters | Microheater Temperature | Comments"}]
}'
```

- **Funciona:** HTTP 200 con `"mode":"ai"` y oraciones con `cites`. También es válido `"mode":"template"` si el modelo no citó literalmente; ese caso se rotula en pantalla.
- **Falla:** un **502** indica un problema con Bedrock (ver §5).

**`/design` v2:**

```bash
curl -s -X POST "$API_URL/design" -H "content-type: application/json" -d '{
  "version": 2,
  "instruction": "Where is evidence missing for pressure and bulk liquid temperature?",
  "purpose": "Where is evidence missing for pressure and bulk liquid temperature?",
  "variables": [{"id": "pressure", "label": "Pressure", "type": "numeric", "unit": null},
                {"id": "bulk_liquid_temperature", "label": "Bulk Liquid Temperature", "type": "numeric", "unit": null}],
  "catalog": ["answer_stat", "answer_filter", "distribution", "scatter", "coverage_matrix", "key_papers", "doc_summaries", "variable_scores"]
}'
```

Esperado: 200 con `{"modules":[...]}`. Solo aparecen tipos del catálogo y los ids enviados.

**Desde T40 (15-nov)** la web envía un catálogo más largo y espera también el orden de los bloques:

- Tipos nuevos en `catalog`: `key_figures`, `category_bars`, `group_ranges`, `box_summary`, `cross_tab`, `completeness`, `records_table`.
- Respuesta esperada tras publicar `api/handler.py` de T40: `{"modules":[...],"sections":[...]}`. `sections` solo trae nombres de la lista `highlights`, `answers`, `patterns`, `coverage`, `sources`, `case`.
- **La Lambda publicada antes de T40 no conoce los tipos nuevos.** Con el catálogo largo descarta lo que propone el modelo y devuelve `{"modules": []}` (comprobado el 15-nov); la web usa entonces el layout por reglas y lo rotula "Rule-based". Para que el layout de IA vuelva a aplicarse hay que ejecutar `infra/20_api.sh`.

## 4. Demo con el corpus de ebullición

### 4.1 El corpus (fuera de Git)

- **Ubicación:** `tools/psi/data/dominio_ebullicion/lote/`, con **23 archivos**: 10 tablas CSV y 13 PDF.
- **Manifiesto con DOI y SHA-256:** `docs/t37/manifest_ebullicion.csv`.

Si no tienes el corpus, regenéralo (descarga de PSI):

```bash
python3 -I tools/psi/corpus_dominio.py          # dominio por defecto: ebullicion
```

Para comprobar que los archivos coinciden con el manifiesto:

```bash
python3 -I - <<'PY'
import csv, hashlib, pathlib
lote = pathlib.Path("tools/psi/data/dominio_ebullicion/lote")
for r in csv.DictReader(open("docs/t37/manifest_ebullicion.csv", encoding="utf-8")):
    if r["incluido"] != "True": continue
    f = lote / r["lote"]
    ok = f.exists() and hashlib.sha256(f.read_bytes()).hexdigest() == r["sha256"]
    print("OK " if ok else "MAL", r["lote"])
PY
```

### 4.2 Recorrido de punta a punta (local, con la API ya publicada)

```bash
cd web && npm run dev     # el proxy /api usa API_URL de infra/outputs.env
```

1. Abre `http://localhost:5173` y entra a **New evaluation**.
2. **Documents:** arrastra la carpeta `lote/` (máximo 30 archivos).
   - Debe aparecer *Variables ranked by relevance*, con puntuación, motivos y cita.
   - Con la API arriba, `/propose` agrega variables verificadas.
3. **Purpose:** escribe por ejemplo: *"Which experiments report heat flux and pressure, and where is evidence missing for subcooling and gravity?"*. Luego pulsa **Generate dashboard**.
4. **Dashboard:** revisa que los módulos tengan figura o tabla numerada, procedencia y etiqueta de origen.
5. **Your case:** selecciona 3 o 4 variables (por ejemplo POWER, heat flux, gravity, subcooling) y dales valores dentro del rango de evidencia.
   - Deben aparecer los niveles (texto + icono), la Tabla 1 del ranking, el mapa, la cercanía y los huecos.
   - La variable número 11 debe quedar bloqueada con un aviso.
6. **Chat lateral:** prueba estas cuatro preguntas:

| Pregunta | Respuesta esperada |
|---|---|
| *What is the maximum Heat Flux?* | "Computed locally from the records · not AI", con records citados |
| *What does the MABE report say about pressure?* | "AI answer · each sentence quotes your documents", con documento + página |
| *Is 8 W/cm² safe?* | "Comparison, not prediction" seguido de evidencia (nunca dice "safe") |
| *set pressure to 100* | "Proposed change · not applied", con botón **Apply** |

### 4.3 Cómo saber si la IA está viva o en respaldo local

| Parte | Con la API funcionando | En respaldo (correcto, pero sin IA) |
|---|---|---|
| Layout del dashboard | "Layout chosen by AI · values computed locally" | "Rule-based layout" |
| Chat sobre documentos | "AI answer · each sentence quotes your documents" | "Local search · not AI" |
| Variables | incluye las propuestas por `/propose` | solo las de extracción determinista |

## 5. Si algo falla

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `404` en `/chat` o `/design` | Lambda vieja | Repite §3.3 y confirma que estás en `feat-si` |
| `502 … service unavailable` | Bedrock (acceso o throttling) | `aws logs tail /aws/lambda/prometeo-hack-api --since 10m` · `bash infra/00_check.sh` |
| Error CORS en el navegador (local) | origen no permitido | Repite §3.3 con `EXTRA_ORIGINS`, o usa el proxy `/api` de `npm run dev` |
| `431 Request Header Fields Too Large` | cookies de localhost | El proxy de Vite ya las quita; abre el navegador en incógnito |
| El chat siempre dice "Local search" | `/chat` responde `template` o falla | Revisa los logs; si el modelo no cita literal, el sistema descarta la respuesta a propósito |
| Respuesta lenta (> 29 s) | límite de API Gateway | Reintenta; la interfaz corta a los 20 s y cae al respaldo local |

## 6. Publicar la web (solo después de una revisión humana)

`AGENTS.md` exige que **una persona revise la interfaz** contra §5–§7 antes de `infra/deploy_web.sh`. La lista de puntos está en `docs/PLAN_FASE2.md` §9.2.

- **Si la revisas y está bien:** anótalo en `PROGRESS.md` (quién, fecha y qué revisaste) y luego ejecuta `bash infra/deploy_web.sh`.
- **Si no:** no publiques la web. La demo con la Lambda nueva funciona igual en local con `npm run dev`.

## 7. Al terminar

1. En `PROGRESS.md`, fila **T39**, anota:
   - "Lambda publicada", con fecha;
   - el resultado de §3.4 (códigos y modos);
   - si la web se publicó o no.
2. Agrega una entrada en la bitácora: qué hiciste, la verificación y el siguiente paso.
3. Commit y push en `feat-si`, **sin** líneas `Co-Authored-By` ni firmas de agente. Luego abre un PR de `feat-si` a `main`.

### No cambiar

- `MODEL_ID` (D6).
- No crear servicios ni permisos con `*`.
- `infra/outputs.env` solo lleva IDs y URLs; nunca credenciales.
