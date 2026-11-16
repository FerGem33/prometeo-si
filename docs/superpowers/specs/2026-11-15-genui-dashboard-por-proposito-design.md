# Spec: Dashboard GenUI guiado por propósito (ejecución en 60 min con agentes)

**Fecha:** 2026-11-15
**Rama:** `frontend` (con el merge de `nasa2genui` ya commiteado)
**Destinatarios:** orquestador (Opus), subagentes Claude Sonnet y agentes DeepSeek (`opencode`).
**Relación:** reemplaza el flujo de `docs/SPEC_PAPER_INTELIGENTE_POR_PROPOSITO.md` (rama `nasa2genui`) donde choquen. Manda `AGENTS.md` (§5–§7) sobre los dos.

---

## 1. Diagnóstico: qué se pidió y qué se construyó

| | Flujo construido hoy | Flujo que se quería |
|---|---|---|
| 1 | `Documents`: sube y parsea (bien) | Sube cualquier paper o documento (igual) |
| 2 | `Interface design`: el texto solo reordena 6 secciones fijas del reporte (`compileUiBlueprint`) | El algoritmo determinista **detecta y puntúa** las variables relevantes, con su motivo |
| 3 | `Variables`: el usuario elige variables **y les pone valores** antes de ver nada | El usuario escribe su **prompt** y el sistema genera un **dashboard (GenUI)** con las respuestas que espera ver |
| 4 | `#report`: el mismo reporte fijo del demo, con el escenario ya puesto | **Después**, el usuario elige **hasta 10 variables**, les pone valores e itera; **entonces** aparecen rankings, niveles y gráficas del motor |

Fallos concretos:

- **No hay puntuación de variables.** `extractVariablesFromDocs` (`web/src/ingest/buildPack.ts:257`) solo junta candidatas; no hay orden por relevancia, ni motivo, ni relación con el propósito.
- **El "GenUI" no genera interfaz.** `UiBlueprint` solo cambia orden, plegado y densidad de secciones fijas. El prompt no produce módulos que contesten la pregunta.
- **No hay límite de variables** y los valores se piden antes del dashboard.
- **El chatbot no es un chat** (`web/src/components/AssistantPanel.tsx`):
  - no guarda historial: cada respuesta borra la anterior;
  - con documentos propios solo entiende preguntas de estadística por regex (`answerLocalQuery`) o comandos "set"; lo demás devuelve "unsupported";
  - con el demo, `/ask` solo **cambia el escenario**; no responde la pregunta;
  - sin `API_BASE` el botón queda deshabilitado en el demo;
  - no busca en el texto de los documentos ni cita página;
  - va al final de la columna, no como panel lateral.
- **API:** `/design` y `/propose` no están desplegados (`POST /design` → 404 el 15-nov). No existe `/chat`. API Gateway usa la ruta `$default`, así que agregar rutas solo pide redesplegar la Lambda (`infra/20_api.sh`), sin servicios nuevos.

---

## 2. Flujo objetivo

```
#scenario                          #processing        #report (corpus propio)
┌───────────────┐  ┌────────────┐  ┌──────────┐  ┌──────────────────────────────────────┬──────────┐
│1 Documents    │→ │2 Purpose   │→ │ parse +  │→ │ A. Dashboard GenUI (respuestas)      │  Chat    │
│ subir + ranking│ │ prompt +   │  │ build    │  │ B. Your case: ≤10 variables + valores│ (sticky) │
│ de variables  │  │ sugerencias│  │ pack     │  │ C. [solo con valores] motor: niveles,│          │
│ (solo lectura)│  │            │  │          │  │    ranking, mapa, cercanía, huecos   │          │
└───────────────┘  └────────────┘  └──────────┘  └──────────────────────────────────────┴──────────┘
```

1. **Documents.** Igual que hoy (subida, hash, parseo, 30 archivos). Al terminar de parsear se muestra la lista de variables detectadas, ordenada por `score`, con sus motivos y su primera cita. Es de solo lectura.
2. **Purpose.** Un `textarea` obligatorio: "What do you want to find out from these documents?". Debajo van sugerencias generadas del corpus con etiquetas reales. El paso `Variables` sale del wizard.
3. **Dashboard (A).** `compileDashboard(purpose, …)` genera de 3 a 8 módulos que contestan el prompt. Todo valor sale de funciones deterministas, con procedencia.
4. **Your case (B).** Selector de variables con su `score`. Máximo `MAX_CASE_VARIABLES = 10`: al llegar a 10 se deshabilitan las demás y aparece el mensaje "Up to 10 variables. Remove one to add another.". Se preseleccionan las 5 de mayor score. Cada variable seleccionada tiene un campo de valor: número con rango de la evidencia y unidad, o `select` si es categórica.
5. **Análisis del caso (C).** Solo cuando al menos una variable tiene valor, `caseToScenario` construye un `Scenario` y se calculan con el motor:
   - niveles (`evidenceLevels`), con `LevelTag`: texto + icono, no solo color;
   - ranking (`rank`, Tabla 1);
   - mapa (`MapFigure`);
   - cercanía (`HeatTable`);
   - huecos (`GapFigure`);
   - hallazgos (`findings`).

   Antes de eso se muestra el texto "Give at least one selected variable a value to compute evidence levels, the ranking and the gap figures." **No hay gráficas vacías ni datos de relleno.**
6. **Chat** en columna lateral fija desde ≥ 1100 px; en pantallas angostas va plegable al final. Funciona en todas las etapas del reporte (§7).

El reporte del demo (corpus PSI desde la portada) **no cambia**, salvo el chat (§7).

---

## 3. Contratos (los escribe el orquestador en F0, antes de lanzar agentes)

Carpeta nueva `web/src/genui/` (lógica pura, sin DOM) y `web/src/components/genui/` (presentación).

### 3.1 `web/src/genui/types.ts`

```ts
import type { Scenario } from "../engine";
import type { VariableCitation } from "../ingest/types";

export const MAX_CASE_VARIABLES = 10;
export const DEFAULT_CASE_VARIABLES = 5;
export const MAX_MODULES = 8;

export interface ScoreParts { coverage: number; frequency: number; position: number; purpose: number; measurability: number } // cada uno en [0,1]

export interface VariableScore {
  id: string; label: string; unit: string | null; type: "numeric" | "categorical";
  score: number;                                   // [0,1], redondeado a 3 decimales
  parts: ScoreParts;
  docCount: number;                                // documentos distintos que la citan
  mentions: { header: number; finding: number; text: number };
  reasons: string[];                               // inglés: "appears in 7 of 10 documents"
  citations: VariableCitation[];                   // nunca vacío (sin cita no entra)
}

export type ModuleOrigin = "local" | "ai";
interface ModuleBase { id: string; title: string; caption: string; origin: ModuleOrigin }
export type ModuleSpec =
  | (ModuleBase & { type: "answer_stat"; variable: string; stat: "max" | "min" | "mean" | "count" })
  | (ModuleBase & { type: "answer_filter"; variable: string; op: "<" | ">" | "<=" | ">=" | "between"; bounds: number[] })
  | (ModuleBase & { type: "distribution"; variable: string })
  | (ModuleBase & { type: "scatter"; x: string; y: string })
  | (ModuleBase & { type: "coverage_matrix"; variables: string[] })
  | (ModuleBase & { type: "key_papers"; limit: number })
  | (ModuleBase & { type: "doc_summaries" })
  | (ModuleBase & { type: "variable_scores"; limit: number });
export type ModuleType = ModuleSpec["type"];

export interface DashboardSpec {
  purpose: string; title: string; modules: ModuleSpec[];
  dropped: { module: unknown; reason: string }[];
  suggestedQuestions: string[];                    // para el chat, con etiquetas reales
  origin: ModuleOrigin;                            // "ai" solo si /design v2 aportó ≥1 módulo válido
}

export interface CaseState { selected: string[]; values: Scenario["values"] }

export interface HistogramBin { from: number; to: number; count: number; records: string[] }
export interface Histogram { variable: string; unit: string | null; n: number; min: number; max: number; bins: HistogramBin[] }
export interface CoverageCell { docId: string; variable: string; found: boolean; page?: number; row?: number; quote?: string }
export interface CoverageMatrix { docs: { id: string; name: string }[]; variables: { id: string; label: string }[]; cells: CoverageCell[] }
export interface PaperRelevance { docId: string; name: string; title?: string; doi?: string; year?: number; score: number; shared: string[]; reasons: string[] }
export interface DocSummary { docId: string; name: string; kind: "table" | "paper"; title?: string; doi?: string; year?: number;
  pages?: number; rows?: number; variables: { id: string; label: string; page?: number; row?: number }[]; text: string; mode: "template" }

export interface ChatCitation { docId: string; docName: string; page?: number; row?: number; quote: string }
export type ChatMode = "local_stat" | "local_search" | "ai" | "case_change" | "guard" | "error";
export interface ChatTurn { id: string; role: "user" | "assistant"; text: string; mode?: ChatMode;
  citations?: ChatCitation[]; records?: string[]; proposal?: Scenario }
export interface Snippet { docId: string; docName: string; page?: number; row?: number; text: string; score: number }
```

### 3.2 Firmas (F0 crea los archivos como *stubs* que compilan; cada agente los reemplaza)

| Archivo | Firmas | Dueño |
|---|---|---|
| `genui/score.ts` | `scoreVariables(docs: UploadedDoc[], vars: ExtractedVariable[], purpose: string): VariableScore[]` · `defaultSelection(scores: VariableScore[], n = DEFAULT_CASE_VARIABLES): string[]` | S1 |
| `genui/stats.ts` | `histogram(pack: Pack, variable: string, bins?: number): Histogram \| null` · `coverageMatrix(docs, vars, ids: string[]): CoverageMatrix` · `paperRelevance(docs, vars, purpose: string, scenario?: Scenario): PaperRelevance[]` · `docSummaries(docs, vars): DocSummary[]` | S1 |
| `genui/compile.ts` | `compileDashboard(purpose: string, pack: Pack, scores: VariableScore[], remote?: unknown): DashboardSpec` · `suggestPurposes(scores: VariableScore[]): string[]` | S2 |
| `genui/validate.ts` | `validateModules(raw: unknown, pack: Pack): { modules: ModuleSpec[]; dropped: DashboardSpec["dropped"] }` | S2 |
| `genui/case.ts` | `toggleVariable(c: CaseState, id: string): { next: CaseState; error?: "limit" }` · `setValue(c, id, v): CaseState` · `caseToScenario(c: CaseState): Scenario \| null` | S2 |
| `genui/retrieve.ts` | `chunkDocs(docs: UploadedDoc[], pack: Pack): Snippet[]` · `retrieve(q: string, chunks: Snippet[], k = 5): Snippet[]` | S4 |
| `genui/chat.ts` | `isPredictionQuestion(q: string): boolean` · `routeQuestion(q: string, ctx: ChatContext): Promise<ChatTurn>` | S4 |
| `components/genui/*.tsx` | un componente por tipo de módulo; props definidas en el stub (§9.3) | D1–D9 |
| `components/GenUIDashboard.tsx` | `GenUIDashboard(props: { draft: EvaluationDraft; scenario; setScenario; axes; setAxes })` | S6 |

`EvaluationDraft` (`ScenarioStep.tsx`) gana campos opcionales en F0: `purpose?: string; scores?: VariableScore[]; dashboard?: DashboardSpec; caseState?: CaseState`.

---

## 4. Algoritmo determinista de variables (S1)

`score = 0.30·coverage + 0.20·frequency + 0.15·position + 0.25·purpose + 0.10·measurability`

| Componente | Cálculo (cada uno en [0,1]) |
|---|---|
| `coverage` | documentos distintos que citan la variable / total de documentos parseados |
| `frequency` | `log(1+m)/log(1+mMax)`, con `m = 3·cabeceras/columnas + 2·hallazgos numéricos en PDF + 1·menciones en texto` (menciones: el label como palabra completa en `paper.pages[].text`) |
| `position` | 1 si aparece en el título o en la página 1 (resumen); 0.5 si aparece en la última página o junto a "conclusion(s)/conclusiones"; si no, 0 |
| `purpose` | tokens del label (minúsculas, sin acentos, sin stopwords ES/EN, sin sufijo plural) presentes en el propósito / tokens del label. Vale 0 mientras no haya propósito |
| `measurability` | 1 si es numérica con unidad y valores; 0.6 si es numérica sin unidad; 0.3 si es categórica con ≥2 categorías; 0 en otro caso |

- **Desempate estable:** `score` desc → `docCount` desc → `label` asc → `id` asc.
- **Exclusiones:** variables sin cita y columnas de resultado (`isOutcomeColumn`).
- **`reasons[]`:** solo componentes > 0, en inglés:
  - "appears in 7 of 10 documents";
  - "3 table headers · 5 numeric findings";
  - "on page 1 of 2 documents";
  - "matches the purpose: pressure";
  - "numeric with unit (kPa)".
- Los pesos se documentan también en la sección Methods del dashboard.
- **Pruebas** (`genui/score.test.ts`) con datos reales: `tools/psi/seed/tests.csv` parseado con `parseTabularDocument`, más los fixtures de `ingest/*.test.ts`.
  - Mismo input → mismo orden.
  - Hay `reasons` presentes.
  - Una variable sin cita no aparece.
  - Con el propósito "oxygen and pressure limits", `o2_*` y `p_*` quedan en el top 5.

---

## 5. GenUI: del prompt a módulos (S2 + S3)

### 5.1 Compilador local (siempre corre; es la base)

`compileDashboard` detecta en el propósito, en inglés y en español:
- **variables mencionadas:** tokens del label y alias; reutiliza los alias de `localAsk.ts`, que S2 exporta;
- **intenciones**, con la tabla siguiente.

| Intención (palabras clave EN/ES) | Módulo |
|---|---|
| max/maximum/highest/máximo, min/lowest/mínimo, average/mean/promedio/media, how many/count/cuántos + variable | `answer_stat` |
| above/below/over/under/between/mayor/menor/entre + número + variable | `answer_filter` (se reutiliza el parser de `answerLocalQuery`) |
| distribution/range/spread/distribución/rango | `distribution` (variables mencionadas o las 2 numéricas de mayor score) |
| relation/correlation/vs/compare/relación/comparar | `scatter` (las 2 numéricas mencionadas o de mayor score) |
| gaps/coverage/missing/not studied/huecos/brechas/cobertura | `coverage_matrix` (top 8 por score) |
| papers/studies/sources/relevant/estudios/artículos/clave | `key_papers` (limit 5) |
| summary/summarize/overview/resumen | `doc_summaries` |
| (siempre, al final) | `variable_scores` (limit 20) |

- Si no se detecta ninguna intención, se usa este conjunto por defecto: `key_papers`, `coverage_matrix`, `distribution` de la numérica de mayor score y `variable_scores`.
- Las respuestas (`answer_*`) van primero.
- Se eliminan duplicados y se recorta a `MAX_MODULES`.
- **Títulos y pies:** se arman con plantillas en inglés y labels reales, por ejemplo `Distribution of ${label} (${unit})`. Ningún componente lleva texto de dominio.
- **`suggestedQuestions`:** 4 preguntas armadas con los labels de mayor score, por ejemplo `What is the maximum ${label}?`.

### 5.2 IA opcional (`/design` v2)

- Si `/design` responde, `remote.ts` envía `{version: 2, purpose, variables: top 30 scores (id, label, type, unit), catalog: ModuleType[]}`.
- El backend (S3) devuelve `{modules: ModuleSpec[]}`, ya filtrado por la lista de tipos permitidos.
- En el front, `validateModules` vuelve a validar:
  - el tipo existe;
  - las variables existen en el pack;
  - `scatter` y `distribution` usan variables numéricas;
  - `bounds` son números finitos;
  - `limit` está entre 1 y 20.
- Los módulos inválidos van a `dropped` con su motivo y se registran con `console.warn`; no rompen nada.
- Si queda al menos un módulo válido, se usa el conjunto de la IA con `origin: "ai"` y la etiqueta "Layout chosen by AI · every value computed locally".
- Si no queda ninguno, o la API falla, se usa el compilador local con la etiqueta "Rule-based layout".
- **La IA nunca entrega números.** Todos los valores los calculan `stats.ts`, `localAsk.ts` o el motor.

### 5.3 Adenda T40: estructura base flexible y más formas de representación

Pedido del dueño (15-nov): el resultado se adapta a lo que se quiere, usa más formas de representar la información y sigue una estructura base que no es rígida.

**Estructura base (`web/src/genui/layout.ts`).** La página se arma con bloques. El orden base es:

1. `highlights` — cifras clave;
2. `answers` — respuestas directas;
3. `patterns` — distribuciones y relaciones;
4. `coverage` — cobertura y huecos;
5. `sources` — documentos;
6. `case` — el caso del usuario y su análisis.

Reglas de orden (`blockOrder`, `arrange`):

- `highlights` y `answers` siempre van primero.
- Un bloque que el propósito pide pasa adelante, en el orden en que el propósito lo nombra (posición de la primera palabra clave).
- El caso solo se adelanta si el propósito habla de un caso ("my case", "what if", "mi caso").
- Una sección sin módulos no se muestra. El caso aparece una sola vez. `Methods` cierra la página.
- Dentro de una sección, dos módulos de medio ancho consecutivos comparten fila; los tipos que necesitan toda la columna nunca se estrechan.
- Las figuras y tablas se numeran en el orden en que se muestran.
- Un dashboard guardado antes de T40 (sin `section`, `span` ni `order`) se dibuja con los valores por defecto de cada tipo.

**Tipos de módulo nuevos** (`types.ts`, `stats.ts`, `components/genui/`):

| Tipo | Qué muestra | Sección por defecto |
|---|---|---|
| `key_figures` | registros y rango probado (mín–máx) de hasta 4 variables numéricas; cada valor abre su registro | `highlights` |
| `records_table` | los registros en un extremo de una variable, con otras columnas | `answers` |
| `category_bars` | barras: registros por categoría | `patterns` |
| `group_ranges` | rango y mediana por grupo (documento o categoría); marca el valor del caso si existe | `patterns` |
| `box_summary` | cuartiles de varias variables numéricas con un diagrama de caja por fila | `patterns` |
| `cross_tab` | tabla cruzada de dos variables; la última fila y columna cuentan los registros que no reportan la otra variable | `patterns` |
| `completeness` | porción de registros y de documentos que reportan cada variable | `coverage` |

- Una intención da una forma principal y puede sumar una segunda forma de la misma evidencia. Si la página se llena (`MAX_MODULES = 10`), las segundas formas se quitan primero.
- **Vacíos visibles:** `cross_tab` construye los ejes con todos los registros, así que una categoría sin la otra variable conserva su fila de ceros. Vector: 0 de 268 pruebas de sólidos registran presión.
- **Vectores con datos reales** (`stats.test.ts`): máximo de O₂ en sólidos 22.2 % (BASS-II) y 0 de 268 sólidos con presión.

**IA (`/design` v2).**

- El modelo puede proponer los tipos nuevos, `section` y `span` por módulo, y `sections` (orden de bloques). Son listas cerradas: un valor desconocido se ignora y vale el del tipo. No hay texto libre nuevo.
- Los módulos que las reglas derivan del propósito se conservan después de los de la IA, sin repetir un módulo. Si el propósito no nombra ninguna intención, no se añade el conjunto general.
- `ProcessingStep` espera la respuesta de `/design` hasta 4 s después de la animación; antes el layout de IA se descartaba si llegaba tarde. "Skip to report" sigue siendo inmediato.
- Sigue pendiente verificar los títulos y pies que escribe la IA (§5 de `AGENTS.md`); T40 no cambió eso.

---

## 6. Caso del usuario e iteración (S2 lógica, S6 UI)

- **`toggleVariable`:**
  - Si ya hay 10 seleccionadas, devuelve `error: "limit"` y no cambia el estado.
  - Al quitar una variable, también se borra su valor.
- **`caseToScenario`:** usa como `active` solo las seleccionadas que tienen valor. Si ninguna tiene valor, devuelve `null` y la sección C no se calcula.
- **Valores:**
  - numéricos dentro del rango de la variable en el pack, con `NumField`;
  - categóricos limitados a las categorías del pack.
- **Pruebas** (`genui/case.test.ts`):
  - la 11.ª variable da `limit`;
  - quitar una variable borra su valor;
  - `null` sin valores;
  - el resultado es determinista.
- **Control con el demo** (no cambia): los vectores de `golden.test.ts` siguen pasando. Con el caso lunar (30 % O₂, 10.2 psi), el O₂ para sólidos no sale como `studied`.

---

## 7. Chat lateral (S4 front, S3 back)

### 7.1 Enrutador (`genui/chat.ts`)

`routeQuestion` es puro y testeable. Recibe `post` inyectado y prueba en este orden:

1. **Predicción** (`isPredictionQuestion`: "is it safe", "will it", "predict", "¿es seguro", "¿va a", "¿arderá"):
   - responde con `mode: "guard"`: "Prometeo compares conditions with the evidence; it does not predict outcomes. Here is what the documents cover:";
   - sigue al paso 4 para dar evidencia.
2. **Comando de caso** (regex `SET_COMMAND` actual + `interpretLocalQuestion`):
   - devuelve `mode: "case_change"` con `proposal`;
   - la UI muestra un botón **Apply**. **Nunca se aplica solo.**
3. **Estadística o filtro local** (`answerLocalQuery`): `mode: "local_stat"`, con los records citados y la etiqueta "Computed locally from the records · not AI".
4. **Búsqueda en documentos:** `retrieve(q, chunkDocs(docs, pack), 5)`.
   - Los chunks salen de `paper.pages` (≈600 caracteres, con página) y de filas de tablas (con fila).
   - En el demo, salen de `pack.studies` y `pack.sources` (título, objetivo).
   - El ranking es BM25 simple, con tokens sin acentos ni stopwords.
5. **Con API:** `POST /chat` con `{question, history (≤6 turnos), snippets, variables (≤30: id, label, unit, min, max)}`.
   - La respuesta se acepta solo si cada oración trae citas cuya `quote` es subcadena de un snippet enviado.
   - Resultado: `mode: "ai"`, etiqueta "AI answer · each sentence quotes your documents".
6. **Sin API, con error o con timeout de 20 s:** `mode: "local_search"`.
   - Texto: "Closest passages in your documents (local search · not AI)".
   - Muestra los 3 mejores snippets con documento + página o fila.

### 7.2 UI (`components/ChatPanel.tsx`)

- **Historial:** máximo 20 turnos, con desplazamiento al último.
- **Teclado:** Enter envía y Shift+Enter hace salto de línea.
- **Estado:** indicador de ocupado y `abort` al desmontar.
- **Texto del usuario:** se pinta como texto, nunca como HTML.
- **Etiqueta de modo** en cada respuesta, siempre visible.
- **Citas** clicables: los records abren `Provenance` (`Src`); las citas de documento muestran nombre · p. N, con la cita completa en `title`.
- **Chips de preguntas:** salen de `dashboard.suggestedQuestions` o de `lens.questions` en el demo.
- **CSS** (`styles/chat.css`):
  - columna `position: sticky; top: 1rem; max-height: calc(100vh - 2rem)`;
  - sin sombras ni radios > 4 px.
- **Demo:** `AssistantPanel` conserva solo el bloque "Analysis" (`/analysis` con plantilla de respaldo). Su formulario se reemplaza por `ChatPanel`, que en el demo usa `/ask` para los comandos de caso.

### 7.3 Backend `/chat` (S3, en `api/handler.py`)

- **Validación de la petición:**
  - `question` de 1 a 2000 caracteres;
  - `snippets` ≤ 12, cada uno ≤ 800 caracteres;
  - `history` ≤ 6;
  - body ≤ 128 KB (el límite actual).
- **Prompt:**
  - pide responder **solo** con los snippets;
  - el texto del usuario va delimitado como dato;
  - el formato es JSON `{"sentences":[{"text":"…","cites":[{"docId":"…","page":n,"row":n,"quote":"…"}]}]}`;
  - prohíbe predicciones.
- **Verificación:**
  - las comillas se normalizan (espacios, comillas tipográficas);
  - si la cita no es subcadena del snippet con ese `docId`, se descarta la oración;
  - si no queda ninguna oración: `{"mode":"template","sentences":[]}`.
- **Errores:** 502 genérico, sin filtrar detalles del proveedor (mismo patrón que `/design`).
- **Modelo:** `MODEL_ID`, Haiku 4.5 (D6). No se cambia.
- **`/design` v2:** acepta `version: 2` + `purpose` + `catalog` y devuelve `modules`, saneados con la lista de tipos permitidos. La v1 queda intacta.
- **Pruebas** (`api/test_genui_chat.py`, con `model_json` simulado):
  - caso feliz;
  - cita inventada → descartada;
  - payload inválido → 400;
  - fallo del modelo → 502 sin detalles;
  - `/design` v2 filtra tipos y variables desconocidos.

---

## 8. Reglas para todos los agentes (van en cada prompt)

1. **Archivos:**
   - Toca **solo** tus archivos (tabla §9). Si necesitas un cambio en otro archivo, dilo en tu reporte final; no lo hagas.
   - Sin `git` (commit, add, checkout, stash). Solo el orquestador hace commits.
   - Sin dependencias nuevas ni `npm install`.
2. **Contenido de la interfaz:**
   - UI en inglés.
   - Sin vocabulario de dominio en `web/src/genui/` ni en `components/genui/`: no uses flame, fire, oxygen, habitat, psi, moon, lunar, combust ni nasa. `scripts/check_agnostic.sh` se amplía a esas carpetas.
   - Prometeo **compara, no predice**: nunca "safe", "will burn" ni "won't burn".
   - Todo valor visible con procedencia. Sin números inventados ni datos de ejemplo.
   - Ningún nivel solo con color: siempre texto + icono o patrón. "Not studied" y "Scarce evidence" con el mismo peso visual que "Studied".
3. **Diseño "artículo":**
   - Colores: papel `#FDFCF9`, tinta `#1D1C1A`, acento único `#A3271B`, nota A `#2F6A4E`, nota B `#9A6B0F`.
   - Tipos: EB Garamond para texto; Fira Sans / Fira Sans Condensed para UI, figuras y tablas.
   - Prohibido: gradientes, sombras, radios > 4 px, emojis y tarjetas flotantes.
   - Figuras y tablas numeradas con pie ("Figure 3 · …").
4. **Gráficas en SVG a mano**, sin librerías:
   - ejes con label y unidad;
   - marcas en tinta y la marca destacada en acento;
   - `role="img"` + `<title>`/`<desc>`;
   - cada marca enlaza su record vía `Src`.
5. **Verificación antes de terminar:**
   - `cd web && npx tsc --noEmit -p .`: arregla solo los errores de tus archivos;
   - `npx vitest run <tus tests>`.
6. **Reporte final** (≤ 15 líneas): archivos tocados, pruebas que pasan y lo que quedó pendiente.

---

## 9. Reparto de agentes

### 9.1 Claude Sonnet (Agent tool, `model: "sonnet"`, en segundo plano, mismo árbol de trabajo)

| ID | Tarea | Archivos que posee | Caja |
|---|---|---|---|
| **S1** | Puntuación de variables + estadísticas (`histogram`, `coverageMatrix`, `paperRelevance`, `docSummaries`) | `genui/score.ts`, `genui/stats.ts`, `genui/score.test.ts`, `genui/stats.test.ts` | 25 min |
| **S2** | Compilador GenUI, validación, caso ≤10, exportar alias y respuestas estructuradas de `localAsk`, `requestRemoteDashboard` | `genui/compile.ts`, `genui/validate.ts`, `genui/case.ts` + tests, `ingest/localAsk.ts` (solo exports nuevos: `aliasesOf`, `statAnswer`, `filterAnswer`), `ingest/remote.ts` (solo agregar), `scripts/check_agnostic.sh` | 25 min |
| **S3** | Backend: `/chat` + `/design` v2 con verificación de citas | `api/handler.py`, `api/test_genui_chat.py` | 25 min |
| **S4** | Chat: enrutador, búsqueda local, panel lateral; recortar `AssistantPanel` a "Analysis" | `genui/chat.ts`, `genui/retrieve.ts` + tests, `components/ChatPanel.tsx`, `components/AssistantPanel.tsx`, `styles/chat.css` | 30 min |
| **S5** | Flujo: wizard `Documents → Purpose`; ranking de variables en el paso 1; draft con `purpose/scores/dashboard/caseState`; el pack incluye **todas** las variables puntuadas; `ProcessingStep` las pasa; `App.tsx` monta `GenUIDashboard` para corpus propio | `components/ScenarioStep.tsx` + `.test.ts`, `components/ProcessingStep.tsx`, `App.tsx`, `state.ts` | 30 min |
| **S6** | `GenUIDashboard`: encabezado (propósito, corpus), registro tipo→componente, sección A, sección B (picker + valores), sección C condicionada (reusa `RankingTable`, `MapFigure`, `HeatTable`, `GapFigure`, `LevelTag`, `FindingsList`), Methods con los pesos, columna del chat | `components/GenUIDashboard.tsx`, `genui/registry.tsx`, `styles/dashboard.css` | 30 min |

### 9.2 DeepSeek (`opencode`, `deepseek/deepseek-v4-pro`, en segundo plano)

Comando por agente (prompt en un archivo del scratchpad, log por agente):

```bash
cd /d/CODING/Prometeo/web && opencode run -m deepseek/deepseek-v4-pro --auto \
  --title "D1 AnswerStat" "$(cat "$PROMPTS/D1.md")" > "$LOGS/D1.log" 2>&1
```

Cada componente es presentacional: recibe los datos ya calculados por props y no calcula niveles, rankings ni estadísticas.

| ID | Archivo (reemplaza el stub de F0) | Props (las fija el stub) | Caja |
|---|---|---|---|
| **D1** | `components/genui/AnswerModule.tsx` | `{ spec: answer_stat\|answer_filter; answer: LocalAnswer \| { unsupported: string }; figure: number }`: cifra grande en Fira Sans, frase, records citados con `Src` (máx. 12 + "and N more") | 12 min |
| **D2** | `components/genui/DistributionModule.tsx` | `{ spec; histogram: Histogram \| null; figure }`: histograma SVG con eje y unidad y n visible; `null` → "No numeric values recorded for this variable." | 15 min |
| **D3** | `components/genui/ScatterModule.tsx` | `{ spec; points: { record: string; x: number; y: number; label: string }[]; xLabel; yLabel; figure }`: dispersión SVG; punto → `Src` | 15 min |
| **D4** | `components/genui/CoverageMatrixModule.tsx` | `{ spec; matrix: CoverageMatrix; figure }`: tabla documento × variable; celda con símbolo + texto ("● p. 4" / "○ not found"), cita en `title`; totales por fila y columna | 15 min |
| **D5** | `components/genui/KeyPapersModule.tsx` | `{ spec; papers: PaperRelevance[]; figure }`: lista numerada; título, año, DOI enlazado, variables compartidas, motivos | 12 min |
| **D6** | `components/genui/DocSummariesModule.tsx` | `{ spec; summaries: DocSummary[]; figure }`: una entrada por documento con la etiqueta "Template summary · not AI" | 12 min |
| **D7** | `components/genui/VariableScoresModule.tsx` | `{ scores: VariableScore[]; selected: string[]; onToggle(id): void; limitHit: boolean; figure }`: tabla con rank, label, unidad, score (barra de texto + número), motivos, checkbox; contador "7 / 10 selected"; mensaje de límite con `role="status"` | 15 min |
| **D8** | `components/genui/CaseInputsModule.tsx` | `{ variables: Variable[]; values; onValue(id, v): void }`: un campo por variable seleccionada (`NumField` con rango y unidad; `select` para categóricas); botón "Clear value" | 12 min |
| **D9** | `components/genui/ModuleFrame.tsx`, `components/genui/DocCite.tsx`, `styles/genui.css` | `ModuleFrame { kind: "Figure"\|"Table"; n; title; caption; origin; children }` con pie numerado y etiqueta de origen; `DocCite { citation: ChatCitation \| VariableCitation }` | 12 min |
| **D10** | (`deepseek/deepseek-flash`, en F2) `i18n/es/genui.ts` + registro en `i18n/es/index.ts` | traducciones ES de todas las cadenas nuevas | 8 min |

### 9.3 Por qué funciona en paralelo sin choques

- F0 deja **todos** los archivos nuevos creados como stubs que compilan, con sus props definitivas. S5 y S6 importan rutas reales desde el minuto 0 y DeepSeek solo sobrescribe el cuerpo.
- Cada archivo tiene un único dueño. Archivos compartidos con dueño explícito:
  - `localAsk.ts` y `remote.ts`: S2;
  - `App.tsx`: S5;
  - `AssistantPanel.tsx`: S4.
- Se trabaja sin worktrees: fusionar 15 ramas cuesta más que la regla de dueño único.

---

## 10. Cronograma (minutos desde la luz verde)

| Min | Fase | Quién | Qué | Sale con |
|---|---|---|---|---|
| 0–7 | **F0** | Orquestador | Commit del merge pendiente; traer `docs/SPEC_PAPER_INTELIGENTE_POR_PROPOSITO.md` de `nasa2genui`; escribir `genui/types.ts` + stubs + campos del draft; fila T39 `en curso` en `PROGRESS.md`; escribir prompts | `tsc` limpio, commit `T39 F0: contratos GenUI` + push |
| 7–37 | **F1** | S1–S6 + D1–D9 en paralelo | Implementación según §9 | Reporte de cada agente |
| ~30 | F1b | Orquestador | Al llegar S3: `pytest api/`; si se aprobó, `infra/20_api.sh` | `/chat` y `/design` responden 400 a body vacío (no 404) |
| 37–47 | **F2** | Orquestador + dueños | `tsc`, `vitest`, `check_agnostic`, `build`; los errores vuelven a su dueño (`SendMessage` a Sonnet, o se relanza opencode con el log); D10 traduce | Todo en verde, commit `T39 F2: integración` |
| 47–56 | **F3** | Orquestador | Prueba de punta a punta en el navegador (§11.2) con capturas | Recibo en `docs/` |
| 56–60 | **F4** | Orquestador | Bitácora y "siguiente paso" en `PROGRESS.md`; commit + push. **Sin `deploy_web.sh`**: sigue pendiente la revisión humana de §9.2 | `T39: dashboard GenUI por propósito` |

---

## 11. Verificación y aceptación

### 11.1 Automática (todas deben pasar)

```bash
cd web && npx tsc --noEmit -p . && npm test && npm run build
python -m pytest api/
bash scripts/check_agnostic.sh   # ampliado a genui/ y components/genui/
```

Pruebas nuevas mínimas:
- `score`: orden estable, motivos presentes, sin cita no entra, top 5 con propósito.
- `compile` / `validate`: cada intención produce su módulo; un módulo inválido va a `dropped`; tope de 8.
- `case`: tope de 10; `null` sin valores.
- `chat` / `retrieve`: orden del enrutador, guarda de predicción, sin API → `local_search`, cita inventada rechazada.
- `api/test_genui_chat.py`.

Línea base actual: 218 pruebas web pasan y `tsc` está limpio. No puede bajar.

### 11.2 Manual (F3)

1. `#scenario` → subir `tools/psi/seed/tests.csv` y un PDF NTRS local.
   - Aparecen las variables ordenadas con score, motivos y cita.
2. Purpose: "Which studies test oxygen above 21 % and where are the gaps in pressure?"
   - El dashboard muestra `answer_filter`, `coverage_matrix`, `key_papers` y `variable_scores`.
   - Cada módulo tiene figura numerada, procedencia y etiqueta de origen.
3. Antes de poner valores no hay ranking ni niveles; se ve el texto de §2.5.
4. Seleccionar variables: la 11.ª queda bloqueada con mensaje.
   - Al poner un valor en 2 variables aparecen niveles (texto + icono), Tabla 1 ranking, mapa y huecos.
   - Al cambiar un valor, todo se recalcula.
5. Chat:
   - "What is the maximum o2?" → `local_stat` con records;
   - "What does the paper say about flow?" → `ai` con citas, o `local_search` rotulado;
   - "Is 30 % safe?" → guarda + evidencia;
   - "set pressure to 70" → propuesta con botón Apply.
6. El reporte del demo desde la portada sigue igual y su chat funciona.

---

## 12. Recortes si una caja pasa de 1.5× (en este orden)

1. `/design` v2: queda solo el compilador local.
2. `ScatterModule` (D3) y `doc_summaries`.
3. `/chat` con IA: queda la búsqueda local rotulada.
4. Traducciones ES (D10).

**No se recortan nunca:**
- puntuación determinista con motivos;
- límite de 10;
- sección C condicionada a valores;
- procedencia;
- etiquetas de modo del chat.

## 13. Fuera de alcance de esta hora

- Variables manuales `user-defined`.
- Módulo `case_notes` (extraer valores de texto libre).
- Letras A–D: se usan los 4 niveles actuales con texto.
- Persistencia del caso en Workspace.
- Despliegue de la web.
