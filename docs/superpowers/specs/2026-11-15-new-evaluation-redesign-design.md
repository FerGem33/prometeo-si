# Diseño: Rediseño de "New Evaluation" (Subida Real de Documentos, Extracción de Variables y GenUI Adaptativo)

**Fecha:** 2026-11-15
**Rama / Workspace:** `Frontend/prometeo-si` (`nasa2genui`)
**Alcance:** Transformar el flujo de *New evaluation* (`#scenario` → `#processing` → `#report`) sin alterar la Portada (`Cover`) ni el flujo de perfiles NASA en Portada/Reporte demo.

---

## 1. Problema actual detectado (Auditoría de código + Playwright)

Al inspeccionar todas las pantallas con `playwright-cli` (`http://127.0.0.1:5174/`) y revisar `web/src/` y `api/`:

1. **Subida simulada (`ScenarioStep.tsx`):** El paso `1 · Documents` solo guarda `{ name, size }` en `stagedFiles` sin leer bytes, sin calcular `SHA-256`, sin parsear PDF/CSV y pasando solo el conteo numérico (`stagedFiles.length`) a `ProcessingStep`.
2. **Pregunta sin efecto visual (`Question`):** El paso `2 · Question` guarda texto libre (`goal`) que únicamente se imprime como una línea al inicio del reporte; no adapta ni diseña la interfaz según los documentos subidos.
3. **Selección de escenario dentro de New Evaluation:** Aparece en tres lugares dentro de `ScenarioStep.tsx`:
   - Paso `3 · Setting` (`allHabitatPresets(lens)`, 6 tarjetas de hábitats espaciales + `Custom`).
   - Barra persistente superior `quick-mission-bar` (`🚀 1-Click NASA Missions`) visible en todos los pasos del wizard.
   - Miniatura derecha del hábitat seleccionado (`LUNAR BASE`) en el paso de Variables.
4. **Variables fijas del demo:** El paso de Variables siempre lee `pack.schema.variables` (`o2`, `p`, `material`, `flow`, `g` de `web/public/demo/pack.json`), nunca las variables de los documentos cargados por el usuario.
5. **Brecha real con AWS Backend:** En AWS Lambda solo están públicas `/ask` y `/analysis`; T33 (`/projects*`) requiere login Cognito y el worker SQS T34 (`api/ingest_worker.py`) + revisión T35 (`api/schema_review.py`) aún no están desplegados/habilitados. Por ello se requiere un flujo **híbrido inmediato** que funcione 100% desde el primer momento y aproveche endpoints `/propose` y `/design` cuando estén desplegados.
6. **Detalle UI observado en Playwright:** El botón flotante `.judge-tour-pill-wrap` (`3-Min Pitch Tour · For Judges`) se solapa parcialmente abajo a la derecha con los controles de acción en `#scenario`.

---

## 2. Arquitectura objetivo (3 pasos en New Evaluation)

El wizard `#scenario` (`ScenarioStep.tsx`) pasa de 4 pasos a **3 pasos**:

`1 · Documents` → `2 · Interface design` → `3 · Variables`

### Cambio A — Eliminación de selección de escenario únicamente en `New evaluation`
- Se elimina `Setting` de `STEPS` en `ScenarioStep.tsx` junto con su cuadrícula de `allHabitatPresets` / `HabitatFigure`.
- Se elimina `quick-mission-bar` (`🚀 1-Click NASA Missions`) de `ScenarioStep.tsx`.
- Se elimina la miniatura del hábitat (`.step-mini-iso`) en el paso de Variables dentro de `ScenarioStep.tsx`.
- **Intacto:** `Cover.tsx` mantiene intactas las tarjetas `NASA_MISSION_PRESETS` y las 3 pestañas isométricas (`Reference Habitats (6)`). El flujo desde portada hacia `#report` demo conserva las herramientas del corpus `psi-fire`.
- Se agrega margen inferior/lateral en `flow.css` para que `.judge-tour-pill-wrap` no tape botones en `#scenario`.

---

### Cambio B — Paso 1: Subida real, validación, parseo y persistencia (`web/src/ingest/`)

Nuevo módulo desacoplado en `web/src/ingest/`:

1. **Almacén persistente (`storage.ts`):**
   - Persiste cada documento subido (archivo original `Blob`, `name`, `media_type`, `bytes`, `sha256` vía Web Crypto `crypto.subtle.digest`, páginas/filas parseadas, timestamp y estado) en **IndexedDB** (`prometeo-docs-db`), devolviendo un `doc_id` estable (`doc_<sha256_prefix>`).
   - Validación con límites D3 consistentes con `api/upload_tickets.py`: máximo `20,000,000` bytes por archivo, `60` páginas por PDF y `30` documentos por lote.
   - Si en el entorno existen `/propose` o sesión autenticada de proyectos T33, sincroniza de forma opcional sin bloquear el flujo local.

2. **Parsers reales en navegador:**
   - **`csv.ts` (CSV / TSV / JSON tabular):** Parser RFC-4180 completo con detección automática de delimitador, codificación UTF-8/Latin-1, cabeceras limpias, inferencia numérica/categórica, detección de unidades en cabeceras/celdas (`%`, `atm`, `psi`, `kPa`, `bar`, `mmHg`, `cm/s`, `m/s`, `°C`, `K`, `mg/L`, `V`, `W`, etc.) y generación de registros con procedencia `{ source: { id, row }, orig }`.
   - **`pdf.ts` (`pdfjs-dist`):** Extrae texto página por página (`1..N`) en Worker local (empaquetado con Vite, sin dependencias externas de red). Detecta PDFs escaneados sin capa de texto (`no_text_layer`) y PDFs con exceso de páginas (`too_many_pages`). Extrae título, DOI (`10.xxxx/...`), tablas textuales alineadas y menciones de variables cuantitativas/categóricas con cita literal verificada `{ kind: "paper", page, quote }`.

3. **Extractor de Variables y Constructor de Corpus (`extractVariables.ts` + `buildPack.ts`):**
   - **Modo híbrido:** Si está disponible el nuevo endpoint `POST /propose` (añadido en `api/handler.py` reutilizando `api/ingest_propose.py` con Bedrock Claude Haiku 4.5 y validación estricta de citas), combina propuestas IA verificadas; si no responde o está offline, ejecuta extracción determinista local sobre cabeceras CSV/JSON + patrones científicos en PDF (`Nombre (unidad)`, `valor ± tol unidad`, rangos `a–b unidad`, tablas de parámetros).
   - Construye dinámicamente un objeto **`Pack`** válido (`contract: "prometeo.pack/1"`, `schema`, `sources` con SHA-256 real, `studies`, `records`) consumible sin cambios por todo el motor matemático (`web/src/engine/`).
   - **Control de alcance de corpus:**
     - Con documentos subidos: genera el portal **a partir de los documentos del usuario** por defecto.
     - Incluye opción explícita (*"Combinar con corpus de ejemplo NASA PSI"*) desactivada por defecto al subir papers propios, o *"Usar solo corpus de ejemplo NASA PSI"* si no se suben archivos.

---

### Cambio C — Paso 2: Instrucciones de diseño de la interfaz según documentos (`2 · Interface design`)

Reemplaza a `2 · Question` con un diseñador de **GenUI** dirigido por instrucciones sobre los documentos cargados:

1. **Entrada y contexto vivo del corpus:**
   - Muestra resumen real de lo detectado en el Paso 1 (p. ej. `3 papers · 1 tabla · 9 variables candidatas · 142 registros`).
   - Chips de instrucciones **generados dinámicamente** según los documentos (ej.: mencionando las variables numéricas/categóricas reales más cubiertas, comparación entre múltiples estudios o matriz de brechas).
   - Selectores rápidos combinables de enfoque visual:
     - *Enfoque en brechas y cobertura* (`gaps`)
     - *Enfoque comparativo entre estudios* (`compare`)
     - *Enfoque de grafo y citas* (`graph`)
     - *Vista ejecutiva compacta* (`compact`)

2. **Contrato `UiBlueprint` (`web/src/ingest/blueprint.ts`) y compilador híbrido:**
   ```ts
   export type ReportSectionId =
     | "graphical_abstract"
     | "map"
     | "heat"
     | "gaps"
     | "graph"
     | "data_methods";

   export type UiBlueprint = {
     title: string;
     kicker: string;
     variablesLayout: "grouped" | "list" | "grid";
     density: "editorial" | "compact";
     highlightedVariables: string[];
     variableGroups: { id: string; label: string; variables: string[] }[];
     defaultAxes: [string, string];
     sectionOrder: ReportSectionId[];
     foldedSections: Record<string, boolean>; // abierto/cerrado por defecto
     hiddenSections: ReportSectionId[];
     hideMlCard?: boolean;
     hideStudyCompare?: boolean;
     rationale: string;
   };
   ```
   - Compila las instrucciones en `UiBlueprint` + `Lens` mediante `POST /design` (Bedrock Haiku 4.5 validando contra los IDs reales extraídos) con fallback determinista bilingüe ES/EN inmediato.

---

### Cambio D — Paso 3: Variables extraídas adaptadas por GenUI (`3 · Variables`)

- Carga dinámicamente las variables extraídas del corpus subido (ya no usa `pack.json` demo salvo que se elija el corpus demo).
- **Adaptación GenUI en el propio paso 3:**
  - Organiza y renderiza las variables usando `variablesLayout` (`grouped`, `grid`, `list`) y `variableGroups` decididos en el Paso 2.
  - Inicializa los sliders/selectores con la **mediana real** (numéricas) o el **valor modal real** (categóricas) observado en los documentos subidos, en lugar de `30% O2 / 0.694 atm`.
  - Cada tarjeta de variable permite:
    1. Activar/desactivar la variable para la comparación.
    2. Ajustar su valor objetivo o seleccionar categoría.
    3. Editar etiqueta o inspeccionar la **procedencia exacta** (*badge* con archivo fuente, fila/página y cita literal extraída).
  - Conserva `Add your own variable` (`AddExtra`) para agregar manualmente variables ausentes en los papers.

---

### Adaptación del Reporte (`#report`) y Procesamiento (`#processing`)

1. **`ProcessingStep.tsx`:** Ejecuta en secuencia real el pipeline asíncrono (hash/guardado → parseo PDF/CSV → extracción de variables → compilación GenUI → construcción de `Pack`/`Lens`), reflejando progreso real y permitiendo volver o pasar al reporte al terminar.
2. **`App.tsx` (Report):**
   - Acepta un estado activo `{ pack, lens, mapping, blueprint, designPrompt, isCustomCorpus }`.
   - Reordena, abre/colapsa u oculta los módulos (`GraphicalAbstract`, `MapFigure`, `HeatTable`, `GapFigure`, `KnowledgeGraph`, `MLCard`, `StudyCompare`, `Sources`, `Methods`) siguiendo `UiBlueprint` + `Lens`.
   - **`ScenarioPanel.tsx`:** Cuando `isCustomCorpus === true`, oculta el bloque específico de hábitats NASA (`presets`, `HabitatFigure` y `What-If NASA Flammability`) manteniendo intactos todos los controles de variables dinámicas, partes agrupadas por GenUI (`lens.parts`) y niveles de evidencia.
   - **`Provenance.tsx`:** Mejora el panel de trazabilidad para mostrar limpiamente `Page` y la cita textual (`r.quote`) cuando el registro proviene de un PDF (`confidence === "paper"`).

---

## 3. Verificación planificada

1. Tests unitarios nuevos con Vitest (`web/src/ingest/*.test.ts`):
   - Cálculo SHA-256 + IndexedDB/almacén con mock limpio.
   - Parser CSV/JSON multiunidad y extractor determinista desde PDF text pages.
   - Validación del `Pack` generado contra el motor real (`evidenceLevels`, `rank`, `findings`, `graph`).
   - Compilador de `UiBlueprint` (orden de secciones, ejes, grupos de variables, fallbacks ES/EN).
2. Regresión completa existente: `npm test -- --run` (incluyendo `i18n/coverage.test.ts`, `presets.test.ts`, `tour.test.ts`) y `npm run build` (`tsc --noEmit && vite build`).
3. Pruebas Python `pytest` en `api/` para los nuevos handlers `/propose` y `/design` si se agregan a `api/handler.py`.
4. Inspección visual y funcional end-to-end con `playwright-cli` subiendo CSV + PDF reales, ingresando instrucciones de diseño en el paso 2, verificando la desaparición total de escenarios en `#scenario`, confirmando variables extraídas en paso 3 y comprobando la adaptación dinámica de `#report` sin errores de consola (en Dark/Light y ES/EN).
