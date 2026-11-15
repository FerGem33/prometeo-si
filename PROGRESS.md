# Prometeo — Progreso

> Fuente única del estado del proyecto. Cada agente lo lee al empezar y lo actualiza al terminar cada tarea (ver `AGENTS.md`).
> Las tareas están descritas en [`docs/PLAN.md`](docs/PLAN.md).

## Estado actual

| Campo | Valor |
|---|---|
| Hora 0 (inicio del reloj) | 2026-11-14 18:16 CST |
| Tarea en curso | T32 en curso · stringbuilder: revisión humana D7/PDF pendiente. T31 preparada, pero ejecución detenida porque el perfil AWS `prometeo` devuelve identidad root. T18 hecha. |
| Último commit verificado | `97d1613`; T18 reproducible. Evaluación T32 en `docs/T32_EVALUACION.md`; API/web no cambiaron. |
| Siguiente paso exacto | Configurar un principal AWS IAM de mínimo privilegio para `prometeo` (sin root), verificar `sts get-caller-identity` y ejecutar dos veces `infra/30_data.sh` según §8 de `docs/PLAN_FASE2.md`. En paralelo, una persona revisa D7 y los candidatos PDF de `docs/T32_EVALUACION.md`; el detalle está en “Revisión final pendiente”. |
| URL pública (CloudFront) | https://dursf4nho4zl6.cloudfront.net (HTTP 200; incógnito y viewport responsive 400 × 899 revisados el 2026-11-14) |
| API (`API_URL`) | https://ve5oqmsyie.execute-api.us-east-1.amazonaws.com |
| `MODEL_ID` desplegado y aprobado (D6) | `us.anthropic.claude-haiku-4-5-20251001-v1:0` con SDK 2.8.0; el dueño decidió conservar Haiku 4.5 el 15-nov |

## Bloqueos

- T14 confirmó invocaciones Converse reales de Bedrock en `us-east-1` (22 tablas). Esta sesión actualizó la Lambda existente y publicó la UI; no creó recursos AWS.

- D9 decidida: `data/psi` permanece fuera de git; T18 está hecha. T21–T29 corresponden al equipo de interfaz. T32 sigue en curso por revisión D7/PDF. D3 sigue abierta para las subidas. T31 no se ejecutó porque STS identificó el perfil disponible como root; falta perfil IAM de mínimo privilegio.

(Formato: `- [hora] descripción — quién puede resolverlo`.)

## Prerrequisitos humanos

- [ ] Acceso AWS por persona y perfil `prometeo` en cada laptop
- [x] Invocación real de Claude en Bedrock (`us-east-1`), confirmada en T14 (22 llamadas)
- [ ] Acceso de push al repo para todo el equipo
- [x] `construir_corpus.py` del compañero en `pipeline/legacy/` (junto con `nasa_fuego_todo.py`, el descargador)

## Tareas

Estados: `pendiente` · `en curso` · `hecha` · `bloqueada` · `omitida (corte)`

| ID | Tarea | Prioridad | Estado | Agente / persona | Commit | Nota |
|---|---|---|---|---|---|---|
| T00 | Repo y docs | P0 | hecha | Claude · ferlr | (este commit) | Duplicado borrado, prototipos a archive/, decisiones y escenario real escritos |
| T01 | Datos en el repo | P0 | hecha | Claude · ferlr | (este commit) | 24 investigaciones de combustión, 22 CSV; data/ = 632 KB (meta sin listados de archivos ni contactos) |
| T02 | Scaffold + `00_check.sh` | P0 | hecha | Claude · ferlr | (este commit) | build, test y check_agnostic en verde. Falta que un humano corra infra/00_check.sh y anote MODEL_ID (esta laptop no tiene perfil prometeo) |
| T03 | Pack de demo | P0 | hecha | Claude · ferlr | (este commit) | Ruta rápida: SPECS del corpus del compañero. Pack completo: 24 estudios, 1,986 registros (1,889 pruebas + 97 campañas), 22 fuentes, 147 con bandera. g=0 solo en investigaciones de microgravedad (5 son de tierra) |
| T04 | Motor + vectores | P0 | hecha | Claude · ferlr | (este commit) | 22 vectores en verde con los valores de la guía §6.6/§6.7 (C4 D20, d=1.56/2.18/4.24, +7.8, 0/268, 36/107/11, 91 PMMA). tested_elsewhere usa la tolerancia (0.25σ) |
| T05 | Esqueleto del informe | P0 | hecha | Claude · ferlr | (este commit) | Informe React llenado desde pack/lens/mapping: Key findings, abstract por plantilla, Tables 1–4, Methods, References. Captura docs/screens/t05_report.png |
| T06 | Escenario y figuras | P0 | hecha | Claude · ferlr | (este commit) | Panel de escenario (sliders, selector, presets), Fig. 1 mapa, Fig. 2 cercanía, Fig. 3 huecos, niveles con icono+texto. Preset lunar: O₂ Near/not covered, presión Not studied, PMMA Studied. ~42 ms por paso de slider |
| T07 | Procedencia, PDF y URL | P0 | hecha | Claude · ferlr | (este commit) | Panel de procedencia (archivo, fila, valor original, conversión, DOI, SHA-256), Export PDF (9 páginas A4, docs/screens/t07_export.pdf), escenario en la URL. Sin desbordes a 400 px |
| T08 | Infra web (CloudFront) | P0 | hecha | Codex · stringbuilder | `55c18ed` | UI publicada con `infra/deploy_web.sh`; invalidación `I3LO3F80GPJHTV36YDX9FD4MAG`; CloudFront y `/favicon.svg` HTTP 200; revisión pública privada y móvil completada. |
| T09 | Lambda `/ask` y `/analysis` | P1 | hecha | Codex · stringbuilder | este commit | 26 tests y ambos eventos locales con SDK real OK; contrato en api/README.md |
| T10 | Infra API | P1 | hecha | Codex · stringbuilder | este commit | Lambda/Gateway con rol acotado, /ask 200 en 7.876 s; /analysis 200 |
| T11 | UI de preguntas y análisis | P1 | hecha | Codex · stringbuilder | `55c18ed` | En incógnito: `/ask` aplica 25 % O₂, 0.5 atm y Nomex; preguntas de ignición reciben el límite fijo. `/analysis` devolvió selección con fuentes; 35 pruebas web y 27 API pasan. |
| T12 | Ficha de datos para ML | P2 | hecha | Codex · stringbuilder | `b4f8ced` | Tabla descriptiva por estudio/archivo/columna/tipo; valores y unidades sin normalizar ni combinar; candidatos duplicados exactos quedan retenidos. Idoneidad ML pendiente de umbrales/definición humana; frecuencias no son clases validadas. |
| T13 | Comparar 2 estudios | P2 | hecha | Codex · stringbuilder | `db5386e`, `2e40fb6` | Selectores para dos estudios; columnas con metadatos, DOI, valores test/campaña separados, etiquetas, unidades fuente y enlaces a registros. Se corrigió el anidamiento HTML inválido en enlaces expandibles y se regeneró `docs/screens/t13_study_compare.png`. |
| T14 | Prueba agnóstica | P3 | hecha | Codex · stringbuilder | `bea99e1` | 22 tablas, 22 llamadas Bedrock, 103 filas reales; 21 tablas puntuadas: 148/227 asignaciones exactas (65.2%), 107/227 con unidad exacta (47.1%). Varias diferencias; el modelo no aprueba/reemplaza el mapping humano. `docs/agnostic_proof.md`. CSV originales no están versionados en `data/psi/tables`; se leyó la copia local sin incluirla. |
| T15 | Aceptación y entrega | P0 | hecha | Codex · stringbuilder | `55c18ed`, `07231c3` | Puntos 1–9 aceptados; T16 verificó el deploy desde otro equipo y la reutilización de recursos. |
| T16 | Publicar `main` desde otra laptop (cierra punto 9) | fase 2 · A | hecha | Codex · laptop actual | `07231c3` | API/web publicados; bucket, distribución, Lambda, rol y API existentes conservaron sus IDs; hash público/local `index-Ben2isQ8.js`. |
| T17 | Corregir `/ask` (psi, gravedad, sin 502) | fase 2 · A | hecha | Claude · ferlr; Codex · stringbuilder | `3720861`, `0813d37` | Verificación de T17 cumplida en la URL pública con Haiku 4.5 y SDK 2.8.0 (revisión independiente del 15-nov 00:10). D6 cerrada: el dueño conserva Haiku 4.5 y descarta migrar a 5.5. |
| T18 | Datos reproducibles | fase 2 · A | hecha | stringbuilder | esta entrega | `collect_data.py`/`build_pack.py` rutas configurables; 24 investigaciones, 22 CSV, pack temporal válido e idéntico byte a byte en los tres archivos. Descarga y artefactos siguen fuera de Git. |
| T19 | Análisis con más contenido | fase 2 · A | hecha | Claude · ferlr | `3720861`, `07231c3`, `0813d37` | `/analysis` real devuelve `mode: ai` y tres oraciones citadas para el preset lunar. |
| T20 | Motor del bloque B (grafo, partes, explicación, diferencias) | fase 2 · B | hecha | Claude · ferlr | este commit | 15 vectores; contrato en `docs/CONTRATOS_FASE2.md` §2 |
| T21–T29 | Pantallas del bloque B | fase 2 · B | pendiente | equipo de interfaz | | Motor y lógica local listos |
| T30 | Contratos del bloque C | fase 2 · C | en curso | Claude · ferlr | este commit | Propuesta escrita; falta aprobación humana y cerrar D3 (límites/costos). D1/D2 decididas |
| T31 | Infra de datos del bloque C | fase 2 · C | en curso | Claude · ferlr | este commit | Script pasó simulador y `bash -n`; ejecución AWS pendiente: perfil `prometeo` resuelve a root, se requiere principal IAM acotado |
| T32 | Extracción fuera de línea | fase 2 · C | en curso | laptop AWS · stringbuilder | esta entrega | Revisión/aprobación local, extracción y 56 llamadas reales. Final: 22/22 propuestas válidas; acuerdo 209/227, unidad conjunta 148/227. PDF: 15 candidatos verificados textualmente, 8 rechazados, 1 sin texto. D7 y soporte semántico pendientes; no se declara meta 85 % ni tarea hecha. `docs/T32_EVALUACION.md` |
| T33–T37 | Backend y pantallas del bloque C | fase 2 · C | pendiente | | | D1 decidido; D3 sigue abierta (límites del corpus) |

## Aceptación final (T15)

- [x] 1. URL abre en incógnito sin cuenta. La app no guarda el escenario en el servidor; API sin almacenamiento persistente.
- [x] 2. Preset lunar base: O₂ 30 % = *Near, not covered* (máximo sólido BASS-II 22.2 %); presión 0.694 atm = 10.2 psi = *Not studied*; PMMA = *Studied*.
- [x] 3. Actualización en vivo de escenario, niveles y análisis confirmada al aplicar preset y pregunta; T06 había medido ~42 ms por actualización del motor.
- [x] 4. Valor de procedencia abierto: archivo `PSI-25_Experimental table_BASS-II.csv`, fila 2 y DOI `10.60555/4qc4-de67`.
- [x] 5. Chrome Print Preview de la URL pública muestra 16 páginas con escenario, hallazgos, Methods y References.
- [x] 6. `/ask` aplicó O₂ 25 %, presión 0.5 atm y Nomex. La sugerencia de traje actualiza a O₂ 100 %, 0.293 atm y Nomex; la pregunta de comparación original devuelve `Only scenario changes are supported.` sin invocar el modelo. Preguntas de ignición reciben el mismo límite.
- [x] 7. `/analysis` mostró frases de hallazgo con fuentes verificadas. `pytest api/` valida que errores de API dejan plantilla (modo `template`); no se forzó caída en el sitio público.
- [x] 8. `npm test --prefix web` (54), `api/.venv/bin/python -m pytest api/` (39), build Vite/TypeScript y `scripts/check_agnostic.sh` en verde.
- [x] 9. Deploy desde otra laptop sin duplicar recursos: bucket `prometeo-hack-web-352818909129`, CloudFront `E2SO4K789H7YOQ`, Lambda `prometeo-hack-api`, rol `prometeo-hack-api-role` y API `ve5oqmsyie` conservaron sus IDs; hash público/local `index-Ben2isQ8.js`.

## Revisión final pendiente

- **T32:** revisar las discrepancias listadas en `docs/T32_EVALUACION.md` y los 15 candidatos PDF antes de cualquier aprobación nueva. El 92.1 % es acuerdo de asignación con el mapping vigente, no precisión científica; D7 sigue pendiente. Un PDF requiere texto/OCR revisado. La aprobación local no autentica al operador.

- **T31 / acceso AWS:** el 2026-11-15 el perfil `prometeo` autenticó como `arn:aws:iam::352818909129:root`. No se ejecutó `infra/30_data.sh`. Antes de crear/configurar recursos, sustituir el perfil por una identidad IAM de mínimo privilegio y volver a verificar la cuenta; no usar root para el flujo de trabajo. `bash -n infra/30_data.sh` sí pasó. Después se requieren las dos corridas idempotentes y la inspección de `infra/outputs.env` sin secretos.

- **Revisión humana de ML (T12):** la ficha conserva resultados originales y reporta frecuencias descriptivas. El equipo no ha definido clases destino ni umbrales; no debe usarse como veredicto de aptitud ni como selección de modelo.
- **Revisión humana del mapeo (T14):** la propuesta de Bedrock coincide con el mapping en 65.2% de asignaciones y 47.1% de asignación + unidad en muestras pequeñas. Revisar diferencias en `docs/agnostic_proof.md`; el mapping humano continúa siendo la referencia aprobada.
- **Reproducibilidad de T14:** el checkout no tiene `data/psi/tables`; se ejecutó desde `tools/datos_psi/tablas`, que permanece fuera de Git. Un clon limpio debe recibir esos CSV para repetir la corrida.

- **Revisión humana T12 (ML):** definir clases destino y umbrales de aptitud antes de interpretar frecuencias descriptivas como decisión de selección de modelo. Responsable: equipo/persona dueña del uso ML. Evidencia: criterios aprobados y anotados en `PROGRESS.md`.
- **Revisión humana T14/T32 (D7):** la persona que conoce las tablas (autor de `construir_corpus.py`) debe resolver las 79 diferencias de `docs/agnostic_proof.md` y revisar la lista de discrepancias en `docs/T32_EVALUACION.md`. Conservar mapping vigente hasta aprobación explícita; el porcentaje no sustituye esta decisión.
- **Revisión semántica PDF T32:** revisar cada candidato literal y su página/contexto en los cinco PDF enumerados en `docs/T32_EVALUACION.md`, incluyendo alcance experimental; rechazar los que no respalden valor, unidad y población de pruebas. El archivo sin texto requiere fuente legible/OCR revisado.
- **Aprobación T30 / D3:** aprobar o corregir el contrato §5 y confirmar límites de carga (20 MB, 60 páginas, 30 documentos), tras revisar la medición de costos exigida por el plan. Sin esa decisión no iniciar T33–T36. D1/D2 están decididas; D3 no.
- **D10/T37:** elegir segundo dominio con tablas públicas y pocas variables y asignar quién consigue su corpus antes de evaluar la prueba agnóstica.

## Bitácora de relevos

Una entrada por sesión de agente, la más reciente arriba.

### 2026-11-15 · T31 preflight y revisiones pendientes
- `git pull --rebase`: `main` ya sincronizada con `origin/main` en `97d1613`. El único elemento sin seguimiento es `tools/datos_psi/`; no se añadió a Git.
- Revisión estática de `infra/30_data.sh`: configura DynamoDB, bucket S3 privado, SQS/DLQ y Cognito; `bash -n infra/30_data.sh` pasó. El guion de T31 requiere dos ejecuciones reales y revisar outputs.
- AWS STS para `AWS_PROFILE=prometeo` devolvió cuenta `352818909129` y ARN `arn:aws:iam::352818909129:root`. No se ejecutó el guion ni se crearon o modificaron recursos. Se detuvo la operación para no usar identidad root, conforme al principio de permisos acotados de `AGENTS.md` §8.
- Se detallaron en “Revisión final pendiente” los responsables/evidencias esperadas para T12, D7/T14/T32, soporte semántico PDF, T30/D3 y D10/T37. Ninguna aprobación humana fue inferida.
- **Siguiente paso:** cambiar el perfil `prometeo` a una identidad IAM de mínimo privilegio, comprobar cuenta con STS y completar la verificación de dos corridas de T31. En paralelo, solicitar la revisión humana D7/PDF y la aprobación de D3.

### 2026-11-15 02:14 CST · T18 datos reproducibles
- `collect_data.py --salida` ahora filtra descarga hacia `<raíz>/tables` y `meta`; `build_pack.py --data-dir/--output-dir` permite entrada y salida temporal. `induce_schema.py --tables-dir` ya podía recibir la misma ruta.
- Verificación sobre descarga local `tools/datos_psi`: 24 investigaciones de combustión, 22 CSV. Pack temporal: 24 estudios, 1986 registros, 22 fuentes; `validate_pack.py` OK. `cmp` confirmó byte idéntico `pack.json`, `mapping.json`, `lens.json` al publicado.
- No se tocó `web/public/demo` y los datos/artefactos permanecen fuera de Git. T18 queda hecha. Guía en `pipeline/README.md`.

### 2026-11-15 01:49 CST · T32 CLI conjunta y reanudable
- **Workflow:** `pipeline/ingest_run.py` conecta parseo/perfiles, propuestas conjuntas, edición versionada, gate de aprobación, extracción y evaluación PDF. IDs de propuestas namespaced por documento; posibles equivalencias se ofrecen para revisión, no fusión automática. Cache content-addressed por hash de fuente/parser/Poppler/modelo/prompt/payload; las respuestas crudas se revalidan y los reintentos necesitan `--retry-failed`.
- **Constantes:** ahora requieren filas, valor/unidad fuente, conversión explícita, cita y soporte semántico marcado por revisor; discrepancias se rechazan; trazabilidad de documento de evidencia y destino. `verify-paper` CLI requiere documento/páginas solicitados.
- **Prueba local del workflow:** 22 respuestas guardadas importadas, 0 llamadas; reejecución: 22 cache parse, 22 respuestas reused. Mapping aprobado: 1984 filas, 4505 valores y 287 celdas retenidas/rechazadas. PDF: 4 resultados reusados, 1 archivo sin texto deja el lote con estado fallido.
- **Bedrock nuevo:** una invocación para FLEX página 16; respuesta guardada y la próxima ejecución reutiliza su request key. 3 candidatos en verificación de texto, 3 rechazados por ubicación. No se repitieron las 3 llamadas PDF exitosas.
- **Pruebas:** API/pipeline 72, web 54, validate_pack y check_agnostic pasan. T32 sigue en curso; no desplegar ni modificar pack.

### 2026-11-15 01:38 CST · continuación T32: integración y reanudación
- Base `3f081e9` sincronizada; se conservan corpus/artefactos locales y resultados reales. No repetir llamadas exitosas cuando entradas coincidan.
- Alcance: CLI por etapas con caché invalidable, propuesta conjunta sin fusiones implícitas, unidad/conversión de constantes y decisiones humanas concretas. No infraestructura ni cambios al pack.

### 2026-11-15 01:33 CST · T32: extracción local y evaluación real
- **Recuperación:** `63b09cc` no existía; se continuó desde `c9906c8` por instrucción del dueño. Inicio `6851fb1`. Corpus y artefactos fuera de git; sin tocar `frontend`, infraestructura ni pack publicado.
- **Implementado:** guardado de respuesta SDK/tokens previo a rechazo; JSON Markdown completo sin relajar validación; revisión/aprobación explícita por versión/corpus, extracción con citas, conversiones y conflictos; constantes requieren alcance revisado y conservan ambos orígenes. Candidatos PDF no se convierten automáticamente en valores aprobados.
- **AWS real:** STS correcto; modelo D6 Haiku 4.5 y SDK 2.8.0. Primera BASS-II rechazada por envoltura Markdown, corregida y revalidada localmente. Corrida inicial 15/22 válidas; reintento 6/7; corrida final homogénea **22/22 válidas**, **209/227 asignaciones (92.1 %)** y **148/227 con unidad exacta (65.2 %)**. No prueba precisión científica ni cierra D7.
- **PDF:** cinco originales oficiales evaluados; cuatro llamadas, 23 candidatos, 15 con formato/cita verificados, 8 rechazados; un PDF sin capa de texto. Pendientes soporte semántico, alcance y revisión; no se atribuyó presión a filas de tablas.
- **Verificación local:** Python 3.12: 64 pruebas API/pipeline y 32 subtests; web 54; agnostic, validate_pack y diff-check pasan. Extractor determinista sobre mapping humano vigente: 1984 filas con 4505 valores, 287 celdas retenidas/rechazadas, 0 conflictos. No es precisión del modelo.
- **Corrección del evaluador:** se alinearon de forma unívoca cabeceras con espacios externos frente al mapping publicado; citas originales intactas. Métricas recalculadas desde respuestas guardadas, sin nuevas llamadas.
- **Informe y relevo:** `docs/T32_EVALUACION.md` conserva métricas, errores, lista D7, fuentes, hashes, tokens y comandos. `pipeline/README.md` explica entorno, aprobación y extracción. T32 permanece **en curso**; personas revisan D7 y PDF antes de seguir con extracción aprobada/publicación. D3 sigue abierta; no se ejecutó T31.

### 2026-11-15 01:13 CST · retoma T32 en laptop AWS
- Base sincronizada `c9906c8`; `63b09cc` no existe en main. Se verifica el código existente sin restaurar corpus ni tocar frontend.
- Python 3.12: 10 pruebas pipeline y 3 adaptador pasan. BASS-II parseada en `/tmp/prometeo-t32/`.
- Trabajo autorizado: llamada real con MODEL_ID aprobado, revisión/aprobación explícita, extracción y evaluación local. Sin infraestructura, subidas ni cambios al pack. D7/D3 siguen pendientes.

### 2026-11-15 00:42 CST · regla persistente del modelo aprobado
- **Decisión del dueño:** Haiku 4.5 es obligatorio para las siguientes tareas. `AGENTS.md` §6 exige conservar el perfil de `infra/config.env` en API, pipeline, extracción y deploy; cualquier migración necesita una nueva instrucción explícita del dueño.
- **Guía:** `infra/README.md` documenta cómo cargar `MODEL_ID` y usarlo también como `BEDROCK_MODEL_ID` en comandos manuales. Se corrigió su estado de despliegue obsoleto remitiendo a este seguimiento.
- **Alcance:** documentación y comentarios de configuración; no cambia el valor de `MODEL_ID`, no requiere deploy y mantiene el siguiente paso de T31/T32.

### 2026-11-15 00:37 CST · decisión del dueño: conservar Haiku 4.5
- **D6 cerrada:** se conserva `us.anthropic.claude-haiku-4-5-20251001-v1:0`, ya configurado y probado con SDK 2.8.0. Se descarta la migración a Haiku 5.5 y se retira el requisito de solicitar acceso.
- **T17:** permanece hecha con la evidencia pública registrada en `0813d37` y la revisión posterior; no requiere otro deploy para esta decisión.
- **Alcance:** documentación activa actualizada; el historial del intento con 5.5 se conserva. T31/T32 y el siguiente paso del relevo siguen vigentes.

### 2026-11-15 · Codex · T32 perfiles y propuestas revisables
- Perfilado determinista CSV/PDF y validación estricta de propuestas en `pipeline/ingest.py`. Adaptador separado `api/ingest_propose.py` con SDK oficial, modelo desde entorno y modo preparación sin red.
- Validación: 27 tablas perfiladas; petición BASS-II preparada (129 filas, 17 columnas). 13 pruebas locales, pack y agnostic pasan. Python 3.14; falta repetir con 3.12.
- No se invocó Bedrock: falta perfil `prometeo` y SDK local. Respuestas guardadas se validan para revisión, jamás se aprueban automáticamente. No hay medición de precisión nueva.
- Pendiente T32: revisión/aprobación, extracción, fusión/constantes y evaluación 22 tablas/5 PDF con D7. No se marca hecha.
- Git pull sigue fallando por permisos de configuración SSH; no se cambiaron credenciales ni configuración del sistema. Corpus/artefactos fuera de git.


### 2026-11-15 · Codex · T32 lectura local y verificación de citas
- Implementado `pipeline/ingest.py`: CSV con celdas originales y filas lógicas, PDF por página con Poppler, SHA-256, duplicados, errores por documento; verificador de citas con ubicación exacta. No llama a AWS ni modifica el pack.
- Prueba local: 30 CSV y 45 PDF únicos leídos, 3 PDF sin texto extraíble, 2 duplicados. 75 citas de control verificadas; no es precisión de extracción. Informe en `docs/T32_LECTURA_LOCAL.md`.
- Verificación: 7 pruebas unitarias y `git diff --check` pasan. Python disponible 3.14.4; pendiente 3.12.
- T32 NO terminada: faltan perfilado, propuesta Bedrock, extracción aprobada y evaluación de 22 tablas/5 PDF; D7 sigue pendiente.
- Git pull/push fallaron por permisos de `/etc/ssh/ssh_config.d/20-systemd-ssh-proxy.conf`; commits locales. Descarga y artefactos permanecen fuera de git.
- Siguiente paso: implementar perfilado/propuesta con validación y revisión explícita antes de extraer; luego medición con Bedrock.


### 2026-11-15 00:40 CST · Claude · ferlr · se levanta la restricción del bloque C; T31 escrita
- **Decisión del dueño (D1):** se retira la prohibición de Cognito, SQS y DynamoDB. `AGENTS.md` §8 ahora exige que cada recurso esté en un script aprobado de `infra/` y con permisos acotados.
- **T31:** `infra/30_data.sh` (tabla, bucket de corpus, cola con DLQ, Cognito). **No se ha ejecutado:** esta laptop no tiene perfil `prometeo`. Probado con un simulador del CLI: 6 recursos en la primera corrida, 0 en la segunda, `outputs.env` sin duplicados y con las salidas anteriores intactas.
- **D9 (`data/psi`):** comprobado que los 22 CSV borrados en `df713ec` son idénticos a la descarga local (`pipeline/tools/datos_psi/tablas`, que además trae 5 tablas de otras áreas) y que el pack generado con ellos es idéntico byte a byte al publicado. Restaurarlos no cambia el producto. Sigue pendiente de decisión; no se restauraron.
- **Siguiente paso exacto:** en la laptop con perfil, `docs/PLAN_FASE2.md` §8 (dos corridas de `infra/30_data.sh`). Después T32 (extracción fuera de línea; necesita Bedrock) y T33.

### 2026-11-15 00:15 CST · Claude · ferlr · revisión independiente del relevo de Codex
- **Comprobado contra la URL pública (sin perfil AWS):** `/ask` con `"30% oxygen, 10.2 psi, PMMA"` → 200, `p: 0.6941`; con `"…PMMA at 0.17 g"` → 200 con `g: 0.17`; las cuatro sugerencias de `lens.questions` → 200 con todas sus variables; pregunta de ignición → `unsupported`. Con `version: 2`: `"70.3 kPa, cotton fabric"` → `p: 0.6938` y nota `unknown_category`; `"900 cm/s flow"` → nota `out_of_range`. `/analysis` con `analysis_lunar.json` → `mode: ai`, 3 oraciones con fuente, `dropped: 0`.
- **Web:** CloudFront sirve `lens.json` con `parts` y la sugerencia corregida. El bundle sigue siendo `index-Ben2isQ8.js`: es correcto, el código nuevo del motor aún no lo usa ninguna pantalla.
- **Local:** web 54/54, API 39/39, `check_agnostic.sh` OK. Los tres commits de Codex no llevan coautoría.
- **Correcciones de registro:** T17 pasa a `hecha` (su verificación se cumple; lo bloqueado es D6, la migración de modelo). Bitácora reordenada, la más reciente arriba.
- **Detalles menores encontrados (no bloquean):** (1) con `"500 mmHg"` el modelo convirtió él mismo a atm y devolvió `p: 0.66` (500/760 = 0.658): el valor es correcto pero redondeado; para que lo convierta el código hay que agregar mmHg, bar y torr a `display_units` del esquema, lo que exige regenerar el pack (depende de D9). (2) `"40% humidity"` se omitió sin nota `unknown_variable`: el modelo no listó la condición. (3) `/analysis` eligió 3 de las 5 oraciones posibles y dejó fuera las de `tested_elsewhere`.
- **No verificado desde aquí:** el 403 de Haiku 5.5 y que los scripts no crearon recursos; es lo que reporta Codex.

### 2026-11-15 00:00 CST · Codex · registro del relevo
- **Commit:** `0813d37` (`T17: retain gravity in scenario requests`), incluye el ejemplo de gravedad en `ASK_SYSTEM`, la regresión, SDK 2.8.0 y actualización de la documentación.
- **Estado:** `main` y `origin/main` se sincronizarán con este registro. T16/T15 y T19 están hechas; T17/D6 sigue bloqueada por el 403 de acceso Haiku 5.5.
- **Siguiente paso exacto:** una vez habilitado Haiku 5.5 en la cuenta, desplegarlo con `infra/20_api.sh` y repetir las verificaciones de §7. La API actual permanece operativa con Haiku 4.5.

### 2026-11-14 23:56 CST · Codex · cierre T16/T19 y bloqueo de acceso Haiku 5.5
- **T16/T15:** STS autenticó el perfil `prometeo`. Preflight confirmó bucket, CloudFront `Deployed`, Lambda, rol, API y perfil Bedrock existentes. `infra/20_api.sh` y `infra/deploy_web.sh` reutilizaron los IDs; invalidación `I10YEYBHUBAGG1RHJVA56BX425` terminó `Completed`. CloudFront devolvió HTTP 200 y sirvió el mismo `index-Ben2isQ8.js` que generó el deploy. Punto 9 y T15 quedan hechos.
- **Pruebas locales:** `npm test --prefix web` (54/54), `api/.venv/bin/python -m pytest api/ -q` (39/39), `npm run build --prefix web`, `scripts/check_agnostic.sh` y `git diff --check` OK.
- **T17:** las cuatro sugerencias de `/ask`, la presión en psi, `0.17 g` y la pregunta de ignición fueron probadas contra la API. Con Haiku 4.5 y SDK 2.8.0 todas devolvieron HTTP 200; gravedad se conserva como `g: 0.17` e ignición devuelve el límite fijo. Se añadió un ejemplo explícito de gravedad a `ASK_SYSTEM` y su prueba de regresión.
- **D6:** Haiku 5.5 aparece `ACTIVE` en Bedrock, pero la invocación real con SDK 2.8.0 recibió `403 PermissionDeniedError: anthropic.claude-haiku-5-5 is not available for this account`. Se restauró `MODEL_ID` a Haiku 4.5 y se volvió a desplegar la Lambda para mantener el servicio funcional. T17 queda bloqueada por acceso a Haiku 5.5.
- **T19:** `/analysis` con `analysis_lunar.json` respondió HTTP 200, `mode: ai`, tres oraciones con fuentes y `dropped: 0`.
- **Siguiente paso exacto:** el dueño habilita el modelo Haiku 5.5 para la cuenta AWS; después repetir `/ask`, `/analysis` y cerrar T17/D6. No se crearon recursos y `tools/datos_psi/` permanece local.

### 2026-11-14 23:33 CST · Codex · recuperación del relevo Fase 2
- **Inicio:** `git fetch` y `git pull --rebase` confirmaron que `main` coincide con `origin/main` en `3720861`; no había cambios versionados locales. Se conserva `tools/datos_psi/` fuera de Git según D9.
- **Tarea en curso:** T16. T17 y T19 tienen código y pruebas locales, pero esperan despliegue y validación con Bedrock real.
- **Siguiente paso exacto:** cargar `AWS_PROFILE=prometeo`, `infra/config.env` y `infra/outputs.env`; correr primero las pruebas de §7 y después `infra/20_api.sh` y `infra/deploy_web.sh`. Confirmar que no se crean recursos y ejecutar los cuatro casos `/ask` más `/analysis`.

### 2026-11-14 23:20 CST · Claude · ferlr · fase 2 sin AWS: motor, API en código y contratos
- **Decisión del dueño:** la fusión de `frontend` la hace su equipo; no está en este plan. Motor, API, infra y contratos siguen en `main`.
- **Motor (hecho):** `web/src/engine/extend.ts` con `assess`, `partLevels`, `explainRank`, `diffAssessment`, `graph` y `emphasis`; 15 vectores sobre el pack real. `lens.parts` y `lens.graph` en `pipeline/lens.json` y en el lens publicado.
- **Estado local (hecho, sin pantallas):** `web/src/contracts/workspace.ts` (proyectos y variantes en `localStorage`), 3 pruebas.
- **API (código hecho, SIN desplegar ni probar con Bedrock):** `/ask` convierte psi y kPa en código, descarta lo inválido sin 502 y, con `version: 2`, devuelve `notes`; `/analysis` suma `tested_elsewhere` y el valor extremo. Sin `version`, las respuestas son compatibles con la interfaz publicada.
- **Contratos:** `docs/CONTRATOS_FASE2.md` (motor, estado local, API vigente y propuesta del backend del bloque C), tipos en `web/src/contracts/backend.ts`, ejemplos reales en `docs/fixtures/fase2/`.
- **Corrección a la entrada anterior:** `/analysis` no devuelve "una sola oración para el preset lunar"; esa prueba usó `api/events/analysis.json`, que solo trae un hallazgo.
- **Verificado:** web 54/54, API 38/38 (`.venv` local con Python 3.14, no el 3.12 del proyecto), build, `check_agnostic.sh`, `validate_pack.py`.
- **Siguiente paso exacto:** en la laptop con perfil `prometeo`, seguir `docs/PLAN_FASE2.md` §7: `infra/20_api.sh`, `infra/deploy_web.sh` y los `curl` de comprobación. Si `/ask` devuelve `unsupported` donde debería haber condiciones, ajustar `ASK_SYSTEM`.
- **Historia reescrita:** los commits `7b582f3` y `d023aa8` se rehicieron sin la línea de coautoría y ahora son `7b663ed` y `3720861` (mismo contenido). Quien los haya bajado: `git fetch && git reset --hard origin/main` si no tiene cambios locales, o `git pull --rebase`. Regla nueva en `AGENTS.md` §2: ningún commit lleva coautoría de agentes.
- **Ojo con:** `pipeline/tools/` y `tools/` son copias locales de la descarga de PSI, sin versionar; `data/psi` sigue fuera de git (decisión D9 abierta).

### 2026-11-14 22:50 CST · Claude · ferlr · revisión del MVP y plan de fase 2
- **Verificado (solo lectura pública, sin perfil AWS):** web 35/35, API 28/28, build, `check_agnostic.sh` y `validate_pack.py` OK. CloudFront 200 y sirve el build de `main` (`index-Ben2isQ8.js`). `/ask` y `/analysis` públicos responden 200 con los eventos de `api/events/`.
- **Fallos encontrados en la URL pública:** `/ask` devuelve 502 cuando la presión viene en psi (`"30% oxygen, 10.2 psi, PMMA"`); descarta la gravedad sin avisar (`"…at 0.17 g"`); la sugerencia "Lunar gravity, 30% oxygen, 10.2 psi, cotton fabric" daba 502. `/analysis` devuelve una sola oración para el preset lunar.
- **Corregido en este commit:** esa sugerencia (por una verificada contra la API) en `pipeline/lens.json` y `web/public/demo/lens.json`, que además se habían separado; `build_pack.py` ya no sobrescribe el pack con uno vacío cuando falta `data/psi` (borrado de git en `df713ec`); README sin la nota de deploy pendiente. **Falta `infra/deploy_web.sh` para publicar la sugerencia corregida.**
- **Plan:** `docs/PLAN_FASE2.md` con los pendientes del MVP (P1–P13), 11 decisiones para personas (D1–D11) y las tareas T16–T37 (cierre del MVP, visión sin backend, construcción de la base con corpus propio).
- **Siguiente paso exacto:** con perfil `prometeo`, T16 (fusionar `frontend` conservando de `main` `api/handler.py`, su prueba y `lens.json`; desplegar desde otra laptop cierra el punto 9) y T17 (psi y gravedad en `/ask`). Sin AWS se puede empezar T18, T19 (código y pruebas) y T20.
- **Ojo con:** `frontend` va 2 commits detrás de `main`; fusionarla sin cuidado reintroduce el fallo de la sugerencia del traje.

### 2026-11-14 21:24 CST · Codex · aceptación web/API y correcciones finales
- **Cambios:** CSS móvil apila las filas de escenario, conserva controles numéricos y niveles visibles y añade etiquetas; `web/index.html` enlaza el favicon SVG, evitando la petición 403 a `/favicon.ico`. `/ask` devuelve el límite de contenido de forma determinista para preguntas explícitas de ignición, combustión, inflamabilidad, fuego/llamas, seguridad, riesgo, predicción o propagación. Prueba de regresión añadida.
- **Commits y publicación:** `55c18ed` (`T15: close acceptance findings and publish fixes`), subido a `origin/main`. `infra/deploy_web.sh` publicó la web; invalidación `I3LO3F80GPJHTV36YDX9FD4MAG`, root y `/favicon.svg` respondieron HTTP 200. `infra/20_api.sh` actualizó la Lambda existente; API `https://ve5oqmsyie.execute-api.us-east-1.amazonaws.com`. No se crearon recursos nuevos.
- **Revisión del sitio:** Chrome incógnito, URL pública, viewport responsive 400 × 899. Se ven sliders, campos numéricos, nivel y base sin recorte. El preset lunar produjo 30 % O₂ / 0.694 atm / PMMA con niveles *Near, not covered* / *Not studied* / *Studied*. `/ask` aplicó 25 % / 0.5 atm / Nomex; pregunta de ignición devolvió el mensaje de límite. `/analysis` mostró frases con DOI/fuentes. Print Preview presentó 16 páginas. El favicon ya se carga como `favicon.svg`; sin error 403. Una llamada `/ask` anterior a actualizar la Lambda devolvió 502; al repetirla tras el deploy se obtuvo el mensaje fijo esperado.
- **Verificación:** `npm test --prefix web` 35/35; `npm run build --prefix web` OK; `api/.venv/bin/python -m pytest api/` 27/27; `scripts/check_agnostic.sh` OK; `git diff --check` OK. GET/HEAD CloudFront y HEAD del favicon: 200.
- **Pendiente real:** punto 9 de T15, ejecutar el script desde una segunda laptop con su perfil `prometeo`. T08 y T11 quedan hechas; T15 sigue en curso hasta registrar esa comprobación. No se generó evidencia directa de fallo de `/analysis` en navegador; su fallback cuenta con prueba automatizada.
- **Siguiente paso exacto:** en otro equipo, configurar el perfil AWS `prometeo`, ejecutar `bash infra/deploy_web.sh` y anotar si reutiliza bucket/distribución; si pasa, marcar punto 9 y T15 hechas. Mantener pendiente la revisión humana de resultados T12 y discrepancias T14.

### 2026-11-14 · Codex · corrección de la sugerencia de traje
- **Hallazgo:** la sugerencia “Which conditions are closest…” pedía recuperar/rankear estudios, pero `/ask` solo traduce cambios de escenario. El fallo del modelo se presentaba como HTTP 502.
- **Cambio:** la sugerencia ahora pide aplicar O₂ 100 %, 0.293 atm y Nomex. La pregunta de comparación se reconoce como contenido no soportado y recibe el límite fijo sin invocar Bedrock; se añadió prueba de regresión y se actualizó la documentación del producto.
- **Verificación:** `npm test --prefix web` (35/35), `api/.venv/bin/python -m pytest api/` (28/28), build Vite/TypeScript, `scripts/check_agnostic.sh` y `git diff --check` OK. En CloudFront, la sugerencia aplicada mostró O₂ 100, presión 0.293 atm y Nomex, con “Scenario updated”.
- **Publicación:** web con invalidación `I5QRYPFRMSA2JOODN9490YBX46`; Lambda existente actualizada mediante `infra/20_api.sh` en `https://ve5oqmsyie.execute-api.us-east-1.amazonaws.com`. No se crearon recursos AWS.
- **Commit:** `67a81e1` (`T15: fix spacesuit scenario question`).
- **Siguiente paso exacto:** subir los commits locales; para cerrar T15 aún se requiere que otra laptop con perfil `prometeo` ejecute `bash infra/deploy_web.sh`.

### 2026-11-14 20:41 CST · Codex · publicación web y revisión de entrega
- Preflight: `npm test --prefix web` (35/35), `npm run build --prefix web`, `scripts/check_agnostic.sh` y `python3.12 -I pipeline/validate_pack.py` OK (24 estudios, 1,986 registros, 22 fuentes). AWS STS con perfil `prometeo` confirmó la cuenta configurada; no se crearon recursos nuevos.
- Publicación: `infra/deploy_web.sh` compiló con `VITE_API_URL`, sincronizó los archivos y creó la invalidación CloudFront `I8Q4TEXP1D0GNL00604TJLUCQO` para `/*`; la invalidación terminó. GET y HEAD de `https://dursf4nho4zl6.cloudfront.net` devuelven HTTP 200; el HTML servido referencia `index-CsXymyPQ.js`, mismo hash que produjo el build del deploy, y el bundle contiene `Compare two studies` y `Analysis`.
- Límite de revisión: el navegador conectado no estuvo disponible en esta sesión. HTTP y bundle confirman que los archivos actuales se sirven, pero no prueban la interacción/render en navegador privado ni móvil; por ello los puntos 1–7 y 9 quedan sin marcar y T08/T11/T15 continúan en curso.
- Siguiente paso exacto: completar manualmente la revisión de aceptación en navegador privado y móvil y anotar evidencia de cada punto antes de marcar T08/T11/T15 hechas. `docs/PLAN.md` no tiene tareas posteriores a T15.

### 2026-11-14 20:34 CST · Codex · corrección final de T13
- Hecho: los enlaces expandibles de registros (`details/summary`) salieron de un `<p>` que provocaba anidamiento HTML inválido; se envolvieron en un `<div>` y se conservó su alineación con CSS. Captura regenerada y revisada: muestra ACME/Flame Design y BASS-II en dos columnas con DOI, valores, etiquetas y procedencia.
- Commit de código/captura: `2e40fb6` (`T13: fix invalid disclosure nesting`).
- Verificado después del cambio: `npm test` (35/35), `npm run build`, `api/.venv/bin/python -m pytest api/` (26/26), `scripts/check_agnostic.sh`, captura visual y `git diff --check` OK. La salida de Chrome contenía avisos del display link de macOS, sin evidencia de error de React; la captura se inspeccionó.
- Siguiente paso exacto: publicar este commit y el registro de esta entrada; luego el dueño despliega la UI integrada y completa la revisión privada/móvil de T08/T11/T15. No se hizo deploy.

### 2026-11-14 20:28 CST · Codex · T14 y comienzo T15
- Hecho: `pipeline/induce_schema.py` ejecutó una propuesta Bedrock por cada una de las 22 tablas del pack, con cinco filas como máximo (103 filas disponibles). Se compararon 227 columnas de 21 tablas con referencia humana; la tabla resumen PSI-142 no tiene mapping aprobado y no entra al porcentaje.
- Resultado real: 148/227 asignaciones exactas (65.2%); 174/227 unidades exactas (76.7%); 107/227 coincidencias conjuntas (47.1%). La salida con discrepancias por encabezado queda en `docs/agnostic_proof.md`; es evidencia exploratoria, no aprobación del mapping.
- Reproducción: `export AWS_PROFILE=prometeo && source infra/config.env && python3.12 -I pipeline/induce_schema.py --tables-dir tools/datos_psi/tablas`. 22 llamadas Converse con `MODEL_ID` configurado; 15,949 tokens de entrada y 9,313 de salida.
- Límite de checkout: los CSV no están presentes en `data/psi/tables`; la corrida usó `tools/datos_psi/tablas`, que ya estaba local y permanece fuera del commit. Un clon limpio necesita recibir/cargar la copia fuente antes de reproducir T14.
- Verificación T15 local: web 35/35, API 26/26 en `api/.venv` (Python 3.12.13), build Vite/TS, `check_agnostic.sh`, sintaxis Python de T14 y `git diff --check` OK. `python3.12 -m pytest` del sistema falla por `No module named pytest`; se usó el entorno versionado local `api/.venv`.
- URL actual: CloudFront responde HTTP 200 por HEAD, pero esa respuesta no comprueba el render ni contiene la UI final de este checkout. No se hizo deploy. GET al root de API responde 404, esperado porque no existe ruta raíz; los endpoints `/ask` y `/analysis` están previamente verificados en T10.
- Siguiente paso exacto: revisar y subir el README de jueces y este estado T15. El dueño debe desplegar la UI integrada y revisar en navegador privado/móvil los ítems restantes de T08/T11/T15.

### 2026-11-14 20:29 CST · Codex · T15 preparación de entrega
- Hecho: README en inglés para jueces con URL, uso en tres pasos, fuentes/licencia, comportamiento determinista, límites del análisis y alcance del MVP.
- Verificado: CloudFront `HEAD` HTTP 200; web 35/35 Vitest y build; API 26/26 con el entorno local Python 3.12; `check_agnostic.sh`; compilación sintáctica de `pipeline/induce_schema.py`; `git diff --check`.
- Pendiente: el estado de CloudFront no demuestra que la UI de este checkout esté publicada. No se desplegó por instrucción del dueño. Los ítems públicos de T08/T11 y 1–7/9 de aceptación T15 siguen abiertos; ver lista Revisión final pendiente.
- Siguiente paso exacto: el dueño integra cambios finales, ejecuta `infra/deploy_web.sh` y valida URL en privado y móvil, preguntas, análisis, procedencia y PDF; luego registra la evidencia y cierra T08/T11/T15.

### 2026-11-14 20:18 CST · Codex · T13 y comienzo T14
- Hecho: T13 permite comparar dos estudios elegidos. Presenta título, objetivo/condiciones (expandibles cuando son extensos), subjects, instrumentos, DOI, valores de variables en unidades normalizadas, columnas/unidades originales y registros de test/campaña por separado con acceso a provenance.
- Verificado: `docs/screens/t13_study_compare.png` generado desde la versión local y revisado visualmente; muestra la comparación en dos columnas (ACME/Flame Design y BASS-II), citas DOI, valores, etiquetas y unidades. `npm test` 35/35, `npm run build` y `git diff --check` OK.
- Siguiente paso exacto: T14, generar propuesta de esquema a partir de cinco filas de tablas reales, cotejar por columna con `mapping.json`, guardar aciertos y alcance del muestreo en `docs/agnostic_proof.md`.
- Pendiente de revisión final: deploy y revisión visual en URL pública para T08/T11; cierre de checklist T15 después de que el dueño publique la UI final.

### 2026-11-14 20:01 CST · Codex · T12 y comienzo T13
- Hecho: T12 agrega ficha determinista de resultados aprobados por mapping, agrupados por estudio, fuente, columna literal y tipo. Presenta denominadores, datos completos, cobertura de unidades declaradas, frecuencias textuales y candidatos de filas exactas repetidas entre fuentes. Todos los registros candidatos permanecen incluidos.
- Límite para revisión final: no hay en el contrato una definición de target/clase ni umbrales de idoneidad ML. La UI llama descriptivas a las frecuencias y no emite un veredicto de aptitud; el equipo debe definir criterios antes de usarla para elegir un modelo.
- Verificado: Vitest 35/35, build de producción, `scripts/check_agnostic.sh` y `git diff --check` OK. Un primer assertion de orden en una prueba nueva falló; corregido para validar ambos tipos sin asumir orden y la corrida final pasó.
- Siguiente paso exacto: T13, comparación lado a lado de dos estudios con unidades, citas y etiquetas; guardar captura. El deploy final web y la inspección pública continúan a cargo del dueño antes de cerrar T08/T11/T15.

### 2026-11-14 19:41 CST · Codex · T11 lista para deploy del dueño
- Hecho: barra /ask con sugerencias de lens, validación de respuesta, chips que enfocan controles editables; Analysis con fuentes, debounce 800 ms, cancelación de solicitudes obsoletas y timeout 20 s; plantilla explícita ante error.
- Deploy: infra/deploy_web.sh exporta VITE_API_URL desde API_URL antes del build. Guía actualizada; no se publicó la nueva UI, por instrucción de reservar el deploy final al dueño.
- Verificado: 32 tests web (22 motor + 10 contratos API), 26 API, build con API_URL, pack, agnostic, shell syntax y git diff --check OK. API pública /ask y /analysis ya verificadas en T10 (2bda497).
- Pendiente: verificación visual pública de T08/T11; no se marca T11 hecha porque el plan requiere comprobar interacción en URL pública. T12–T15 no iniciadas.
- Siguiente paso exacto: integrar cambios finales del equipo, ejecutar infra/deploy_web.sh y verificar pregunta 25% O₂ / 0.5 atm / Nomex, edición, fuentes y fallback; cerrar T08/T11 solo con evidencia.


### 2026-11-14 · Codex · T10
- Hecho: infra/20_api.sh, Lambda Python3.12 arm64, Gateway HTTP, CORS CF_URL y throttle 5/10; outputs versionados sin secretos.
- Verificado: shell sintaxis y llamadas públicas /ask HTTP 200 7.876238 s; /analysis HTTP 200 0.903628 s, mode=ai y fuentes. SDK/pack incluidos para Linux.
- Incidencia corregida: serialización de política vacía en primera ejecución; segunda ejecución reutilizó función/API/rol y completó.
- Siguiente paso: T11, integrar UI; conservar publicación final web para dueño. T08 revisión visual aún pendiente.


### 2026-11-14 19:33 CST · Codex · T09
- Hecho: handler /ask y /analysis, verificador, eventos de datos reales, documentación, dependencias fijadas y smoke. Inicio 7b67e86; se inicia T10.
- Verificado: Python 3.12.13, 26 tests API, 22 web, build, pack y agnostic OK. Smoke con SDK AnthropicBedrock: /ask 200 (25, 0.5, Nomex), /analysis 200 mode=ai (268 pruebas, fuentes PSI verificadas).
- Recorte: redacción restringida a frases verificables de seis códigos; no se admite prosa libre ni fuentes/contadores del cliente sin cotejo con pack. Otros códigos se omiten; fallback explícito.
- Trampas resueltas: aws login requiere botocore[crt] local; el modelo puede envolver JSON en bloque markdown y se acepta solo ese envoltorio exacto. API no desplegada aún.
- Siguiente paso: T10, scripts idempotentes para empaquetar dependencias Linux y desplegar Lambda/Gateway; después T11. El deploy final de web sigue a cargo del dueño.


### 2026-11-14 · Codex · guía de relevo y deploy final
- Estado remoto: CloudFront Deployed y curl HTTPS HTTP/2 200 confirmados; despliegue base en 3b53e4d.
- Documentación: infra/README.md detalla contribución del equipo sin deploy, autenticación individual, archivos env compartidos, publicación final por el dueño, verificación y recuperación.
- Configuración: se reutilizan infra/config.env e infra/outputs.env versionados y sin secretos; no hace falta duplicarlos en un .env raíz.
- Verificación de esta entrega: 22/22 tests web, build, check_agnostic y validate_pack OK; git diff --check OK. Prueba API: `No module named pytest` con Python 3.14; no aprobada.
- Alcance de esta entrega: documentación; no se volvió a publicar ni se cambiaron recursos AWS. La publicación final queda a cargo del dueño cuando integre los cambios del equipo.
- Pendiente real: comprobación visual (herramienta de navegador indisponible); T08 no se marca hecha solo por HTTP 200. API/Bedrock y T15 siguen pendientes.


### 2026-11-14 19:20 CST · Codex · stringbuilder
- Hecho: T08 implementada y ejecutada con perfil prometeo. S3 privado, OAC y CloudFront; IDs y URL en infra/outputs.env. Inicio registrado en 765643f.
- Verificado: STS; npm ci (0 vulnerabilidades reportadas), 22/22 tests web, build TypeScript/Vite, check_agnostic OK, validate_pack OK (24 estudios / 1986 registros / 22 fuentes), bash -n. Reejecutar 10_web.sh devuelve los mismos IDs.
- Prueba API no ejecutable: `python3 -m pytest api/` → `No module named pytest`; Python local 3.14, proyecto pide 3.12. API todavía sin implementar.
- Pendiente: CloudFront reporta InProgress; curl falla `Could not resolve host`. Herramienta de navegador devuelve `The browser access host is unavailable`; no se verificó renderizado. T08 sigue en curso.
- Siguiente paso exacto: consultar Distribution.Status; con Deployed ejecutar curl y abrir la URL. Solo entonces cerrar T08 y seguir T09.
- Trampas: DNS del hostname virtual S3 devolvió certificado de otro dominio; endpoint regional oficial funcionó con TLS válido. npm ci necesitó acceso de red fuera del sandbox. Perfil AWS autentica como root; no se crearon credenciales ni roles adicionales.
- Diferencia documentada: sync conserva objetos antiguos y no usa --delete sin confirmación de borrado. tools/datos_psi/ preexistente permanece fuera del commit.


<!--
### [HH:MM] Persona · cuenta/laptop
- Hecho: T0x (commit abc1234), …
- Verificado con: …
- Quedó a medias: … (commit WIP def5678)
- Siguiente paso exacto: …
- Ojo con: …
-->
