# Prometeo — Revisión del MVP y plan de continuación (fase 2)

14 de noviembre de 2026, actualizado a las 23:15 CST · Para el equipo y los agentes de relevo · Rama `main`

> **Contratos:** las formas de datos de los bloques B y C están en [`CONTRATOS_FASE2.md`](CONTRATOS_FASE2.md). El equipo de interfaz puede trabajar con ellas desde ya.
> **Fusión de `frontend`:** queda en manos de quienes desarrollan esa rama (decisión del 14-nov). Este plan no la incluye ni depende de ella.

Este documento hace dos cosas: (1) deja constancia de lo que se verificó del MVP y de lo que sigue pendiente, y (2) propone las tareas para el resto de la visión de `docs/Prometeo — Documento de casos de uso.md`. Continúa a `docs/PLAN.md` (T00–T15), que sigue mandando para el MVP. Complementa el análisis de brechas de la rama `frontend` (`docs/Prometeo — Brechas del frontend y contratos del backend.md`), cuyo cuadro de cobertura por caso de uso se revisó y se da por bueno salvo lo que se indica en §2.

## 1. Estado verificado del MVP

Verificación hecha el 14-nov a las 22:30 CST desde la laptop ferlr, sin credenciales de AWS (solo lectura pública).

| Comprobación | Resultado |
|---|---|
| `npm test` en `web/` (`main`) | 35 de 35 |
| `npm run build` (`main`) | OK. Con `VITE_API_URL`, el bundle es `index-Ben2isQ8.js`, **el mismo que sirve CloudFront**: lo publicado es `main` |
| `python -m pytest api/` (`main`) | 28 de 28 |
| `scripts/check_agnostic.sh` | OK |
| `pipeline/validate_pack.py` sobre el pack versionado | OK: 24 estudios, 1,986 registros, 22 fuentes; 0 de 268 sólidos con presión; O₂ máximo de sólidos 22.2 % (PSI-25) |
| `GET https://dursf4nho4zl6.cloudfront.net/` y `/demo/pack.json` | 200 |
| `POST /ask` con `api/events/ask.json` | 200 en 7.1 s: O₂ 25, 0.5 atm, Nomex |
| `POST /ask` con pregunta de resultado ("Will PMMA ignite…") | 200, `unsupported` |
| `POST /analysis` con `api/events/analysis.json` | 200 en 0.9 s, `mode: ai`, una oración (el evento de ejemplo solo trae un hallazgo) |
| CORS desde otro origen | sin cabecera `access-control-allow-origin` |
| Rama `frontend` (build, 35 pruebas web, 27 API, agnóstico) | OK, pero **no está fusionada ni desplegada** |

Tareas T00–T14 hechas. T15 sigue `en curso` por el punto 9 de la aceptación.

## 2. Pendientes reales del MVP

Ordenados por impacto en la demo. Los dos primeros son fallos visibles en la URL pública.

| # | Pendiente | Evidencia | Qué hace falta |
|---|---|---|---|
| P1 | **`/ask` devuelve 502 cuando la pregunta trae la presión en psi.** El reto y la propia interfaz dan la presión en psi (10.2 psi). | `"30% oxygen, 10.2 psi, PMMA"` → 502 `Scenario service unavailable`. La misma pregunta con `0.694 atm` → 200. | Corregir en `api/handler.py` (la conversión de unidades o su validación) y que un valor no interpretable devuelva `unsupported` con motivo, no 502. Requiere perfil `prometeo` para probar y desplegar. |
| P2 | **`/ask` descarta la gravedad sin avisar.** | `"…with PMMA at 0.17 g?"` → 200 sin `g` en la respuesta. | El esquema que manda la página incluye `g`; la respuesta debe traerla o decir que la omitió. |
| P3 | **Una sugerencia de la interfaz estaba rota.** "Lunar gravity, 30% oxygen, 10.2 psi, cotton fabric" → 502 (psi, y "cotton" no es una categoría del corpus). | Reproducido contra la API pública. | **Corregido en este commit** en `pipeline/lens.json` y `web/public/demo/lens.json` por una pregunta verificada contra la API (200). Falta `infra/deploy_web.sh` para que llegue a la URL. |
| P4 | **`data/psi` ya no está en git.** El commit `df713ec` borró las tablas y metadatos; un clon limpio no puede regenerar el pack ni repetir T14. Además, `build_pack.py` sin datos sobrescribía el pack con uno vacío. | `git ls-files data` → 0 archivos. | **Corregido en este commit:** `build_pack.py` ahora falla sin tocar el pack. Falta decidir si `data/psi` (632 KB, CC0) vuelve al repo (recomendado) o se documenta de dónde se obtiene. |
| P5 | **`pipeline/lens.json` y el lens publicado se habían separado** (la corrección `67a81e1` solo tocó el publicado). | Diferían en una pregunta. | **Corregido en este commit.** Regla: se edita `pipeline/lens.json` y se regenera. |
| P6 | **Punto 9 de la aceptación:** deploy desde otra laptop sin duplicar recursos. | `PROGRESS.md`. | Lo cierra quien ejecute T16 desde una laptop distinta a la del primer deploy. |
| P7 | **`/analysis` cubre pocos hallazgos.** El recorte de T09 limita la redacción a frases de seis códigos; para el preset lunar hay 3 oraciones posibles de 6 hallazgos. *Corrección:* la primera versión de este documento decía que devolvía una sola oración; esa prueba usó el evento de ejemplo, que solo trae un hallazgo. | `api/verify.py`. | T19 (código hecho; falta desplegar). |
| P8 | **Rama `frontend` sin fusionar** (flujo Cover → Scenario → Report). La fusión la hace el equipo de interfaz. Aviso para ese momento: `main` cambió `api/handler.py`, `api/verify.py`, `api/test_verify.py`, `lens.json` y el motor; en esos archivos debe quedar la versión de `main`, o vuelven el fallo de la sugerencia del traje y el de psi. | `git diff main origin/frontend`. | Equipo de interfaz. |
| P9 | **Modelo (D6/T17):** Haiku 5.5 aparece activo en Bedrock, pero una invocación real devuelve 403 `not available for this account`. La API quedó operativa en Haiku 4.5 con SDK 2.8.0. | `infra/config.env`, `api/README.md`, `PROGRESS.md`. | El dueño debe habilitar Haiku 5.5 para esta cuenta antes de cerrar D6/T17. |
| P10 | **README** decía que faltaba el deploy final. | — | **Corregido en este commit.** |
| P11 | Revisiones humanas que T12 y T14 dejaron abiertas: clases destino y umbrales de la ficha de ML; diferencias del mapeo propuesto por Bedrock (65.2 % de asignaciones exactas). | `PROGRESS.md`. | Decisiones D4 y D7. |
| P12 | Otras ramas sin integrar: `dev-josue` (2 commits, ya contenidos en `frontend`) y `nasa2genui` (24 commits, **sin historia común** con `main`: migración a Next.js y figuras isométricas). | `git rev-list`. | Decisión D8. |
| P13 | Carpetas locales sin versionar: `tools/` y `pipeline/tools/datos_psi/` (copias de la descarga de PSI, con PDFs). | `git status`. | No subirlas tal cual (tamaño). Se resuelve con P4. |

Precisiones al cuadro de cobertura del documento de brechas:
- **CU-19 (preguntar en lenguaje natural)** figura como *Hecho*; con P1 y P2 es **Parcial**.
- **CU-20 (análisis verificado)** figura como *Hecho*; cumple el criterio de "solo oraciones con fuente", pero con P7 la síntesis es mínima.
- **CU-01** queda *Hecho* para `main`; hay que repetir la comprobación en privado y móvil cuando se publique el flujo de `frontend`.

## 3. Cobertura de los casos de uso tras el MVP

Alcance "MVP" según §14 de los casos de uso: CU-01, 02, 05–08, 10–21 y 24.

| Grupo | Hecho | Parcial | No existe |
|---|---|---|---|
| A · Acceso | CU-01 | — | CU-02; CU-03 y 04 (posterior) |
| B · Construcción de la base | — | — | CU-05, 06, 07, 08; CU-09 (posterior) |
| C · Exploración | — | CU-10, 11, 13, 14 | CU-12 |
| D · Evaluación | — | CU-15, 16, 17, 18 | — |
| E · Preguntas e informe | CU-21 | CU-19, 20 | CU-22 (posterior), CU-23 (futuro) |
| F · Datos para ML | — | CU-24 | CU-25 (posterior) |

Lo construido es el núcleo de evaluación sobre un pack fijo. La mitad de la visión que falta es la que la hace agnóstica de verdad: que una persona suba su corpus y Prometeo induzca el esquema, extraiga con cita y publique un pack (grupo B).

## 4. Decisiones que debe tomar una persona

Las tareas marcadas con una decisión no empiezan hasta que alguien la cierre y la anote aquí.

| # | Decisión | Recomendación | Bloquea |
|---|---|---|---|
| D1 | ¿Se levanta la restricción de `AGENTS.md` §8 sobre Cognito, SQS y DynamoDB? | Sí, solo para el bloque C y solo por scripts idempotentes. | Bloque C |
| D2 | ¿Scripts de AWS CLI o plantilla SAM? | Mantener los scripts: ya funcionan y el equipo los conoce. | Bloque C |
| D3 | Límites del corpus: MB por archivo, páginas por PDF, documentos por lote. | 20 MB, 60 páginas, 30 documentos (el escenario del §11 de los casos de uso). Medir costo en T31 antes de fijarlo. | T30–T36 |
| D4 | Clases destino y umbrales de la ficha de ML (CU-24). | Los tres veredictos del caso de uso con umbrales visibles y editables en `lens`. | T27 |
| D5 | ¿Entran "respaldado" y "refutado" en el motor? Exigen una variable de resultado con sentido definido. | No por ahora: las tablas de BASS y BASS-II no traen resultado y 12 investigaciones lo traen en formatos distintos. Mantener los cuatro niveles de cobertura. | — |
| D6 | ¿Se migra a Haiku 5.5 y al SDK actual? | Sí, junto con la corrección de P1 (un solo redeploy). | T17 |
| D7 | ¿Quién revisa las 79 diferencias de mapeo de `docs/agnostic_proof.md`? | Quien conoce las tablas (autor de `construir_corpus.py`). | T32 (sirve de conjunto de prueba) |
| D8 | ¿Qué se hace con `nasa2genui`? | Comparar en una sesión y traer a `main` solo piezas concretas (figuras), no la migración a Next.js. | — |
| D9 | ¿`data/psi` vuelve al repo? | Sí (632 KB, CC0). | T18 |
| D10 | ¿Segundo dominio para la prueba agnóstica y quién consigue su corpus? | Uno con tablas públicas y pocas variables. | T37 |
| D11 | ¿En qué rama se trabaja? | **Decidido (14-nov):** motor, API, infra y contratos en `main`; la interfaz en `frontend`, que su equipo fusiona cuando quiera. Reparto en `CONTRATOS_FASE2.md` §1. | — |

## 5. Tareas

Mismas reglas que `docs/PLAN.md` y `AGENTS.md`: cada tarea tiene verificación, se anota en `PROGRESS.md` y se sube al terminar. Los niveles, el ranking, los hallazgos y el grafo los calcula el motor; la interfaz sigue solo en inglés.

### Bloque A · Cerrar el MVP (antes de cualquier función nueva)

**T16 — Publicar `main` desde otra laptop** · requiere perfil `prometeo`
- `export AWS_PROFILE=prometeo && bash infra/20_api.sh && bash infra/deploy_web.sh` desde una laptop distinta a la del primer deploy; comprobar que reutiliza bucket, distribución, Lambda y API (cierra el punto 9 y T15).
- Publica de una vez: la sugerencia corregida, `lens.parts`, y el código de T17 y T19.
- No incluye la rama `frontend`.
- *Verificación:* los comandos de §7; punto 9 marcado en `PROGRESS.md`; el hash del bundle público coincide con el build local.

**T17 — Corregir `/ask`** · código hecho en `main`; falta desplegar y probar con Bedrock · D6
- Hecho: el modelo ya no convierte unidades; devuelve las condiciones como las dice la pregunta y `api/handler.py` las convierte con `display_units` (psi, kPa). Lo inválido se descarta en vez de tumbar la respuesta; `502` solo cuando el modelo no responde. Con `version: 2` la respuesta trae `notes` (contrato en `CONTRATOS_FASE2.md` §4.1); sin `version`, la respuesta es idéntica a la actual. 10 pruebas nuevas con dobles del modelo.
- Falta: `infra/20_api.sh` y comprobar con el modelo real. El cambio de prompt no se ha probado contra Bedrock: si el modelo no sigue el formato nuevo, ajustar `ASK_SYSTEM`.
- *Verificación:* las cuatro sugerencias de `lens.questions`, `"30% oxygen, 10.2 psi, PMMA"` y `"…with PMMA at 0.17 g"` devuelven 200 con todas sus variables en la URL pública (comandos en §7).

**T18 — Datos reproducibles** · D9
- Restaurar `data/psi` desde `ce96ba6` (`git checkout ce96ba6 -- data`) o documentar la fuente en `data/psi/README.md`.
- `induce_schema.py` y `build_pack.py` leen del mismo sitio; quitar la ruta local `tools/datos_psi`.
- *Verificación:* en un clon limpio, `python3 -I pipeline/build_pack.py && python3 -I pipeline/validate_pack.py` reproduce el pack byte a byte (`git diff --exit-code web/public/demo`).

**T19 — Análisis con más contenido (CU-20)** · código hecho en `main`; falta desplegar
- Hecho: oración nueva para `tested_elsewhere`, cotejada contra el pack como las demás; las de `above_tested` y `below_tested` ahora dicen el valor extremo registrado; el prompt pide al menos tres oraciones, con los vacíos primero. Para el preset lunar hay 5 oraciones posibles en lugar de 3.
- Se mantuvo la decisión de T09: el modelo elige y ordena oraciones redactadas por el código, no escribe prosa libre (una oración con los números correctos puede invertir el sentido).
- No entraron `known_gap`, `category_untested` ni `quality_flags`: sus hallazgos no traen fuentes y la interfaz publicada exige al menos una por oración. Requiere cambiar el motor y la interfaz a la vez; queda para después de la fusión de `frontend`.
- *Verificación:* con `api/events/analysis_lunar.json`, la URL pública devuelve `mode: ai` y al menos 3 oraciones.

### Bloque B · Visión sin backend (CU-10, 11, 14, 15, 16, 17, 18 y maqueta de 03–04)

No toca AWS. Todo el estado nuevo vive en el navegador y se presenta como local.

**T20 — Motor: grafo (guía §6.5)** · hecho
- `graph(pack)` en `web/src/engine/`: nodos = estudios, variables y valores categóricos presentes en 2 o más estudios; aristas `related`, `hardware` (normalizado, similitud ≥ 0.9), `variable` y `category`.
- Vectores con el pack real en `golden.test.ts`.
- *Verificación:* `npm test` y `check_agnostic.sh`.
- Hecho junto con el resto del motor del bloque B: `assess`, `partLevels`, `explainRank`, `diffAssessment`, `graph`, `emphasis` en `web/src/engine/extend.ts`, con 15 vectores sobre el pack real. `lens.parts` y `lens.graph` publicados en el lens.

**T21 — Panel de conocimiento (CU-10, CU-11, parte calculada de CU-18)** · interfaz · motor listo
- Vista de grafo en SVG propio. Tamaño y resalte de cada nodo según el ranking del escenario activo; clic en un estudio abre su ficha (objetivo, materiales, condiciones, variables, instrumentos, DOI).
- Filtros por partición, tipo de proyecto y fuente; los filtros se reflejan en la URL.
- La leyenda dice qué aristas son calculadas. No se dibuja ninguna relación "afirmada por autores" hasta T36.
- *Verificación:* captura; con el preset lunar, los tres estudios con nota C son los nodos resaltados.

**T22 — Por qué este orden (CU-11)** · interfaz · motor listo (`explainRank`)
- En la Tabla 1, cada fila se despliega y muestra, por variable activa, el valor del escenario, el registro más cercano con su valor real y su aporte a la distancia, con enlace a la procedencia.
- *Verificación:* para BASS-II, O₂ 22.2 % (B1, fila 2) aporta 1.56; presión "not recorded".

**T23 — Partes de la propuesta y mapa de evidencia (CU-15, CU-16)** · interfaz · motor listo (`partLevels`)
- `lens.parts` agrupa variables en partes con nombre (en el pack de PSI: atmósfera, ventilación, material). El motor agrega el nivel de cada parte con la regla "el nivel más débil manda" y lo explica.
- El panel de escenario muestra las partes; ningún nivel se comunica solo con color.
- *Verificación:* vectores: preset lunar → atmósfera *Not studied* (por presión), material *Studied*.

**T24 — Qué cambió (CU-17)** · interfaz · motor listo (`diffAssessment`)
- Al cambiar el escenario, se marca qué niveles, notas y hallazgos subieron o bajaron respecto al estado anterior, con texto e icono, durante la sesión.
- *Verificación:* prueba del diff en Vitest (función pura fuera del motor o dentro, sin vocabulario de dominio).

**T25 — Variantes guardadas y comparación (CU-17, CU-15)** · interfaz · lógica lista (`contracts/workspace.ts`)
- Guardar el escenario con nombre en `localStorage`; listar, renombrar y borrar. Comparar dos variantes lado a lado por parte: nivel, nota del mejor estudio y hallazgos que difieren.
- Aviso visible: "Saved in this browser only".
- *Verificación:* guardar "lunar base" y "25 % O₂ / 0.5 atm / Nomex" y ver la comparación; captura.

**T26 — Comparación ordenable (CU-14)** · interfaz
- En la tabla de calor, ordenar por cualquier variable o por cercanía total; el comparador de dos estudios resalta las variables en las que difieren.
- *Verificación:* captura.

**T27 — Ficha de aptitud para ML (CU-24)** · D4
- Veredicto por variable de resultado con los umbrales de `lens`, visibles y explicados; cada número abre los registros que lo producen.
- *Verificación:* pruebas en Vitest con los umbrales aprobados.

**T28 — Espacio de trabajo local (maqueta de CU-03 y CU-04)** · interfaz · lógica lista (`contracts/workspace.ts`)
- Lista de proyectos en el navegador: la demo de PSI más los que el usuario cree con nombre e intención; cada uno guarda sus variantes.
- Siempre marcado como local. No se presenta como cuenta ni como persistencia en servidor.
- *Verificación:* crear, reabrir tras recargar y borrar un proyecto.

**T29 — Exportación (CU-21)** · interfaz
- El PDF incluye la comparación de variantes y la vista de partes. Exportar también Markdown con las mismas citas (pregunta abierta del §15 de los casos de uso; es barato y útil para académicos).
- *Verificación:* PDF y `.md` con todas las secciones y DOIs.

### Bloque C · Construir la base con el corpus del usuario (CU-02, 05–08, 12, 13 con PDF, 18 declarado) · D1, D2, D3

Es la parte que vuelve a Prometeo agnóstico de verdad. Sigue la arquitectura de `docs/Prometeo — Arquitectura final del sistema MVP.md` con scripts de AWS CLI. El pack que produce cumple el mismo contrato `prometeo.pack/1` y entra a la misma interfaz y al mismo motor.

**T30 — Contratos y decisiones.** Propuesta escrita: `CONTRATOS_FASE2.md` §5, tipos en `web/src/contracts/backend.ts` y ejemplos en `docs/fixtures/fase2/`. Falta que una persona la apruebe y cierre D1–D3. *Verificación:* aprobación anotada en `PROGRESS.md`.

**T31 — Infra de datos.** `infra/30_data.sh` idempotente: tabla DynamoDB (una sola, por `uid` y proyecto), bucket S3 privado con cifrado y bloqueo público, cola SQS con DLQ, Cognito (user pool y cliente). Permisos acotados por recurso. *Verificación:* reejecutar no duplica nada; `outputs.env` sin secretos.

**T32 — Extracción fuera de línea primero.** Antes del worker, `pipeline/ingest.py` hace el recorrido completo sobre una carpeta local: leer tablas y PDF, perfilar, proponer esquema y mapeo (Bedrock), extraer registros con cita literal y verificar que la cita aparece en el texto. Conjunto de prueba: las 22 tablas de PSI contra el mapeo aprobado (T14 dio 65.2 %; meta ≥ 85 % tras revisar D7) y 5 PDF de BASS-II y FLEX para la presión que las tablas no traen. *Verificación:* informe con aciertos y con las citas rechazadas.

**T33 — Cuenta y proyectos (CU-02, CU-05).** Registro e inicio de sesión con Cognito; `POST/GET/PATCH /projects`; subida con URL prefirmada; el `uid` sale del token. *Verificación:* dos usuarios no ven los proyectos del otro (prueba A/B).

**T34 — Worker (CU-06).** Lambda disparada por SQS que ejecuta las etapas de T32 por documento, idempotente y reanudable; progreso en `GET /projects/{id}/jobs`. *Verificación:* un lote de 10 documentos termina; un documento corrupto va a la DLQ y el resto continúa.

**T35 — Revisión del esquema (CU-07).** Pantalla para aprobar, fusionar, renombrar y rechazar variables y unidades; nada se publica sin aprobación. *Verificación:* fusionar dos variables y ver el cambio en el pack.

**T36 — Correcciones, conflictos y relaciones declaradas (CU-08, CU-18, CU-13).** Corregir un valor conservando la cita original; resolver conflictos entre fuentes; relaciones y huecos afirmados por autores como `claims[]` con cita; abrir el PDF en la página de la cita. *Verificación:* un valor corregido muestra el original y quién lo cambió; un hueco declarado aparece junto a la variable.

**T37 — Publicar y probar otro dominio (CU-12).** Generar pack y lens del proyecto, abrirlo en la interfaz existente y sintetizar documentos seleccionados con cita. Repetir con el segundo dominio (D10). *Verificación:* el mismo motor, sin cambios, produce el informe del segundo corpus; `check_agnostic.sh` en verde.

### Posterior

CU-09 (añadir documentos a una base publicada), CU-22 (compartir), CU-23 (preguntas sobre el contenido), CU-25 (exportar dataset).

## 6. Orden recomendado

1. **En la laptop con perfil `prometeo`:** T16 (publica T17 y T19) y la verificación de §7. Es media hora.
2. **Equipo de interfaz, en paralelo:** T21, T22, T23, T24, T25, T26, T28 y T29 sobre el motor ya listo; y las pantallas del bloque C con los ejemplos de `docs/fixtures/fase2/`.
3. **Agentes de motor y API, sin AWS:** T18 cuando se cierre D9; T32 (extracción fuera de línea) necesita Bedrock, así que va en la laptop con perfil.
4. **Bloque C** cuando estén D1–D3: T30 → T32 → T31 → T33 → T34 → T35 → T36 → T37. T32 va antes que la infraestructura porque es donde está el riesgo (calidad de la extracción) y se puede medir sin desplegar nada.

Si hay que elegir para el pitch: T16, T21 y T25 son lo que más cambia lo que ve un juez.

## 7. Guion para la laptop con perfil `prometeo`

```bash
git pull --rebase
export AWS_PROFILE=prometeo && source infra/config.env && source infra/outputs.env

# 1. pruebas locales
npm test --prefix web && api/.venv/bin/python -m pytest api/ -q && scripts/check_agnostic.sh

# 2. API (T17, T19) y web (sugerencia corregida, lens.parts)
bash infra/20_api.sh
bash infra/deploy_web.sh

# 3. /ask: psi, gravedad y las sugerencias (esperado: 200 con todas las variables)
ask() { python3 -c "import json,sys; e=json.load(open('api/events/ask.json')); e['question']=sys.argv[1]; print(json.dumps(e))" "$1" \
  | curl -s -m 30 -w ' [%{http_code}]\n' -X POST "$API_URL/ask" -H 'content-type: application/json' -d @-; }
ask "30% oxygen, 10.2 psi, PMMA"                                   # p ≈ 0.6941
ask "What if the base used 30% O₂ at 0.694 atm with PMMA at 0.17 g?"   # debe traer g = 0.17
ask "What if the base used 25% O₂ at 0.5 atm with Nomex?"
ask "Will PMMA ignite at 30% oxygen?"                              # unsupported

# 4. /analysis con el preset lunar (esperado: mode ai, 3 o más oraciones)
curl -s -m 30 -X POST "$API_URL/analysis" -H 'content-type: application/json' -d @api/events/analysis_lunar.json
```

Si el paso 3 devuelve `unsupported` donde debería haber condiciones, el modelo no está siguiendo el formato nuevo: revisar `ASK_SYSTEM` en `api/handler.py` con `api/.venv/bin/python -m api.smoke`. Anotar el resultado en `PROGRESS.md` y marcar el punto 9 de la aceptación.
