# Spec: Paper inteligente guiado por propósito

**Rama base:** `nasa2genui`
**Destinatario:** agente de software que implementa los cambios.
**Relación con otros docs:** extiende `docs/superpowers/specs/2026-11-15-new-evaluation-redesign-design.md` (wizard de 3 pasos ya implementado). Si hay conflicto con `AGENTS.md` (§5 reglas de producto, §6 reglas de código), manda `AGENTS.md`.

---

## 1. Idea en una frase

El usuario declara **para qué** quiere el paper ("tomar decisiones informadas sobre seguridad en hábitats lunares respecto a llamas en microgravedad"). A partir de ese propósito y de los documentos subidos, el sistema:

1. propone las variables relevantes (sin valores),
2. genera el paper inteligente (relaciones, huecos, resúmenes),
3. **genera módulos de interfaz adaptados al propósito** (GenUI), por ejemplo un módulo para describir el hábitat propio y clasificarlo contra la evidencia, y un chat libre.

El ejemplo de hábitats y fuego es **solo un caso**. Para otro propósito (p. ej. corrosión en tuberías) el sistema debe generar otros módulos con el mismo mecanismo, sin código específico del dominio en componentes.

---

## 2. Qué ya existe (no reescribir)

| Pieza | Ubicación |
|---|---|
| Wizard `Documents → Interface design → Variables` | `web/src/components/ScenarioStep.tsx` |
| Subida, hash, parseo CSV/PDF, límite de 30 archivos | `web/src/ingest/` |
| Extracción de variables (determinista + `/propose` opcional) | `web/src/ingest/` (`buildPack.ts`, `types.ts`) |
| `UiBlueprint` y compilador de instrucciones a secciones del reporte | `web/src/ingest/blueprint.ts` |
| Búsqueda/filtro de variables, conversión de unidades | `web/src/ingest/variableView.ts` |
| Reporte, grafo, ranking, niveles, ficha ML | `web/src/report/`, `web/src/engine/` |
| Asistente local sobre el corpus | `web/src/ingest/localAsk.ts`, `components/AssistantPanel.tsx` |
| Detección de corpus NASA y diagramas isométricos | `web/src/ingest/nasaDetect.ts` |

Antes de escribir código, leer estos archivos y reutilizarlos. Cambios fuera de esta spec: no.

---

## 3. Cambios requeridos

### 3.1 Paso "Interface design": el propósito como entrada principal

- El `textarea` de instrucciones pasa a llamarse **Purpose** (propósito) y es obligatorio antes de avanzar.
- Se muestra un ejemplo como placeholder (viene de `lens`/`pack`, no escrito en el componente).
- El propósito se guarda en el `UiBlueprint` (campo nuevo `purpose: string`) y viaja con el pack a `#report`.
- Con el propósito, el compilador decide qué **módulos** generar (ver §3.5). Las chips de enfoque actuales (`gaps`, `compare`, `graph`, `compact`) se mantienen como ajustes secundarios.

### 3.2 Detección de variables importantes (algoritmo a diseñar por el agente)

Decisión delegada al agente. Requisitos:

- **Determinista y explicable**: cada variable propuesta muestra *por qué* se sugirió (puntuación y componentes).
- Puntuación compuesta recomendada (el agente puede ajustarla y debe documentar los pesos en `docs/`):
  - **Frecuencia ponderada**: apariciones en cabeceras de tablas, texto de PDFs y columnas CSV (las cabeceras y tablas pesan más que menciones sueltas).
  - **Cobertura entre documentos**: en cuántos documentos distintos aparece (una variable en 8 de 10 papers vale más que 40 menciones en uno).
  - **Posición**: presencia en título, abstract y conclusiones.
  - **Relevancia al propósito**: coincidencia léxica entre la variable y el texto del propósito (determinista, p. ej. TF-IDF simple o solapamiento de términos). La IA puede *re-ordenar o describir*, pero la puntuación base la calcula el código.
  - **Medibilidad**: la variable tiene unidad o valores numéricos extraíbles (favorece las numéricas sobre menciones vagas).
- Salida: lista ordenada con `score`, `reasons[]` y procedencia (`archivo + fila` o `documento + página`, y DOI cuando exista).
- Si la API de IA está disponible (`/propose`), puede añadir candidatas, pero cada una debe pasar la validación de citas existente. Si la API falla, se usa solo el cálculo local y se marca como tal.

### 3.3 Paso "Variables": selección sin valores

- Se muestran las variables propuestas, ordenadas por `score`, con el motivo visible (p. ej. "appears in 7 of 10 documents · in 3 table headers").
- El usuario **selecciona** cuáles incluir. **No se asigna ningún valor aquí** (hoy el paso mezcla selección y rango; separar: aquí solo incluir/excluir).
- El usuario puede **añadir variables manualmente**: nombre, tipo (numérica/categórica) y unidad opcional. Una variable manual no tiene procedencia en los documentos; debe marcarse visiblemente como `user-defined` y el motor no la presenta como evidencia hallada.
- Se mantienen búsqueda, filtro y agrupación por documento ya implementados.

### 3.4 Generación del paper inteligente

Al terminar el wizard se genera `#report` con, como mínimo:

- **Relaciones**: grafo de variables y estudios (ya existe en `report/graph.ts`).
- **Huecos**: matriz de cobertura con "studied / not studied / near, not covered / scarce evidence" con **el mismo peso visual** (no solo color).
- **Resúmenes**: por documento y global. Texto de IA solo si pasa el verificador; si no, plantilla marcada como tal.
- Todo valor visible con procedencia; si no hay fuente, no se muestra.

### 3.5 Módulos generados por GenUI según el propósito

Nuevo concepto: el `UiBlueprint` incluye una lista de **módulos** (`modules: ModuleSpec[]`). Cada módulo es una unidad declarativa que el renderizador genérico sabe pintar. Los módulos se eligen a partir del propósito y de las variables seleccionadas; los textos (títulos, etiquetas) los entrega `lens`/`blueprint`, **no** el componente.

Tipos de módulo mínimos:

| Tipo | Qué hace |
|---|---|
| `scenario_input` | Formulario con las variables seleccionadas para que el usuario describa **su caso** (en el ejemplo, su hábitat: O₂, presión, material, flujo, gravedad…). Valida rangos y unidades. |
| `classification` | Compara el caso del usuario contra la evidencia y asigna un **nivel** por variable y global (ver §4). |
| `key_papers` | Identifica los papers más relevantes **para el caso**, con resumen e interpretación citados. |
| `case_notes` | Campo de descripción libre del caso; el sistema extrae características del texto (variables y valores mencionados) y las propone para confirmar. |
| `free_chat` | Chat libre sobre el corpus (ver §3.7). |

Reglas:

- Los módulos son datos (JSON validado contra esquema), no componentes escritos a mano por dominio. Un propósito distinto genera un conjunto distinto de módulos con el mismo código.
- Si el generador (local o `/design`) devuelve un módulo inválido, se descarta y se registra; el reporte base sigue funcionando.
- Agregar nuevos tipos de módulo debe ser registrar un renderizador y un esquema, sin tocar el motor.

### 3.6 Módulo de caso del usuario (`scenario_input` + `classification` + `key_papers`)

Flujo:

1. El usuario introduce valores de su caso en `scenario_input` (solo variables seleccionadas en el paso 3).
2. Opcionalmente escribe una descripción en `case_notes`; el sistema detecta características y propone valores que el usuario confirma o corrige. **Nunca se aplican sin confirmación.**
3. El **motor** calcula la clasificación (§4) y ordena los papers por cercanía al caso.
4. `key_papers` muestra los papers más relevantes con: por qué son relevantes (qué variables comparten con el caso), resumen e interpretación. El texto de IA pasa por el verificador de citas; el orden y la relevancia los calcula el motor.

### 3.7 Chat libre (`free_chat`)

- Pregunta abierta sobre el corpus cargado y, si existe, sobre el caso del usuario.
- La IA **solo** traduce la pregunta a una consulta estructurada validada o redacta texto que pasa el verificador. Las cifras vienen del motor.
- Cada respuesta cita sus fuentes (documento + página/fila, DOI).
- Si la API falla, responde `localAsk.ts` y se rotula como respuesta local/por plantilla. **Prohibido presentar una respuesta grabada o local como IA en vivo.**
- El texto del usuario va delimitado como dato dentro del prompt.
- Si la pregunta pide predecir ("¿arderá?", "¿es seguro?"), responde reformulando en términos de comparación con la evidencia ("studied", "not studied", "near, not covered", "scarce evidence").

---

## 4. Clasificación A / B / C / D

Decisión de producto a confirmar por el dueño antes de implementar (ver §7). Propuesta por defecto:

- Se calcula **por el motor**, de forma determinista, a partir de la distancia entre el caso del usuario y el espacio cubierto por la evidencia. No la calcula la IA.
- Escala propuesta, comunicada con **letra + etiqueta de texto + icono/patrón** (nunca solo color):
  - **A** Studied: el caso cae dentro de condiciones directamente estudiadas.
  - **B** Near: cerca de lo estudiado pero no cubierto.
  - **C** Scarce evidence: cobertura escasa.
  - **D** Not studied: sin evidencia en el corpus.
- Debe mostrar el desglose por variable y qué fuente respalda cada nivel.
- La letra describe **cobertura de evidencia**, no riesgo ni resultado físico. Textos como "seguro", "arde" o "no arde" están prohibidos como predicción.
- Si el motor ya tiene niveles equivalentes (`web/src/engine/`), mapear a A–D en la capa de presentación en vez de duplicar lógica.

---

## 5. Reglas del proyecto que esta spec no debe romper

- **Interfaz en inglés**; documentación en español.
- **Motor** (`web/src/engine/`): TypeScript puro, sin vocabulario de dominio (`scripts/check_agnostic.sh` debe pasar). Lo específico entra por `pack`, `mapping` y `lens`.
- **Componentes sin textos de dominio**: títulos, etiquetas y presets salen de `lens` y `pack`.
- **Una sola lógica**: la UI llama al motor y a `web/src/contracts/`; no reimplementa niveles, rankings, grafos ni diferencias en componentes.
- **Procedencia** en todo valor visible.
- **Honestidad visual**: "Not studied" y "Scarce evidence" con el mismo peso que "Studied".
- **Diseño "artículo"**: papel `#FDFCF9`, tinta `#1D1C1A`, acento único `#A3271B`, EB Garamond + Fira Sans. Sin gradientes, sombras, radios > 4 px, emojis ni tarjetas flotantes.
- **IA**: modelo desde `MODEL_ID` (no escribir el ID en código; no migrar de modelo). Toda salida validada contra esquema.
- **AWS**: no crear servicios nuevos sin aprobación de una persona. Esta spec no requiere infraestructura nueva; `/design` y `/propose` ya existen en `api/handler.py`.
- **Commits**: sin `Co-Authored-By`, sin firmas ni menciones al agente.

---

## 6. Verificación y criterios de aceptación

1. Pruebas: `cd web && npm test`, `python3 -m pytest api/`, `scripts/check_agnostic.sh` pasan.
2. Pruebas nuevas (vitest) con **datos reales** del lote/corpus, sin números inventados:
   - Puntuación de variables: orden estable, `reasons` presentes, variable sin procedencia no aparece.
   - Con el corpus PSI y el propósito del ejemplo, entre las variables propuestas aparecen las conocidas (O₂, presión, material, flujo, gravedad). Hallazgos de control: 0 de 268 pruebas de sólidos registran presión; O₂ máximo probado en sólidos 22.2 % (BASS-II); la base lunar del reto es 30 % O₂ a 10.2 psi, que debe clasificarse como no cubierta en O₂ para sólidos.
   - `UiBlueprint` con `modules`: esquema válido, módulo inválido descartado sin romper el reporte.
   - Clasificación: determinista (mismo input, mismo resultado).
3. Cambiar el propósito a otro dominio (con otro corpus de prueba) genera otros módulos sin tocar código de dominio.
4. Variables manuales marcadas `user-defined` y excluidas del conteo de "evidencia hallada".
5. Chat libre: respuesta con citas; con la API apagada, muestra rótulo de respuesta local.
6. Revisión visual humana del paso Interface design, Variables, módulos y reporte contra `AGENTS.md` §5–§7 **antes** de cualquier `infra/deploy_web.sh`.

---

## 7. Decisiones abiertas para el dueño

1. **Escala A–D**: ¿se acepta la propuesta de §4 (cobertura de evidencia) o la escala tiene otro significado? El nombre exacto de cada letra afecta el texto visible.
2. **Alcance del chat libre**: ¿solo corpus subido, o también conocimiento general del modelo? Esta spec asume **solo corpus** (con citas).
3. **Variables manuales**: ¿pueden entrar a la clasificación aunque no tengan evidencia? La spec asume que sí entran al caso del usuario pero se clasifican como "Not studied" (D).
4. **Persistencia del caso**: ¿el caso del usuario se guarda en Workspace junto con la evaluación? Recomendado: sí (`web/src/report/customStore.ts`).

---

## 8. Orden de implementación sugerido

1. Esquema `ModuleSpec` y extensión de `UiBlueprint` (`purpose`, `modules`) con pruebas.
2. Puntuación de variables (§3.2) en `web/src/ingest/` con pruebas sobre datos reales.
3. Paso Variables: selección sin valores + variables manuales (§3.3).
4. Renderizador genérico de módulos y `scenario_input` + `classification` (§3.5, 3.6, 4).
5. `key_papers` y `case_notes`.
6. `free_chat` sobre `localAsk.ts` con ruta `/ask` opcional.
7. Revisión visual humana y notas en `PROGRESS.md`.
