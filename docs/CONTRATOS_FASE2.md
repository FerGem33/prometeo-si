# Prometeo — Contratos de la fase 2 (bloques B y C)

14 de noviembre de 2026 · Para quien construye la interfaz y para quien construye el backend · Acompaña a [`PLAN_FASE2.md`](PLAN_FASE2.md)

Este documento fija las formas de datos para que la interfaz y el backend avancen al mismo tiempo. Tiene tres clases de contrato:

| Clase | Estado | Dónde está la fuente única |
|---|---|---|
| **Motor** (bloque B) | **Implementado y probado en `main`.** Se puede usar hoy. | `web/src/engine/extend.ts`, vectores en `extend.test.ts` |
| **Estado local** (bloque B) | **Implementado y probado en `main`** (lógica, sin pantallas). | `web/src/contracts/workspace.ts` |
| **API vigente** (`/ask`, `/analysis`) | Desplegada la versión 1; la versión 2 está en código y **falta desplegarla**. | `api/handler.py`, `api/README.md` |
| **Backend del bloque C** | **Propuesta para aprobar. Nada desplegado.** | `web/src/contracts/backend.ts`, ejemplos en `docs/fixtures/fase2/` |

Si un contrato tiene que cambiar, se cambia primero el archivo fuente y su prueba, y después este documento, en el mismo commit.

## 1. Reparto del trabajo

| Quién | Qué | Toca |
|---|---|---|
| Equipo de interfaz (rama `frontend`) | Pantallas de los bloques B y C; fusión de `frontend` con `main` cuando lo decidan | `web/src/components/`, `web/src/styles/`, `web/src/App.tsx` |
| Agentes de motor y API (rama `main`) | Motor, contratos, Lambda, scripts de infra, pipeline | `web/src/engine/`, `web/src/contracts/`, `api/`, `infra/`, `pipeline/` |

Reglas que evitan choques:
- La interfaz **no calcula** niveles, notas, distancias, hallazgos ni aristas del grafo: los pide al motor. Si falta un dato, se pide una función nueva al motor; no se deriva en un componente.
- Los componentes no llevan textos del dominio: nombres de partes, variables y presets salen de `lens` y `pack`.
- El motor no importa nada de `components/` ni de `contracts/`.
- Interfaz solo en inglés; ningún nivel se comunica solo con color.

## 2. Motor: funciones nuevas (listas para usar)

Todo se importa de `web/src/engine` (`import { assess, graph, … } from "../engine"`). Son funciones puras: mismo `pack`, `lens` y `scenario` → mismo resultado. Cuestan pocos milisegundos; se pueden llamar en cada cambio del escenario dentro de un `useMemo`.

### 2.1 `assess`: todo lo que el informe muestra, en una llamada

```ts
assess(pack: Pack, lens: Lens, scenario: Scenario): Assessment

type Assessment = {
  scenario: Scenario;
  partition: Partition;          // { variable, value, via } | null
  overall: OverallEvidence;      // { level: "strong"|"partial"|"scarce"|"none", counts: {A,B,C,D} }
  coverage: Coverage;            // { full, partial, studiesFull, pool }
  levels: VariableEvidence[];    // nivel por variable activa
  parts: PartEvidence[];         // nivel por parte de la propuesta (2.2)
  ranking: StudyResult[];        // ordenado: nota, faltantes, distancia
  findings: Finding[];
};
```

Es el objeto que se guarda en memoria para comparar "antes y después" (2.4) y dos variantes (CU-17).

### 2.2 `partLevels`: partes de la propuesta (CU-15, CU-16)

`lens.parts` agrupa variables en partes con nombre. En el lens de PSI:

```json
"parts": [
  {"id": "atmosphere",  "label": "Atmosphere",  "variables": ["o2", "p"]},
  {"id": "ventilation", "label": "Ventilation", "variables": ["flow"]},
  {"id": "gravity",     "label": "Gravity",     "variables": ["g"]},
  {"id": "material",    "label": "Material",    "variables": ["material"]}
]
```

```ts
partLevels(lens: Lens, levels: VariableEvidence[]): PartEvidence[]

type PartEvidence = {
  part: string | null;        // id de lens.parts; null = variables activas que no están en ninguna parte
  label: string | null;       // null cuando part es null: la interfaz pone su propia etiqueta ("Other variables")
  level: EvidenceLevel;       // el nivel MÁS DÉBIL de sus variables
  decidedBy: string;          // variable que fija el nivel
  variables: VariableEvidence[];
};
```

Orden de debilidad: `not_studied` < `near` < `scarce` < `studied`. Solo aparecen las partes con alguna variable activa.

Resultado real con el preset lunar (30 % O₂, 0.694 atm, PMMA):

| Parte | Nivel | Lo decide |
|---|---|---|
| Atmosphere | Not studied | `p` (0 de 268 pruebas comparables registran presión) |
| Material | Studied | `material` (PMMA, 91 pruebas en 3 investigaciones) |

La interfaz debe decir por qué una parte tiene ese nivel ("set by Pressure"), no solo mostrarlo.

### 2.3 `explainRank`: por qué un estudio queda donde queda (CU-11)

```ts
explainRank(pack: Pack, scenario: Scenario, studyId: string): RankExplanation | null

type RankExplanation = { study: string; grade: Grade; distance: number | null; nearest: string | null; terms: RankTerm[] };

type RankTerm = {
  variable: string;
  type: "num" | "cat";
  value: number | string;                 // valor del escenario
  recordValue: [number, number] | string | null;   // valor del registro más cercano; null = no lo registra
  status: "inside" | "outside" | "not_recorded" | "same" | "differs";
  gap?: number;                           // distancia al intervalo del registro, en la unidad de la variable
  contribution: number;                   // numérica: gap/σ (entra al cuadrado en d); categórica: la penalización sumada
  tested?: [number, number];              // envolvente del estudio en esa variable
};
```

`d = √Σ(contribución numérica)² + Σ penalizaciones`. Ejemplo real, BASS-II (PSI-25) con O₂ 30, presión 0.69, flujo 5, PMMA:

| Variable | Escenario | Registro más cercano (B1, fila 2) | Estado | Aporte |
|---|---|---|---|---|
| O₂ | 30 % | 22.2 % | outside, 7.8 de diferencia | 1.56 |
| Presión | 0.69 atm | — | not_recorded | 0 |
| Flujo | 5 cm/s | — | not_recorded | 0 |
| Material | PMMA | PMMA | same | 0 |

`nearest` es un id de registro: se abre con el panel de procedencia que ya existe. Un aporte 0 por `not_recorded` **no** es evidencia a favor: la interfaz lo muestra como dato faltante.

### 2.4 `diffAssessment`: qué cambió (CU-17) y comparar dos variantes

```ts
diffAssessment(before: Assessment, after: Assessment): AssessmentDiff

type Direction = "up" | "down" | "same" | "added" | "removed";

type AssessmentDiff = {
  unchanged: boolean;
  values:  { variable: string; from: number | string | null; to: number | string | null }[];
  levels:  { variable: string; from: EvidenceLevel | null; to: EvidenceLevel | null; direction: Direction }[];
  parts:   { part: string | null; from: EvidenceLevel | null; to: EvidenceLevel | null; direction: Direction }[];
  grades:  { study: string; from: Grade; to: Grade; distanceFrom: number | null; distanceTo: number | null; direction: Direction }[];
  findings: { added: Finding[]; removed: Finding[]; changed: { from: Finding; to: Finding }[] };
};
```

- `up` siempre significa **más evidencia**: nivel más fuerte, mejor nota o menor distancia. No significa "mejor diseño".
- Las listas solo traen lo que cambió. `added` y `removed` indican que la variable entró o salió del escenario.
- Para "qué cambió al mover un control": guardar el `Assessment` anterior y comparar con el nuevo. Para comparar dos variantes guardadas: `diffAssessment(assess(a), assess(b))`.

Ejemplo real: bajar el O₂ del preset lunar de 30 % a 21 % → `levels: [{variable:"o2", from:"near", to:"studied", direction:"up"}]`; `parts: []` (la atmósfera sigue en *Not studied* porque la presión sigue sin registrarse); BASS-II pasa de C a B (`distanceFrom: 1.56`, `distanceTo: 0`); desaparece `above_tested:o2` y aparece `within_tested:o2`.

### 2.5 `graph` y `emphasis`: panel de conocimiento (CU-10, CU-11, parte calculada de CU-18)

```ts
graph(pack: Pack, lens?: Lens, opts?: { attributes?: string[]; minStudies?: number; similarity?: number }): Graph
emphasis(results: StudyResult[]): Record<studyId, { study, position, grade, distance, weight }>

type GraphNode = {
  id: string;        // "study:PSI-25" | "variable:o2" | "category:material:PMMA" | "attribute:hardware:<nombre normalizado>"
  kind: "study" | "variable" | "category" | "attribute";
  ref: string;       // id del estudio o de la variable, valor categórico, o nombre del atributo
  label: string;
  group?: string;    // category → id de la variable; attribute → clave del atributo
  degree: number;    // aristas que tocan el nodo
  records: number;   // registros detrás del nodo
};
type GraphEdge = { source: string; target: string; kind: "related" | "attribute" | "variable" | "category"; weight: number; label?: string };
```

| Arista | De dónde sale | Peso |
|---|---|---|
| `related` | `study.related` del repositorio; no dirigida, sin duplicados | 1 |
| `variable` | el estudio tiene registros con esa variable numérica | número de registros |
| `category` | el estudio tiene registros con ese valor categórico; el valor es nodo solo si aparece en 2 o más estudios | número de registros |
| `attribute` | dos estudios comparten un valor de un atributo listado en `lens.graph.attributes` (en PSI: `hardware`); los nombres se comparan sin mayúsculas ni paréntesis y con similitud ≥ 0.9 | 1 |

- **Todas las aristas son calculadas.** La leyenda debe decirlo. Las relaciones afirmadas por autores no existen hasta el bloque C (`pack.claims`, §5.8) y se dibujarán con otro trazo.
- `emphasis(rank(pack, scenario))` da el tamaño y el resalte de cada estudio: `weight` va de 1 (el mejor) a 0 (nota D). No inventar otra escala.
- El motor no da posiciones: el layout es de la interfaz (SVG propio, sin librería de gráficas).

Datos reales para comprobar la pantalla: 24 nodos de estudio; `variable:p` conecta 6 estudios, ninguno de sólidos; `category:material:PMMA` conecta PSI-25, PSI-26 y PSI-99 con 91 registros; con el preset lunar, los estudios resaltados son PSI-25, PSI-99 y PSI-98.

### 2.6 Qué función sirve a qué caso de uso

| Caso de uso | Tarea | Funciones |
|---|---|---|
| CU-10 explorar; CU-18 relaciones calculadas | T21 | `graph`, `emphasis`, `rank` |
| CU-11 por qué este orden | T22 | `explainRank` |
| CU-15, CU-16 partes y mapa de evidencia | T23 | `assess().parts` |
| CU-17 qué cambió | T24 | `diffAssessment` |
| CU-17 variantes; CU-03/04 maqueta | T25, T28 | `contracts/workspace.ts` + `diffAssessment` |
| CU-14 ordenar la comparación | T26 | `closeness`, `rank` (ya existían) |

## 3. Estado local del navegador (bloque B)

Fuente: `web/src/contracts/workspace.ts`. Una sola clave de `localStorage`: `prometeo.workspace/1`.

```ts
type Workspace = { version: 1; projects: LocalProject[] };

type LocalProject = {
  id: string; name: string;
  intent: string;      // texto libre; en el bloque B no se envía a ningún servidor
  pack: string;        // pack.meta.id que lee el proyecto ("psi-fire")
  variants: Variant[];
  created_at: string; updated_at: string;   // ISO 8601
};

type Variant = {
  id: string; name: string;
  scenario: Scenario;                 // { values, active, sigma? }
  axes?: { x: string; y: string };
  note?: string;
  created_at: string; updated_at: string;
};
```

Funciones (puras; devuelven un `Workspace` nuevo): `loadWorkspace(store, pack)`, `saveWorkspace(store, ws)`, `createProject`, `deleteProject`, `saveVariant` (con `id` reemplaza; sin `id` agrega), `deleteVariant`. En el navegador, `store` es `window.localStorage`.

Reglas:
- **Límites:** 20 proyectos, 30 variantes por proyecto, nombre 80 caracteres, intención 500, nota 300.
- **Lectura tolerante:** lo que esté mal formado, o un escenario que ya no sea válido para el pack (variable desconocida, número fuera de rango), se descarta sin error.
- **`saveWorkspace` devuelve `false`** si el navegador no deja guardar: la interfaz lo dice.
- **Texto obligatorio** junto a cualquier lista de proyectos o variantes: "Saved in this browser only". Nunca se presenta como cuenta ni como guardado en servidor.
- **Migración al bloque C:** `Variant` tiene los mismos campos que `Proposal` del backend (§5.7), para subir las variantes locales cuando exista la cuenta (CU-04).

### URL

El escenario ya viaja en la URL: un parámetro por variable (`?o2=30&p=0.694&material=PMMA`), más `x` e `y` para los ejes. Parámetros nuevos reservados, para que los enlaces sigan siendo compartibles:

| Parámetro | Valores | Uso |
|---|---|---|
| `view` | `report` (por defecto), `graph`, `compare` | pantalla |
| `phase`, `source`, `type` | valor de la partición, id de estudio, `attributes.project_type` | filtros de T21; se pueden repetir |
| `vs` | escenario de la segunda variante, mismo formato codificado | comparación de dos variantes |

Ningún nombre de parámetro puede coincidir con un id de variable del pack.

## 4. API vigente: `/ask` y `/analysis`

Base: `VITE_API_URL`. Sin autenticación; CORS solo para el origen del sitio. Límites: cuerpo 128 KB, pregunta 2,000 caracteres, 50 hallazgos.

### 4.1 `POST /ask`

```jsonc
// petición
{ "question": "30% oxygen, 10.2 psi, PMMA", "schema": { /* pack.schema, tal cual */ }, "version": 2 }

// 200, condiciones entendidas
{ "values": {"o2": 30, "p": 0.6941, "material": "PMMA"}, "active": ["o2", "p", "material"], "filters": {},
  "notes": [] }

// 200, la pregunta no describe condiciones (o ninguna fue válida)
{ "unsupported": "Only scenario changes are supported.", "notes": [ {"code": "unknown_category", "variable": "material", "value": "Cotton"} ] }
```

- `version` es opcional. **Sin `version` (o con 1) la respuesta es exactamente la de hoy**, sin `notes`: la interfaz publicada sigue funcionando sin cambios.
- Con `version: 2`, `notes` lista lo que se entendió pero no se aplicó. La interfaz debe mostrarlo ("Cotton is not a category of this corpus").

| `notes[].code` | Significado | Campos |
|---|---|---|
| `unknown_variable` | la pregunta nombra algo que no es variable del esquema | `variable` |
| `unknown_unit` | unidad que el esquema no sabe convertir | `variable`, `unit` |
| `out_of_range` | número fuera de `range` | `variable`, `value`, `range` |
| `unknown_category` | categoría que no existe en el corpus | `variable`, `value` |
| `not_a_number` | valor numérico ilegible | `variable` |
| `duplicate` | la misma variable dos veces; vale la primera | `variable` |

- Las unidades las convierte el código con `display_units` del esquema (psi y kPa para la presión), no el modelo.
- Estados HTTP: `400` petición mal formada o esquema distinto del desplegado; `502` solo si el modelo no respondió (la interfaz muestra "try again", no "unsupported").
- **Estado del despliegue:** lo publicado es la versión anterior, que devuelve 502 con psi y omite la gravedad. El código nuevo está en `main` con pruebas; falta `infra/20_api.sh` (T17).

### 4.2 `POST /analysis`

```jsonc
// petición: salida del motor, sin tocar
{ "scenario": {"values": {...}, "active": [...]}, "levels": [ /* VariableEvidence[] */ ], "findings": [ /* Finding[] */ ] }

// 200
{ "mode": "ai" | "template",
  "sentences": [ {"finding": "never_measured:p", "text": "…", "sources": ["PSI-25", "…"]} ],
  "dropped": 0 }
```

- El servidor recalcula cada hallazgo contra el pack antes de llamar al modelo; un hallazgo alterado devuelve `400`.
- El modelo solo elige y ordena oraciones ya redactadas por el código; una oración que no coincida exactamente se descarta. `mode: "template"` cuando el modelo falla o se descarta más de la mitad: la interfaz lo rotula como plantilla.
- Códigos con oración: `never_measured`, `above_tested`, `below_tested`, `within_tested`, `category_tested`, `full_coverage` y, en el código nuevo, `tested_elsewhere`.
- `api/events/analysis_lunar.json` es la petición real del preset lunar (la genera `web/src/report/events.test.ts`).

## 5. Backend del bloque C (aprobado por el dueño el 15-nov)

Objetivo: que una persona suba su corpus y obtenga un pack `prometeo.pack/1` propio que entra a la misma interfaz y al mismo motor. Tipos completos en `web/src/contracts/backend.ts`; respuestas de ejemplo en `docs/fixtures/fase2/`. Aprobado: drafts y D3 primero, el resto el 15-nov junto con §5.10 (`docs/DECISIONES_CIERRE.md` §1). Desplegado hasta hoy: §5.3 sin DELETE y §5.4 sin DELETE ni `url`; el resto está pendiente (ver `PROGRESS.md`).

### 5.1 Reglas comunes

- **Autenticación:** Cognito. Cabecera `Authorization: Bearer <id token>`. El `uid` sale del token (`sub`), nunca del cuerpo ni de la ruta. Un proyecto ajeno responde `404`, no `403`, para no revelar que existe.
- **Formato:** JSON UTF-8. Fechas ISO 8601 en UTC. Identificadores opacos (`prj_…`, `doc_…`).
- **Errores:** siempre `{"error": {"code", "message", "details?"}}`.

| HTTP | `code` | Cuándo |
|---|---|---|
| 400 | `invalid_request` | el cuerpo no cumple el contrato |
| 401 | `unauthenticated` | token ausente o vencido |
| 404 | `not_found` | no existe o no es del usuario |
| 409 | `conflict` | estado incorrecto (publicar sin aprobar; `version` de esquema vieja) |
| 413 / 422 | `limit_exceeded` | tamaño, páginas o número de documentos (`details.limit`, `details.value`) |
| 429 | `rate_limited` | |
| 502 | `model_unavailable` | el modelo no respondió |
| 500 | `internal` | |

- **Listas:** `{"items": [...], "next_cursor": string | null}`; se pide la página siguiente con `?cursor=`.
- **Escrituras repetibles:** `PUT` y `PATCH` son idempotentes. `POST` que crea acepta la cabecera `Idempotency-Key`.

### 5.2 Ciclo de vida del proyecto

```
draft ──subir documentos──▶ processing ──▶ awaiting_review ──aprobar esquema──▶ processing (extract, verify)
                                │                                                    │
                                ▼                                                    ▼
                             failed                                        ready_to_publish ──publicar──▶ published
```

Etapas por documento (`stage`): `upload → parse → profile → propose → extract → verify`. Estado (`status`): `queued`, `running`, `done`, `failed`, `skipped`. `extract` no empieza hasta que una persona aprueba el esquema: **nada se publica sin aprobación humana**.

### 5.3 Proyectos (CU-03, CU-05)

| Ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /projects` | `{"name", "intent"}` | `201` `Project` |
| `GET /projects` | — | `Page<Project>` |
| `GET /projects/{id}` | — | `Project` |
| `PATCH /projects/{id}` | `{"name"?, "intent"?}` | `Project`. Cambiar `intent` regenera la lente (sube `lens_version`) sin repetir la extracción |
| `DELETE /projects/{id}` | — | `204`. Borra documentos y registros |

```json
{ "id": "prj_demo", "name": "Solid fuel flammability",
  "intent": "Which combinations of oxygen, pressure, flow and material have been studied for a habitat cabin?",
  "status": "awaiting_review",
  "counts": {"documents": 1, "records": 129, "variables": 4, "conflicts_open": 0},
  "pack_version": null, "lens_version": null,
  "created_at": "2026-11-15T06:00:00Z", "updated_at": "2026-11-15T06:05:00Z" }
```

### 5.4 Documentos y procesamiento (CU-05, CU-06, CU-09)

| Ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /projects/{id}/documents` | `{"name", "media_type": "text/csv" \| "application/pdf", "bytes"}` | `201` `UploadTicket` |
| *(subida)* | `PUT` del archivo a `upload.url` con `upload.headers` | `200` de S3 |
| `POST /projects/{id}/documents/{doc_id}/complete` | `{"sha256"}` | `ProjectDocument`; encola el procesamiento |
| `GET /projects/{id}/documents` | — | `Page<ProjectDocument>` |
| `DELETE /projects/{id}/documents/{doc_id}` | — | `204`; solo antes de publicar |
| `GET /projects/{id}/jobs` | — | `JobsResponse` |
| `POST /projects/{id}/ingest/resume` | — | `202`; reencola solo lo pendiente o fallido |
| `POST /projects/{id}/documents/{doc_id}/url` | `{"page"?: int}` | `{"url", "expires_in"}`: lectura del original, vigencia corta (CU-13) |

- El archivo nunca pasa por la Lambda: va directo a S3 con la URL prefirmada (vigencia 5 minutos).
- Un duplicado (mismo `sha256` en el proyecto) queda `skipped` con `error_code: "duplicate"`.
- `error_code` de documento: `unreadable`, `no_text_layer` (PDF escaneado), `too_large`, `too_many_pages`, `duplicate`, `model_unavailable`, `internal`.
- **Progreso:** la interfaz consulta `GET …/jobs` cada 3 s mientras `project_status` sea `processing`. No hay websockets.
- **Límites (D3, decididos el 15-nov):** 20 MB (20 000 000 bytes) por archivo, 60 páginas por PDF, 30 documentos por proyecto. El servidor los devuelve en `details` para que la interfaz no los escriba a mano.

### 5.5 Revisión del esquema (CU-07)

| Ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /projects/{id}/schema` | — | `SchemaProposal` |
| `PATCH /projects/{id}/schema` | `{"version": n, "edits": SchemaEdit[]}` | `SchemaProposal` con `version` n+1; `409` si `version` no es la vigente |
| `POST /projects/{id}/schema/approve` | `{"version": n}` | `SchemaProposal` con `status: "approved"`; arranca `extract` |

`SchemaProposal` trae tres listas: `variables` (lo que el modelo propone medir), `columns` (cada columna de cada tabla, con muestra de valores y su variable, unidad y conversión) y `constants` (valores que aplican a toda una tabla). Cada elemento tiene `status`: `proposed`, `approved`, `flagged` (entra con bandera visible) o `rejected` (no entra).

Operaciones del revisor (`SchemaEdit`): `set_status`, `rename`, `merge` (fusionar variables), `set_unit`, `set_convert` (solo conversiones lineales `factor` y `offset`), `map_column`, `set_role` (marcar la partición), `set_sigma`.

Reglas:
- Aprobar exige que ninguna variable ni columna quede en `proposed`, y que a lo sumo una variable tenga `role: "partition"`.
- Cada variable propuesta trae `evidence`: las citas que justifican su existencia. La pantalla las muestra.
- Ejemplo completo y real: `docs/fixtures/fase2/schema_proposal.json` (la tabla de BASS-II, 17 columnas; `Fan display` llega como `flagged` porque no está en cm/s).

### 5.6 Registros, correcciones y conflictos (CU-08)

| Ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET /projects/{id}/records?variable=&flag=&doc_id=&cursor=&limit=` | — | `Page<RecordDraft>` |
| `PATCH /projects/{id}/records/{rid}` | `{"variable", "value", "reason"}` | `RecordDraft` con `corrections[variable]` |
| `DELETE /projects/{id}/records/{rid}` | `{"reason"}` | `204`; el registro queda excluido, no borrado |
| `GET /projects/{id}/conflicts?status=open` | — | `Page<Conflict>` |
| `POST /projects/{id}/conflicts/{cid}/resolve` | `{"choice": índice \| "keep_all" \| "exclude", "note"?}` | `Conflict` resuelto |

- Cada valor de un `RecordDraft` lleva su `Citation` en `citations[variable]`. Dos formas: `{"kind":"table","doc_id","row","column","text"}` y `{"kind":"paper","doc_id","page","quote","verified"}`.
- Una cita de artículo con `verified: false` (la cita literal no se encontró en el texto del documento) **no entra al pack**; se muestra para que la persona la corrija o la descarte.
- Una corrección conserva el valor original y su cita (`corrections[variable].from`), quién la hizo y por qué. El informe muestra los dos.
- Conflictos: `value_mismatch` (dos fuentes dan valores distintos para la misma prueba), `unit_mismatch`, `duplicate_record`. Publicar exige `conflicts_open == 0`.

### 5.7 Publicar, propuestas, preguntas y síntesis (CU-12, 15, 17, 19, 20)

| Ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /projects/{id}/publish` | — | `PublishResponse`: `pack_version`, `lens_version` y URLs prefirmadas de `pack.json`, `lens.json`, `mapping.json` |
| `GET /projects/{id}/pack` | — | `PublishResponse` de la versión vigente |
| `PUT /projects/{id}/proposals/{pid}` | `{"name", "scenario"}` | `Proposal`; el escenario se valida contra el esquema publicado |
| `GET /projects/{id}/proposals` · `GET …/{pid}` · `DELETE …/{pid}` | — | `Page<Proposal>` · `Proposal` · `204` |
| `POST /projects/{id}/ask` | `{"question", "version": 2}` | igual que §4.1; el esquema lo pone el servidor |
| `POST /projects/{id}/analysis` | igual que §4.2 | igual que §4.2 |
| `POST /projects/{id}/synthesis` | `{"study_ids": [...], "focus"?}` | `{"mode", "sentences": [{"text", "citations": Citation[]}], "dropped"}` |

- La interfaz carga el pack publicado con las tres URLs y usa el motor igual que con la demo. **El motor no sabe si el pack es la demo o un proyecto.**
- La síntesis solo publica oraciones cuyos números y citas estén en los registros de los estudios elegidos; el resto se descarta y se cuenta en `dropped`.

### 5.8 Relaciones y huecos afirmados por autores (CU-18)

`pack.claims` (hoy vacío) recibe elementos `Claim`:

```ts
type Claim = {
  id: string;
  kind: "relation" | "gap";
  variables: string[];
  direction?: "increases" | "decreases" | "non_monotonic" | "no_effect";   // solo en relation
  statement: string;                 // la oración de los autores, literal
  citation: { kind: "paper"; doc_id: string; page: number; quote: string; verified: boolean };
  study: string;
};
```

- Un `Claim` **nunca** entra en distancias, notas ni niveles. Se muestra junto a la variable y, en el grafo, como arista entre variables con trazo distinto al de las calculadas.
- Solo entran los que tienen `citation.verified: true`.

### 5.9 Almacenamiento (para quien construya el backend)

DynamoDB, una tabla, clave `PK` + `SK`:

| Entidad | `PK` | `SK` |
|---|---|---|
| Proyecto | `U#<uid>` | `P#<project_id>` |
| Documento | `P#<project_id>` | `D#<doc_id>` |
| Esquema (versiones) | `P#<project_id>` | `S#<version>` |
| Registro | `P#<project_id>` | `R#<record_id>` |
| Conflicto | `P#<project_id>` | `C#<conflict_id>` |
| Propuesta | `P#<project_id>` | `V#<proposal_id>` |

S3 privado: `u/<uid>/p/<project_id>/raw/<doc_id>` (originales), `…/text/<doc_id>.json` (texto por página), `…/pack/v<n>/{pack,lens,mapping}.json`. Toda ruta que recibe `project_id` comprueba primero que el proyecto es del `uid` del token.

### 5.10 Exportación de datos para modelos (CU-24, CU-25)

No hay ruta nueva en el servidor. La exportación se calcula **en el navegador desde el pack publicado**, demo o proyecto, de forma determinista y sin IA. Para uso programático, `GET /projects/{id}/pack` y `GET /projects/{id}/records` ya entregan los mismos datos con procedencia.

**Base existente:** `harmonizedCsv` (web, `DossierModal`) produce un registro por fila con:
- `*_min` y `*_max` en unidad canónica para cada variable numérica;
- las categóricas y la confianza;
- archivo, fila y página de origen;
- cita literal y banderas.

**Lo que completa T38** para que sirva como conjunto de entrenamiento:

1. Cabecera con unidad canónica (`p_min [atm]`) y columna `doi` por fila.
2. `group_id` = estudio, para dividir entrenamiento y prueba por estudio y evitar fuga de datos.
3. Si hubo corrección (§5.6), el valor corregido y el original en columnas separadas. Los registros excluidos y las citas `verified: false` nunca se exportan (el pack ya no los contiene).
4. `datacard.json` junto al CSV, con:
   - versiones de pack y mapping;
   - conversiones aplicadas y columnas rechazadas;
   - ficha de aptitud con sus umbrales (D4, `lens.ml_thresholds`);
   - DOI y licencia de cada fuente.
5. Textos de interfaz solo descriptivos ("dataset export"). Nunca prometen capacidad predictiva.

## 6. Qué puede empezar hoy el equipo de interfaz

| Pantalla | Depende de | Datos para trabajar |
|---|---|---|
| Panel de conocimiento (T21) | §2.5, listo | pack publicado |
| Por qué este orden (T22) | §2.3, listo | pack publicado |
| Partes y mapa de evidencia (T23) | §2.2, listo | `lens.parts` ya publicado en `main` |
| Qué cambió (T24) | §2.4, listo | — |
| Variantes y comparación (T25), espacio local (T28) | §3 y §2.4, listos | `localStorage` |
| Notas de `/ask` (T17) | §4.1; falta desplegar | simular con los ejemplos de §4.1 |
| Proyectos, subida y progreso (T33, T34) | §5.3 y §5.4, propuesta | `docs/fixtures/fase2/projects.json`, `documents.json`, `jobs.json` |
| Revisión del esquema (T35) | §5.5, propuesta | `schema_proposal.json` |
| Registros y conflictos (T36) | §5.6, propuesta | `records.json` |

Para las pantallas del bloque C, usar un cliente con dos modos (`fixtures` y `http`) detrás de la misma interfaz TypeScript: cuando el backend exista solo cambia el modo. Mientras se trabaje con ejemplos, la pantalla debe decirlo ("Sample data").
