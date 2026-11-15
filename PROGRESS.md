# Prometeo — Progreso

> Fuente única del estado del proyecto. Cada agente lo lee al empezar y lo actualiza al terminar cada tarea (ver `AGENTS.md`).
> Las tareas están descritas en [`docs/PLAN.md`](docs/PLAN.md).

## Estado actual

| Campo | Valor |
|---|---|
| Hora 0 (inicio del reloj) | 2026-11-14 18:16 CST |
| Tarea en curso | **T34 · laptop AWS.** Política consolidada aplicada; lecturas SQS/S3 pasan. T38 publicada y verificada en CloudFront. Worker espera confirmación de la simulación administrativa del mapping exigida por RELEVO §0; paquete/JSON preparados. |
| Último commit verificado | API desplegada `2745d85` (12 rutas JWT, original CSV real); T38 publicada desde `d0308e9`; bundle T37 `8f23050`; T32 delegada `cc61d95`. 148 API/40 pipeline/106 web/6 helper pasan. |
| Siguiente paso exacto | Confirmar simulación CreateMappingOnlyForWorker (allowed ARN worker, implicitDeny otro ARN). Perfil operativo no permite SimulateCustomPolicy. Luego aplicar infra/deploy_worker.py dos veces, primero deshabilitado; lote10+corrupto, métricas/DLQ y deshabilitar. T35 aún sin activar; pendientes de código T37/T36 documentados. |
| URL pública (CloudFront) | https://dursf4nho4zl6.cloudfront.net (HTTP 200; incógnito y viewport responsive 400 × 899 revisados el 2026-11-14) |
| API (`API_URL`) | https://ve5oqmsyie.execute-api.us-east-1.amazonaws.com |
| `MODEL_ID` desplegado y aprobado (D6) | `us.anthropic.claude-haiku-4-5-20251001-v1:0` con SDK 2.8.0; el dueño decidió conservar Haiku 4.5 el 15-nov |

## Bloqueos

- T14 confirmó invocaciones Converse reales de Bedrock en `us-east-1` (22 tablas). Esta sesión actualizó la Lambda existente y publicó la UI; no creó recursos AWS.

- D9: corpus fuera de Git; T18/T31/T32 hechas. Política consolidada aplicada: SQS/S3/CloudFront pasan y T38 publicada. Worker sin crear; pendiente confirmar simulación administrativa exigida por RELEVO §0. T35/T37/T36 conservan sus pendientes de código/verificación, no se declaran hechos por la publicación de T38.

- [15-nov] **No publicar la web todavía.** La interfaz nueva entró a `main` y tiene puntos que chocan con las reglas: la llama crece en "Ignition", hay textos del dominio escritos a mano y el CSS usa gradientes y sombras. Detalle en `docs/PLAN_FASE2.md` §9.2 — equipo de interfaz y una persona que lo apruebe.
- [15-nov] La interfaz duplica en `web/src/report/` lógica que ya existe en el motor (grafo, diferencias, variantes y espacio de trabajo). Hay que unificarla antes de las pantallas del bloque C (`docs/PLAN_FASE2.md` §9.3) — equipo de interfaz.

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
| T30 | Contratos del bloque C | fase 2 · C | hecha | Claude · ferlr; Claude · Daniel | esta entrega | Dueño aprobó §5 completo el 15-nov y se añadió §5.10 (exportación para ML → T38). D1–D5, D7, D8 y D10 cerradas; ver `docs/DECISIONES_CIERRE.md` |
| T31 | Infra de datos del bloque C | fase 2 · C | hecha | stringbuilder | este commit | Dos corridas reales con rol SSO `Prometeo-T31`: primera completó Cognito y outputs; segunda marcó todo existente. `infra/outputs.env` contiene tabla, bucket, colas/DLQ y Cognito; sin secretos |
| T32 | Extracción fuera de línea | fase 2 · C | hecha | laptop AWS · stringbuilder | esta entrega | D7 aprobada por dueño; revisión PDF aprobada por delegación con hashes: 12 contextuales/3 excluidos, 0 añadidos a tablas. Métrica D7: 154/172 asignación; 148/172 conjunta (86,05%). No equivale a precisión científica. `docs/T32_PDF_DECISIONES.md` |
| T33 | Cuenta y proyectos | fase 2 · C | hecha (verificación relevo) | stringbuilder; Claude · Daniel | esta entrega | A/B previo y 19 comprobaciones reales de cargas/DELETE pasan; 11 rutas JWT desplegadas y recursos reutilizados. Recibo docs/t33-upload-smoke-2026-11-15.json. Edición de intención procesada/lente y pantallas siguen en T35/T37/interfaz; no se declara completo ese recorrido |
| T34 | Worker | fase 2 · C | en curso (local) | stringbuilder; Claude · Daniel | esta entrega | Worker, despliegue (`infra/deploy_worker.py`) y política de operador listos y probados con dobles. Descarta mensajes de documentos borrados. Lote real con `cli.mjs batch … --limit 10 --corrupt`. Falta: desplegar, lote/DLQ real y medir memoria/costo (RELEVO §3–4) |
| T35 | Revisión del esquema | fase 2 · C | en curso | stringbuilder | esta entrega | API versionada y extracción tabular con aprobación vinculada a fuentes; 135 pruebas API pasan con dobles. Rutas aún no activadas; faltan prueba AWS, PDF integrado, pantalla y pack T37. `docs/T35_REVISION_API.md` |
| T37 | Publicación y segundo dominio | fase 2 · C | en curso (local) | stringbuilder | esta entrega | Constructor versionado y revisión delegada v1 de dos tablas reales: 51 registros, 5 celdas rechazadas, 0 conflictos/llamadas Bedrock. validate_pack y motor sin cambios pasan. Faltan lote completo, APIs/publicación, lente/síntesis/pantallas; docs/T37_PUBLICACION_LOCAL.md |
| T36 | Correcciones y relaciones declaradas | fase 2 · C | en curso | stringbuilder | `2745d85` + esta entrega | CLI de correcciones/conflictos/claims con 7 pruebas. Originales desplegados: 23 HTTP y cotejo SHA real pasan, con dos usuarios y limpieza. Falta PDF parseado/página real, APIs persistentes, publicación corregida y pantallas; docs/T36_REVISION_LOCAL.md |
| T38 | Exportación para entrenar modelos (CU-25) | fase 2 · B/C | hecha | stringbuilder | `777fb81` + esta entrega | Publicada en CloudFront tras policy consolidada; invalidación Completed y QA real desktop/móvil. CSV/datacard de 268 registros, SHA coincide, demo intacta y análisis IA200. Selector/editor de objetivo sigue en T27; docs/T38_DATASET_EXPORT.md |

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

- **T32:** revisión D7 cerrada por el dueño y PDF por delegación; métrica revisada 148/172 conjunta,86,05%, no precisión científica. Decisión/hashes en docs/T32_PDF_DECISIONES.md. Un PDF conserva exclusión de extracción automática por texto mal codificado; no bloquea ni añade condiciones al pack. Las aprobaciones locales no autentican al operador.

- **T31:** terminada con dos corridas reales e idempotentes usando SSO en la cuenta `352818909129`. `infra/outputs.env` versiona los IDs/ARNs/URLs de tabla, bucket privado, cola/DLQ, user pool y cliente público. No contiene credenciales ni secretos. El rol para T31 no concede permisos de Lambda ni worker; T33/T34 deberán definir y probar permisos separados.

- **ML (T12/T27/T38):** D4 define los umbrales y el motor los calcula determinísticamente. Falta el selector/editor T27; exportar sin candidato explícito indica not_assessed, no un veredicto inventado. Los resultados originales y frecuencias no son clases científicas validadas.
- **Mapeo (T14/D7):** el informe histórico conserva el experimento inicial; D7_DECISIONES.md cierra las discrepancias con criterio aprobado y sin alterar la referencia. No extrapolar acuerdo con el mapping a precisión científica.
- **Reproducibilidad de T14:** el checkout no tiene `data/psi/tables`; se ejecutó desde `tools/datos_psi/tablas`, que permanece fuera de Git. Un clon limpio debe recibir esos CSV para repetir la corrida.

- **Revisión humana T12 (ML):** definir clases destino y umbrales de aptitud antes de interpretar frecuencias descriptivas como decisión de selección de modelo. Responsable: equipo/persona dueña del uso ML. Evidencia: criterios aprobados y anotados en `PROGRESS.md`.
- **Revisión humana T14/T32 (D7):** la persona que conoce las tablas (autor de `construir_corpus.py`) debe resolver las 79 diferencias de `docs/agnostic_proof.md` y revisar la lista de discrepancias en `docs/T32_EVALUACION.md`. Conservar mapping vigente hasta aprobación explícita; el porcentaje no sustituye esta decisión.
- **Revisión semántica PDF T32:** revisar cada candidato literal y su página/contexto en los cinco PDF enumerados en `docs/T32_EVALUACION.md`, incluyendo alcance experimental; rechazar los que no respalden valor, unidad y población de pruebas. El archivo sin texto requiere fuente legible/OCR revisado.
- **T30/D3:** aprobados; cargas/DELETE verificadas. Medición real del costo/memoria/lote T34 pendiente de permisos y ventana AWS. Tope operativo USD30 y revisión si lote>USD5 se mantienen.
- **D10/T37:** ebullición decidida y corpus de23 fuentes regenerado. Revisión delegada acotada de2 tablas y bundle local verificados; lote completo/publicación/síntesis aún pendientes.

## Bitácora de relevos

Una entrada por sesión de agente, la más reciente arriba.

### 2026-11-15 · Política aplicada: web publicada y preflight T34
- git pull --rebase sin cambios de main; solo referencia frontend actualizada, sin merge. STS pasa con perfil/cuenta/rol esperados. GetQueueAttributes ingest pasa: visibilidad de 960 s, redrive de 3 intentos a DLQ y 2 mensajes preexistentes. ListBucket web pasa (consulta maxkeys=0, no implica bucket vacío). DLQ: 0 visibles y 0 no visibles.
- GetRole worker devuelve NoSuchEntity y GetFunctionConfiguration ResourceNotFound: rol y función aún no existen. Preparados JSON en /tmp/prometeo-t34-live-d0308e9 y ZIP /tmp/prometeo-worker-d0308e9.zip (Linux arm64/Python3.12); no se aplican antes del prerrequisito administrativo.
- SimulateCustomPolicy todavía devuelve AccessDenied. El relevo exige validación administrativa de CreateMappingOnlyForWorker; se pidió confirmar allowed para ARN exacto e implicitDeny para otro. No se cambió perfil ni se concedió permiso global para eludir ese paso. Trabajos independientes continúan.
- deploy_web terminó 0; invalidación IAAD71RW5QYWP8IJPPZV0H6U19 Completed. Mismos bucket/CF. Pack/lens/mapping remotos coinciden byte a byte después del sync.
- Durante el push llegaron 2bc00e8/c4bccf4. Se integran por rebase conservando ambas bitácoras; nueva regla de revisión humana UI y una sola lógica recibida. El deploy se creó a14:50:18UTC, antes del commit del gate a14:52:42UTC. La QA automática no equivale a revisión humana contra §5–§7: queda pendiente §9.2 y no habrá otra publicación web sin esa revisión registrada. Delegaciones T32/esquema ratificadas por dueño; no se reabren.
- QA real en CloudFront con Chrome a 1280×900/390×844, sin dobles HTTP: descarga CSV de 268 registros y datacard de 22 fuentes, SHA coincide, unidades/outcomes presentes. Sin overlay/errores de consola ni desborde horizontal. Análisis real HTTP 200, mode=ai, tres frases citadas. Es otra solicitud real de análisis; no hay llamadas de lote T34 ni gasto facturado inferido.
- Verificación posterior: 106 web pasan con bundle externo, 148 API pasan, check_agnostic y diff-check pasan. Build del deploy pasa con aviso de chunk >500kB. Datos publicados/locales sin cambios; fotos/descargas de QA solo en /tmp.

### 2026-11-15 · Revisión del trabajo restante (Claude · ferlr)
- Revisado hasta `d0308e9`: 104 pruebas web y 188 de API, pipeline y herramientas en verde; build y check_agnostic OK; sin coautoría. La web publicada sigue en `index-Ben2isQ8.js`.
- Queda cerca del 40 % de la fase 2: unas 6–10 h de agente en el backend C, tras IAM; 1.5–3 días de pantallas del bloque C; y la revisión y unificación de la interfaz nueva. Desglose y ruta corta en `docs/PLAN_FASE2.md` §9.
- `AGENTS.md` §6 tiene dos reglas nuevas: una sola lógica, en el motor y los contratos; y no publicar la web sin la revisión de una persona anotada aquí.
- Siguiente paso exacto: un administrador aplica `infra/prometeo-deployer-policy.json`; el agente AWS sigue con T34 → T37; el equipo de interfaz atiende §9.2 y §9.3.

### 2026-11-15 · Comprobación de permisos añadidos y política consolidada
- Dueño informa nueva política inline y SSO renovado. git pull --rebase sin cambios de main; rama frontend solo se actualiza como referencia remota, sin fusionarla.
- STS real pasa con cuenta/rol esperados. GetRole del dueño responde NoSuchEntity: lectura autorizada, rol no creado. Consulta real de CloudFront pasa (E2SO4K789H7YOQ, Deployed).
- Comprobación de solo lectura aún falla: GetQueueAttributes de ingest AccessDenied y ListObjectsV2 del bucket web AccessDenied por falta de s3:ListBucket. No se ejecuta apply/sync ni se crean recursos con estos permisos incompletos.
- Preparada infra/prometeo-deployer-policy.json: unión exacta de T33/T34/T38, sin Sid duplicados ni pérdida de permisos API/worker. ReadApprovedModelProfile idéntico se conserva una vez; BasicLogging por rol conserva ambos recursos con Sid distinto. Falta aplicar/reprovisionar el conjunto completo y simular condición del mapping; no basta lectura de rol/CloudFront. Guía actualizada.
- Validación local: JSON con22declaraciones/Sid únicos,4991bytes compactos y cobertura exacta de los tres archivos de origen. 148 API pasan; web104 pasan y2 se omiten al no indicar bundle externo en esta corrida. check_agnostic y diff-check pasan. Solo cambian política y documentación; no despliegue ni cambios del corpus.

### 2026-11-15 · Retoma AWS: originales comprobados, permisos worker/web pendientes
- API empaquetada y actualizada (20_api exit0); deploy_projects --uploads --originals exit0. Gateway confirma **12 rutas JWT**. Lambda Active/Successful conserva nombre/rol y Haiku4.5 de D6. T35 no se activó sin consumidor.
- Smoke real ampliado: **23 HTTP y un cotejo SHA pasan**. URL original propia200, ajena404, GET S3 firmado200 y bytes idénticos al CSV PSI-87 local; página CSV400. Subida/reintentos/hash/DELETE/aislamiento siguen pasando; proyecto temporal limpiado. Recibo saneado docs/t36-original-smoke-2026-11-15.json; sin URLs firmadas/tokens. sha256_observed continúa null porque el worker no corrió.
- T34: nueva consulta GetRole del worker devuelve AccessDenied; no se crean rol/Lambda/mapping ni llamadas de lote. Simulación IAM sigue requiriendo administrador.
- Lectura de contadores SQS también devuelve AccessDenied. Política T34 preparada incluye ahora observación de DLQ y REPORT del log exclusivo del worker; ReceiveMessage solo DLQ para cotejar el doc_id con visibilidad0, sin DeleteMessage/SendMessage. No se aplicó la política desde esta sesión ni se consumieron mensajes. ZIP vigente preparado en /tmp/prometeo-worker-relevo-final.zip.
- Web T38: los tres JSON demo remotos/locales coincidieron byte a byte antes del intento. deploy_web terminó254 en cloudfront:GetDistribution denegado, antes de build/sync/invalidation; no hubo publicación web ni cambios de datos. Política mínima nueva infra/t38-web-deployer-policy.json y guía docs/PERMISOS_RELEVO_AWS.md; no privilegios administrativos ni borrado.
- Llamadas Bedrock de esta sesión: dos de regresión pública ask/analysis; sus respuestas no exponen tokens, no se inventa costo exacto. Extracción nueva de lote y pruebas locales: cero llamadas. Conservar tope USD30/revisión de lote>USD5. Queda intervención administrativa concreta y los pendientes de código indicados arriba; ninguna decisión científica se reabre.

### 2026-11-15 · T36 revisión local y acceso a originales
- CLI review_records: correct/exclude/resolve/claim con versión, hashes de esquema/fuentes/parseado, autor/fecha/razón, primer valor y cita originales e historial íntegro. No se confunde corrección humana con dato de la cita. Fila totalmente conflictiva no se pierde; alternativas conservadas son marcadas, no ensayos independientes.
- Claims exigen literal PDF verificado e identidad de estudio revisada; el respaldo semántico es una declaración del revisor. Siete pruebas pasan, incluidas citas falsas, variantes, tipos, versiones y cambios de parseado. Preparación real sobre el subset T37:51registros,0conflictos; ninguna corrección ni claim científico aplicado.
- Ruta original_url preparada: propiedad antes de firma, subida completa, prefijo exacto, GET300s, página PDF validada y fragmento#page. Diez pruebas nuevas de API pasan; preflight/deploy con dobles comprueba11/12/14/15rutas según flags. API total148 pasan. No está desplegada aún; README T36 identifica persistencia/API/pantallas/puente de publicación pendientes.
- El dueño inicialmente pidió AWS después y luego autorizó retomarlo al cerrar lo local. Mantener límites/perfil/modelo; volver a comprobar IAM antes de crear worker, sin saltar simulación exigida por relevo.
- Verificación final local:148 API,40 pipeline (10+10+8+5+7),106 web con bundle y6 helper Cognito pasan. validate_pack del demo y del subset pasa; check_agnostic/diff-check pasan. Build pasa con aviso de chunk629kB; demo sin cambios. Solo se preparó el estado de revisión real, sin correcciones científicas ni llamadas de modelo nuevas.

### 2026-11-15 · T38 exportación y criterios D4
- Implementado CSV con unidades/DOI/group_id, originales/correcciones y resultados fuente separados; datacard con versiones/hashes, conversiones, rechazos, licencias desconocidas explícitas y criterios D4. Registros excluidos/citas PDF no verificadas nunca se exportan.
- Motor puro assessDataset con límites D4 y entradas/objetivo explícitos. La ficha sin candidato indica not_assessed; no inventa objetivo, versión ni capacidad predictiva. Nuevas lentes T37 incluyen ml_thresholds; editor/selector T27 sigue con interfaz.
- Modal existente conecta CSV y datacard, con errores visibles y estado de preparación. Pruebas con demo y bundle T37 usan el mismo código. QA Chrome 1280×900/390×844: descargas reales268 registros, hash CSV igual al de ficha,22 fuentes, sin overlay/desborde. Análisis aislado con doble HTTP mode=template; no AWS, después del CORS local esperado de primera corrida. Capturas/scripts solo en /tmp. Aplicadas guías React y frontend-testing-debugging; detalles en docs/T38_DATASET_EXPORT.md.
- Verificación:106 web pasan con bundle, build pasa (aviso chunk>500kB), check_agnostic pasa; pack público intacto. Se corrigió forma del resumen/contadores del bundle local para coincidir con tipos de Study, sin crear datos científicos; cinco pruebas de publicación pasan. Despliegue sigue pospuesto por el dueño.

### 2026-11-15 · T37 constructor local y aprobación delegada acotada
- `publish_bundle.py` exige esquema aprobado y metadatos revisados con hashes; recalcula extracción tabular, exige identidad de estudio/DOI/kind sustentado, sigma positivo y presets citados, bloquea conflictos y genera pack/lens/mapping/recibo en carpeta nueva fuera de demo.
- Aplicada revisión delegada v1 `docs/t37/revision_local.json` solo a PSI-46/PSI-87. Autoridad explícita del dueño, sin revisión humana línea por línea. Otras fuentes/prosa/PDF/simulaciones permanecen fuera de esta prueba; no se aprueba el lote completo ni se confunde potencia con flujo de calor.
- Datos reales locales: 6+45=51 registros, dos estudios, ocho variables, cinco celdas ambiguas rechazadas sin relleno, cero conflictos. Cero llamadas Bedrock/tokens de esta prueba. Hashes/artifactos completos en /tmp/prometeo-t37-local-v1; no se suben datos extraídos a Git.
- Cuatro pruebas del constructor pasan con Python3.12. validate_pack del bundle final: OK (2/51/2), /tmp/prometeo-t37-local-v1-final. Una prueba de integración ejecuta el motor existente y pasa; check_agnostic pasa. Añadido hash del documento parseado para invalidar también cambios de celdas que conservaran el campo SHA del original: 136 API pasan. 99 web pasan con bundle; build pasa tras npm ci (faltaba framer-motion instalado), con aviso de chunk >500kB. Detalles reproducibles y límites en docs/T37_PUBLICACION_LOCAL.md. T37 sigue en curso: faltan API/síntesis/lote/pantallas; AWS después por instrucción del dueño.

### 2026-11-15 · Cierre del smoke T33; T34 pendiente de permisos
- `infra/20_api.sh` y `deploy_projects.py --uploads --apply --contract-approved` terminaron0. API ve5oqmsyie, Lambda prometeo-hack-api y rol existentes conservados; 11 rutas JWT. CORS solo CloudFront; DELETE permitido.
- `/ask` HTTP200: o2=25,p=0.5,material=Nomex. `/analysis` HTTP200, mode=ai, tres frases citadas, dropped=0. OPTIONS HTTP204, allow-origin CloudFront, métodos DELETE/GET/OPTIONS/PATCH/POST. Dos invocaciones reales de regresión al modelo D6; no son extracción de corpus.
- Smoke con CSV PSI-87 real y dos sesiones SRP: **19/19 comprobaciones pasan**: create/reserve/repeat201; PUT200; overwrite412; complete/repeat200; hash409; list/jobs200; todos los accesos ajenos404; DELETE propio documento/proyecto204; GET borrado404. Recibo saneado en docs/t33-upload-smoke-2026-11-15.json. El SHA observado es null porque el consumidor sigue sin desplegar, no se afirma verificado por worker. El proyecto temporal fue limpiado vía API.
- Paquete worker Linux arm64/Python3.12 generado en /tmp/prometeo-worker-949f729.zip. IAM devolvió AccessDenied para GetRole sobre prometeo-hack-worker-role y SimulateCustomPolicy. La primera simulación del documento completo superó límite de2000caracteres; la sentencia aislada pasó ese límite pero fue denegada por IAM. No se creó ni habilitó worker/mapping; cero llamadas de lote. Dueño pidió **continuar localmente; AWS después**.

### 2026-11-15 · T35 backend local y recuperación de acceso AWS
- Implementadas GET/PATCH/approve de esquema con versiones inmutables, hash de fuentes/artefacto, control de revisión, edición que revoca aprobación y despacho recuperable a SQS. Extracción tabular determinista con leases, citas por celda, conversiones y rechazos/conflictos conservados; no publica el pack.
- Configuración optativa `--schema` añade tres rutas JWT y permisos por prefijo; T33 sin el flag conserva 11 rutas. Paquetes API/worker incluyen los validadores estándar de T32. Ver docs/T35_REVISION_API.md y límites allí detallados.
- Python 3.12: **135 API pasan** (incluye dobles de revisión/extracción/despliegue); **98 web pasan**, validate_pack y check_agnostic pasan, bash-n y diff-check pasan. `web/public/demo` sin cambios. Las pruebas nuevas no prueban AWS real; T35 no se marca hecha.
- STS volvió a responder con cuenta352818909129 y rol SSO Prometeo-T31 al ejecutarlo fuera del sandbox. Se retoma relevo; no hace falta cambiar perfil ni modelo. `20_api.sh` terminó 0 y reutilizó API/Lambda/rol existentes. `deploy_projects.py --uploads` terminó 0; regresión y smoke en curso. No hay llamadas nuevas de extracción ni costes de lote todavía.

### 2026-11-15 · T32 revisión delegada y preparación del relevo
- T32: revisión conservadora de 15 candidatos con originales/páginas; 12 aceptados como contexto (aproximaciones/máximos/figura concreta), tres excluidos (material redundante, supuesto P=1 atm y fase del modelo). Ninguno se propaga a tablas; ocho rechazos iniciales permanecen. Aprobación delegada explícita, no revisión experta; versión/hashes en docs/T32_PDF_DECISIONES.json.
- PDF 20120015928 renderizado visualmente legible en página 1, aunque texto extraído mal codificado; solo metadatos, sin condiciones nuevas. Render FLEX figura4 confirma O2/1atm solo de esa secuencia. No se cierra el hueco de presión 0/268 de sólidos ni se cambia el pack.
- D7: informe correcto es tables-final/report-corrected.json, que alinea espacios de bordes del builder. Excluir 55 columnas reglaA deja154/172 asignación89,53% y148/172 conjunta86,05%. T32 hecha bajo criterio aprobado, con límites documentados y cero llamadas Bedrock nuevas.
- Preparación: 120 API, 98 web, 28 pipeline y validate_pack/check_agnostic pasan. Corpus regenerado: 23/23 documentos coinciden en SHA, bytes, DOI y páginas con manifiesto de Daniel; descargas fuera de Git.
- AWS: STS/GetRole fallan antes de operación con GetRoleCredentials503, incluso tras aws sso login exitoso. El intento de20_api.sh terminó254 antes de desplegar. Sin escrituras AWS; continuar local y reintentar cuando vuelva el servicio/credencial. Consulta al dueño presentada; no usar otro perfil/root.

### 2026-11-15 · Retoma del relevo Daniel en laptop AWS
- `git pull --rebase` trajo main hasta 7cdeacc; lectura de AGENTS, relevo, decisiones y D7 completada. Único corpus previo sin seguimiento permanece fuera de Git.
- Dueño instruye seguir RELEVO_LAPTOP_AWS y continuar T35, T37, T38 y T36. Aplica delegación de DECISIONES_CIERRE §8 a PDF T32 y versiones de esquema de ebullición: criterio conservador, versión/hashes y frase explícita de aprobación delegada, sin presentarla como revisión experta.
- Tope Bedrock USD 30 y parada/revisión si lote >USD 5; no reenvío automático desde DLQ, no borrar/reemplazar recursos AWS ni cambiar modelo. Se inicia preparación y verificación T33 antes de habilitar consumidor.

### 2026-11-15 · Claude · laptop Daniel (Windows) · DELETE de T33, carga por lotes y relevo
- **T33 DELETE:** `api/deletions.py`.
  - Marca primero el documento o proyecto como `deleting`, luego borra en S3 solo el prefijo `u/<uid>/p/<id>/` y por último DynamoDB; el borrado de documento y el cupo D3 van en una transacción.
  - 404 si es ajeno y 409 con un lease activo del worker; la reanudación es idempotente.
  - El worker ignora documentos borrados y no puede tomar uno en `deleting`. `GET /jobs` ya no se rompe con documentos en `deleting`.
  - Rutas y permisos acotados en `prepare_projects.py`; CORS con DELETE.
  - La prueba de despliegue pasa de 9 a 11 rutas y ahora comprueba que los permisos de borrado estén acotados.
- **Herramientas:** `check_uploads_live.py --cleanup` verifica DELETE en real. Nuevo `cli.mjs batch <carpeta> [--limit N] [--corrupt]` con `api/check_batch_live.py`: sube una carpeta, sigue `/jobs` y deja recibo, para T34 y T37.
- **Relevo:** `docs/RELEVO_LAPTOP_AWS.md` con pasos, comandos, resultados esperados y qué registrar.
- **Verificación local** (Python 3.12, `PYTHONUTF8=1`):
  - API: 116 pasan + 3 de `test_bad_bodies`; persiste el caso de más de 32 KB que solo falla en Windows.
  - CLI Cognito 6/6; `node --check`; parser de PowerShell sin errores; `bash -n` de `20_api.sh`; `check_agnostic` y `diff --check` OK.
  - Sin llamadas a AWS.
- **Trampa encontrada:** el doble de S3 paginaba por posición y se saltaba objetos al borrar. S3 real pagina por clave; se corrigió el doble, no el código.

### 2026-11-15 · Claude · laptop Daniel (Windows) · cierre de decisiones y corpus del segundo dominio
- **Decisiones (autorizadas por el dueño en la conversación):** `docs/DECISIONES_CIERRE.md`.
  - T30 aprobado; se añadió §5.10 (exportación para ML, nueva tarea T38).
  - D4: umbrales de la ficha ML.
  - D10: ebullición y cambio de fase.
  - Aprobado `s3:ListBucket` del worker.
  - Tope operativo de USD 30 en Bedrock y reglas de reintento.
  - CORS con solo CloudFront por defecto.
  - D2, D5 y D8 ratificadas.
  - Solo queda humana la revisión semántica de los PDF de T32 (en la laptop AWS).
- **Exportación para ML:** el contrato no la cubría. La web ya exporta un CSV armonizado con procedencia desde cualquier pack. T38 completa unidad en cabecera, DOI, `group_id` por estudio, valor original y `datacard.json`.
- **D10:** `tools/psi/corpus_dominio.py`, basado en los legacy, solo librería estándar y `pypdf` opcional.
  - Corrida real: 10 investigaciones de Fluid Physics, ninguna en el pack de la demo.
  - Lote de 23 documentos (10 tablas con 1 001 filas y 13 PDF con 258 páginas), todos dentro de D3.
  - 9 excluidos con motivo.
  - Manifiesto con DOI y SHA-256 en `docs/t37/manifest_ebullicion.csv`; los datos en `tools/psi/data/`, ignorado.
  - Trampas encontradas:
    - nombres de PSI de más de 200 caracteres rebasan `MAX_PATH` de Windows (corregido acortando el nombre local);
    - PSI responde 400 a un nombre con apóstrofo tipográfico (queda excluido);
    - sin `pypdf`, un PDF no da páginas y se excluye por prudencia.
- **CORS:** `20_api.sh` ya no añade localhost por defecto. Para desarrollo: `EXTRA_ORIGINS=http://localhost:5173,... bash infra/20_api.sh`.

### 2026-11-15 · D7 cerrada por el dueño
- Daniel Sun aprobó `docs/D7_DECISIONES.md` sin cambios: 18 filas críticas, regla D (O₂ `mole fraction` ×100) y regla A (55 columnas rechazadas). El mapping vigente se conserva y el pack no cambia; no hay que redesplegar.
- T32 sigue en curso solo por la revisión semántica de los 15 candidatos PDF y el PDF sin texto (`20120015928`). Sus citas y respuestas están en `/tmp/prometeo-t32/papers-real/` de la laptop AWS, fuera de git; esa tabla se prepara allí.
- Pendiente opcional de T32: recalcular la métrica variable + unidad sin las 55 columnas rechazadas por ambos, desde las respuestas guardadas (también en la laptop AWS).

### 2026-11-15 · Claude · laptop Daniel (Windows) · tabla D7 y despliegue T34 preparado
- **Git:** `pull --rebase` chocó en `infra/20_api.sh` con el commit local `669268a` (CORS localhost, 14-nov) que ya estaba integrado en el merge `fdbe373` sin push. Se abortó el rebase y se conservó el merge. Ese commit sube con esta entrega: hace que `20_api.sh` añada `localhost:5173` al CORS de producción por defecto. Hay que quitarlo antes del cierre (`EXTRA_ORIGINS= bash infra/20_api.sh`, ya documentado en `infra/README.md`). No se redesplegó la API.
- **D7:** `docs/D7_DECISIONES.md` es una tabla precargada, **no aprobada**. Las 79 = 18 de variable + 6 de unidad del O₂ + 55 de solo unidad en columnas rechazadas por ambos. Revisé los valores en los CSV locales. Recomendación: mantener el mapping en las 79. Las 18 de variable son errores del modelo (`pfinal`/`pmean` frente a `pinit` aprobado, `Fuel`→`phase`, `Flame Type`→`phase`, `Notes`→`p`). Las 6 de O₂ perderían el ×100. Aprobarla no cambia el pack.
- **T34:** `infra/deploy_worker.py` (por defecto solo prepara; `--apply` crea rol/Lambda/asociación SQS **deshabilitada**, sin borrar ni reemplazar; `--enable` explícito) y `infra/t34-deployer-policy.json`. Trampa encontrada: sin `s3:ListBucket`, S3 da 403 en lugar de 404 para la caché vacía y el worker fallaría en real; se incluye limitado al bucket y requiere visto bueno. 10 pruebas con dobles. Dry-run local OK. **No se ejecutó contra AWS:** esta laptop no tiene perfil `prometeo`.
- **T33:** smoke de archivo real listo para el dueño: `tools/cognito/run_uploads_smoke.ps1` (PowerShell, CSV real de BASS-II por defecto). `check_uploads_live.py` ahora escribe el recibo en el temporal del sistema (antes `/tmp`, que no existe en Windows). No ejecutado: requiere las contraseñas A/B. Al completar encola un mensaje que procesará el worker cuando se habilite (llamada Bedrock real). DELETE sigue pendiente.
- **Verificación:** Python 3.12.13 (venv uv temporal, `PYTHONUTF8=1`): 108 pasan. Hay 1 caso de `test_bad_bodies` con error solo en Windows: su parámetro de más de 32 KB rebasa el límite de variables de entorno en `PYTEST_CURRENT_TEST`; no tiene relación con el cambio. Worker/deploy: 25 pasan. CLI Cognito: 6/6. Parser de PowerShell sin errores. Sin `PYTHONUTF8`, `test_verify.py` falla en Windows por la codificación cp1252 (preexistente).

### 2026-11-15 · CORS confirmado y etapa API de cargas desplegada
- Dueño actualizó permission set. GetBucketCors real correcto; se publicó API actual (`20_api.sh`, código 0) y se aplicó configuración --uploads (`deploy_projects.py`, código 0). Despliegue acotado a endpoints operativos autorizado por la instrucción de avanzar/desplegar etapas; no aprueba contenido científico ni publica packs.
- Lectura posterior confirma origen CloudFront, método PUT, if-none-match y headers anteriores. OPTIONS real a S3 con Origin web y headers content-type/if-none-match: HTTP 200, Access-Control-Allow-Origin correcto, Allow-Methods PUT y Allow-Headers content-type, if-none-match.
- T33 habilita reservas/complete/listado/jobs/resume en API, con gate configurado y límites D3 aprobados. Worker todavía no está desplegado ni asociado a la cola: los mensajes quedarán pendientes hasta esa etapa. No se afirma procesamiento completo.
- Preflight local: API 98 passed, 1 skipped (PDF worker no instalado en api/.venv); prueba completa worker de la entrega anterior fue 99 con requirements-worker. Sin cambios de código en esta confirmación; falta smoke de archivo real.

### 2026-11-15 · T33 complete/colas/progreso y T34 worker local
- Autorización del dueño: avanzar/desplegar por etapas y reunir decisiones humanas para revisión final. `docs/REVISION_FINAL_PENDIENTE.md` conserva D7/PDF/T30/ML/D10 y gate de aprobación; D3 sigue aprobada.
- T33 local: PUT IfNoneMatch firmado, complete con HEAD de tipo/tamaño, hash declarado separado del verificado, transición/dispatch pendientes durables, listado paginado, jobs y resume. No hay subida del archivo vía API. Envío SQS puede repetirse; worker usa lease y checkpoints. Esquema/API no confirman SHA real hasta que el worker lee bytes.
- Despliegue --uploads intentado: s3:GetBucketCORS y s3:PutBucketCORS fueron rechazados; el último error explícito es RuntimeError AWS s3api put-bucket-cors failed (AccessDenied), exit 254. Se detuvo antes de habilitar variables/rutas de documentos. Política adicional mínima versionada en infra/t33-deployer-policy.json y documentada para el administrador.
- T34 local: verifica dueño/ruta/ETag/hash, parsea CSV y PDF pypdf 7.1.0, perfila, invoca propuestas por modelo D6 y valida citas. Guarda raw/uso/resultado en S3, reutiliza respuestas, limita llamadas por documento, retiene duplicados y falla por documento. Termina en proposed/awaiting_review, nunca aprueba/extracción/publicación.
- Parser real local sobre cinco PDF T32: 20120015928 (44 páginas), 20150008961 (10) y 20150019858 (9) leídos; 20150023456 y 20210011385 rechazados por >60 páginas. Se cambió layout→plain al detectar texto girado omitido; diferencia frente a Poppler T32 registrada, no se declara soporte semántico. Recibo /tmp/prometeo-worker-parse-check.json; no hubo llamada Bedrock en esta prueba.
- Empaquetado Linux arm64/Python3.12 de worker completado en /tmp/prometeo-t34-worker-v2.zip y módulo del ZIP cotejado con fuente actual; falta script de provisión, rol/trigger y prueba real lote/corrupto/DLQ. No se crearon recursos AWS ni se modificó el pack publicado.
- Verificaciones: 99 API/worker (venv Python3.12 con requirements-worker), 98 web, 6 helper Cognito, validate_pack, check_agnostic y diff-check pasan. Son dobles en AWS/modelo de worker; PDF y empaquetado sí son reales/locales. T33/T34 no se marcan hechas; T35–T37 pendientes.

### 2026-11-15 · D3 aprobada por el dueño
- Aprobación explícita de 20 MB (20.000.000 bytes) por archivo, 60 páginas por PDF y 30 documentos por proyecto tras presentar costo orientativo y aclarar que no representa tope monetario.
- Actualizados plan y estado vivo. No se activa UPLOADS_ENABLED ni se atribuyen pruebas de cargas a esta decisión; continúan complete/hash, integridad, encolado y worker. Resto de T30, D7/PDF y D10 siguen pendientes.
- Cambio documental: diff-check; sin cambios de implementación ni llamadas AWS.

### 2026-11-15 · T33 reservas de carga locales y propuesta D3
- `api/upload_tickets.py` prepara reservas de documentos y URLs PUT de 5 min con tamaño/tipo firmados, clave S3 generada en servidor y propiedad comprobada. Transacción DynamoDB une reserva y contador con condición de revisión/estado/cupo; reintentos con clave no duplican cupos. Se amplió error details para comunicar límites.
- Gate cerrado por defecto: requiere UPLOADS_ENABLED y UPLOAD_LIMITS_JSON explícitos tras D3; no se configuraron esas variables ni rutas JWT/permisos de documentos en AWS. No se desplegó este avance. `20_api.sh` incluye el módulo para próximos despliegues, sin habilitarlo por sí mismo.
- `docs/T33_CARGAS_PREPARACION.md` documenta alcance, limitaciones (hash, páginas, reemplazos, cancelación y encolado pendientes) y escenario de costo. Uso T32 observado 288423/47227 tokens, estimación de modelo USD 0,5768 con tarifas de referencia de ejemplo AWS 1,10/5,50 por millón; no factura ni tarifa efectiva comprobada. Escenario hipotético 30 PDF/60 páginas/2000 tokens/página/2 etapas/6000 salida por etapa: USD 9,90 por pasada más otros servicios/reintentos; no es tope.
- API 85 pruebas Python 3.12, web 98, bash-n y diff-check pasan. Firma con SDK S3 real sin red y dobles de transacción no prueban enforcement S3/DynamoDB remoto. No se invocó Bedrock ni se subieron documentos.
- D3 sigue pendiente; pregunta concreta de aprobación presentada al dueño. T33 sigue en curso. Siguiente: complete/hash/integridad, listado, encolado/worker y verificación real antes de habilitar cargas.

### 2026-11-15 · T33 confirmación y aislamiento A/B reales
- Ambos códigos de correo fueron aceptados por Cognito. Dos inicios de sesión SRP reales terminaron correctamente, con almacenamiento local solo en memoria.
- `node tools/cognito/cli.mjs ab` terminó con código 0. Catorce comprobaciones HTTP esperadas: 401/401/204 para auth/CORS; dos creaciones y repetición idempotente 201; cambio de payload con misma clave 409; lecturas cruzadas A→B/B→A y edición A→B 404; lectura/edición propia y ambos listados 200. El script confirmó IDs diferentes, repetición sin duplicado y ausencia del proyecto ajeno en cada listado.
- Recibo local `/tmp/prometeo-t33-ab.json`; evidencia durable sin correos/credenciales en `docs/T33_PRUEBA_USUARIOS.md`. Dos drafts vacíos quedaron para limpieza posterior, con IDs en el informe. No se borran porque DELETE sigue pendiente.
- T33 permanece en curso por cargas D3 y gestión completa; la comprobación de usuarios/drafts ya está demostrada contra Cognito/API Gateway/Lambda/DynamoDB reales. No equivale a pruebas de uploads/worker/publicación ni a una auditoría completa de autorización.

### 2026-11-15 · T33 registro real de dos cuentas de prueba
- El dueño proporcionó dos correos bajo su control y autorizó su registro. Tras corregir una contraseña rechazada por Cognito, ambas llamadas reales SignUp terminaron correctamente mediante la CLI SRP; Cognito indicó envío de confirmación y cuentas aún no confirmadas.
- Siguiente paso: recibir los códigos de correo, ejecutar confirmación de ambas cuentas y luego login/A/B real. No se declara aislamiento verificado todavía. Contraseñas, códigos y tokens no se guardan en Git ni en el recibo de prueba.

### 2026-11-15 · T33 herramienta de registro/login y estado AWS/backend
- `tools/cognito/` añade SDK Cognito 6.3.22 fijado, wrapper en memoria, CLI de registro/confirmación/login SRP y ejecución A/B con dos sesiones en entorno del proceso hijo. Entradas de contraseña/código ocultas, tokens fuera de argumentos/logs/archivos. No modifica componentes ni dependencias web ni flujos del pool.
- Registro envía correo solo cuando el dueño ejecuta el comando con su dirección; no se registraron cuentas ni se hicieron llamadas Cognito en esta entrega. La herramienta detecta desafíos MFA/contraseña temporal y detiene la operación; no implementa su interacción. Limpiar memoria local no revoca tokens globalmente.
- `tools/cognito/README.md` documenta comandos operativos, límites, IDs de drafts de prueba y recepción segura de sesiones. `docs/ESTADO_AWS_BACKEND.md` separa recursos hechos de API/cargas/worker/revisión/publicación pendientes y decisiones del dueño.
- Seis pruebas del helper pasan (SDK real construido sin red y dobles para flujos/aislamiento); instalación npm reportó 0 vulnerabilidades. Prueba real de correos/login/aislamiento sigue pendiente de dos cuentas confirmadas. T33 permanece en curso.

### 2026-11-15 · T33 API de proyectos desplegada y comprobaciones HTTP
- Tras actualizar permisos SSO y autorización del dueño, se publicó código en Lambda existente y se configuraron las cuatro rutas JWT. Primer intento parcial falló: waiter FunctionUpdatedV2 usa GetFunction, no GetFunctionConfiguration. Se corrigieron scripts a FunctionUpdated/FunctionActive (comprobado con modelo botocore) para usar el permiso ya aprobado.
- Reejecución API: código 0 y `API publicada`. Configuración T33: dos ejecuciones completas con código 0; recursos reutilizados. Authorizer observado `m6kz2q`, integración existente `ga1agdj`. GET/POST /projects y GET/PATCH /projects/{id} tienen JWT; ruta `$default` del MVP mantiene NONE. IDs de API/Lambda/rol no cambiaron; outputs.env solo reordenó sus líneas.
- HTTP real con `api/check_projects_live.py`: sin sesión 401; token inválido 401; preflight con Authorization/Content-Type/Idempotency-Key 204 y origen CF_URL correcto. Registro local `/tmp/prometeo-t33-http.json`, sin tokens.
- Regresión real: `/ask` 200 → o2=25, p=0.5, material=Nomex; `/analysis` 200 → mode=ai, tres oraciones citadas, dropped=0. Respuestas locales en `/tmp/prometeo-t33-ask.json` y `/tmp/prometeo-t33-analysis.json`.
- API 71 tests Python 3.12, validate_pack, check_agnostic y diff-check pasan. El smoke ofrece prueba A/B con tokens de dos cuentas por entorno; todavía NO ejecutada por faltar esas sesiones. Rechazar token inválido no prueba acceso autorizado ni lectura/escritura DynamoDB real.
- T33 sigue en curso por login/registro, A/B real y cargas (D3). T30 se aprobó solo para drafts; resto del contrato/límites sigue pendiente. No se desplegó web ni se publicaron datos nuevos.

### 2026-11-15 · T33 autorización de despliegue acotado y reanudación
- El dueño confirmó actualización del permission set, login SSO y lectura de Lambda Active, y pidió continuar el despliegue por tareas. Se registra autorización para publicar/configurar la API de proyectos vacíos documentada en `docs/T33_API_PROYECTOS.md` (POST/GET/GET-id/PATCH con JWT y aislamiento por usuario).
- Esta aprobación acotada permite aplicar T33 de drafts; no cierra T30 completo ni D3 de cargas ni D7 de revisión científica. No habilitar uploads ni declarar T33 hecha sin verificación real.
- Preflight local: main sincronizada, API 71 tests, bash -n y preparación de configuración pasan. Siguiente: despliegue de código y configuración JWT, comprobaciones reales y registrar resultados.

### 2026-11-15 · T33 intento de preflight para despliegue por etapas
- El dueño autorizó desplegar y revisar tarea por tarea. `git pull --rebase`: main al día. STS real confirma cuenta `352818909129`, rol `AWSReservedSSO_Prometeo-T31_e5fccb7bc636c4a5/prometeo-admin`.
- `lambda get-function-configuration` fue rechazado con AccessDeniedException por falta de `lambda:GetFunctionConfiguration` sobre la Lambda existente. No se ejecutaron operaciones de escritura AWS ni se atribuye un despliegue exitoso.
- Se preparó `infra/t33-deployer-policy.json` para revisión del administrador y `docs/T33_PERMISOS_DESPLIEGUE.md` con pasos de permission set/reprovisión. El script API ahora consulta rol/función concretos y reutiliza API_ID, evitando permisos de listado global para este despliegue.
- Se reforzó el preflight de rutas existentes: integración/authorizer/auth distintos detienen el script antes de sobrescribir rutas. Prueba de colisión agregada.
- Verificación: API 71 pruebas pasan con Python 3.12; bash -n de script API, sintaxis JSON y diff-check correctos. Política aún sin validación IAM remota; estos tests no prueban acceso ni despliegue AWS.
- Pendientes: permiso SSO adicional, aprobación concreta cuentas/proyectos, login/registro e integración A/B reales. D3 de cargas y D7/PDF siguen abiertas. No se modifica infraestructura con root ni se asignan permisos desde esta sesión.

### 2026-11-15 · T33 despliegue preparable y protección de configuración
- Sincronización trajo `9c2abcb` con cambios del equipo de interfaz; se conservaron. Esta entrega modifica solo infraestructura, pruebas de API y documentación.
- `infra/20_api.sh` ahora empaqueta projects.py y combina variables existentes con MODEL_ID/CF_URL; conserva CORS de proyectos cuando ya están activados, evitando que un despliegue MVP elimine su configuración.
- `infra/deploy_projects.py` prepara por defecto sin llamadas AWS. Aplicación explícita tras T30: verifica identidad/cuenta/stage/integración, reutiliza authorizer, configura cuatro rutas JWT y permisos de tabla/invocación acotados y combina variables con RevisionId. No borra/reemplaza recursos ni altera auth de las rutas MVP.
- Verificación: 70 tests API Python 3.12 (incluye dobles de dos corridas, reutilización, conservación de variables y rechazos de configuración), 98 web tras sincronización; bash -n, preparación sin AWS, validate_pack, check_agnostic y diff-check pasan. No hay prueba de despliegue real en esta entrega.
- T33 sigue en curso: faltan login/registro, aprobación T30, aplicación final por el dueño y verificación A/B con Cognito real. Las cargas esperan D3. Guion actualizado en `docs/T33_API_PROYECTOS.md`; no se ejecutó deploy ni se modificó el pack publicado.

### 2026-11-15 · T33 proyectos locales y configuración revisable
- `api/projects.py` implementa creación/listado/consulta/edición de drafts vacíos; partición DynamoDB por sub, 404 ajeno, escrituras condicionales, Idempotency-Key por usuario/payload y cursor limitado a su partición. `handler.py` deriva rutas y responde CORS de proyectos. Boto3 1.44.3 es dependencia explícita.
- Identidad solo desde claims de authorizer JWT; comprueba emisor/audiencia/token_use/expiración finita y rechaza si falta configuración. El Gateway aún debe verificar firma y proteger rutas antes de desplegar. La primera prueba detectó aceptación de expiración NaN; corregida y repetida con éxito.
- `infra/prepare_projects.py` genera cuatro JSON de revisión (política acotada, authorizer, fragmento de variables y rutas); dos ejecuciones locales coherentes en `/tmp/prometeo-t33-config`. No hace llamadas AWS. Documentación para backend/interfaz y límites en `docs/T33_API_PROYECTOS.md`.
- Verificación Python 3.12: API 63 pruebas; web 54 pruebas; validate_pack, check_agnostic y diff-check pasan. Los tests nuevos de identidad/almacenamiento son dobles locales, no prueba Cognito/IAM/DynamoDB real. Pack publicado sin cambios.
- T33 sigue en curso: no se desplegó, no incluye registro/login, DELETE ni uploads. PATCH solo draft vacío hasta implementar regeneración real de lente. Activación y cargas esperan T30/D3; revisión D7/PDF sigue pendiente.

### 2026-11-15 · Guía para integración y despliegue final
- `docs/GUIA_INTEGRACION_DEPLOY_FINAL.md` entrega inventario T31, responsabilidades de interfaz/backend/revisor/dueño, requisitos T30/D3 y D7, configuración pública/privada y guion de aceptación y despliegue final. Enlazada desde `infra/README.md`.
- T31 termina los recursos base; aún faltan backend C, worker, permisos de ejecución, rutas protegidas y pantallas. La guía exige entregar el script de despliegue C/worker y su recuperación; no presenta los scripts MVP como despliegue completo.
- Sin cambios de código ni llamadas AWS. Verificación documental: referencias de archivos/comandos y `git diff --check`; no se repitieron pruebas funcionales al no cambiar implementación. El dueño hará el despliegue final cuando el equipo entregue estas piezas y sus verificaciones reales.

### 2026-11-15 · T31 preflight y revisiones pendientes
- `git pull --rebase`: `main` ya sincronizada con `origin/main` en `97d1613`. El único elemento sin seguimiento es `tools/datos_psi/`; no se añadió a Git.
- Revisión estática de `infra/30_data.sh`: configura DynamoDB, bucket S3 privado, SQS/DLQ y Cognito; `bash -n infra/30_data.sh` pasó. El guion de T31 requiere dos ejecuciones reales y revisar outputs.
- AWS STS para `AWS_PROFILE=prometeo` devolvió cuenta `352818909129` y ARN `arn:aws:iam::352818909129:root`. No se ejecutó el guion ni se crearon o modificaron recursos. Se detuvo la operación para no usar identidad root, conforme al principio de permisos acotados de `AGENTS.md` §8.
- Se detallaron en “Revisión final pendiente” los responsables/evidencias esperadas para T12, D7/T14/T32, soporte semántico PDF, T30/D3 y D10/T37. Ninguna aprobación humana fue inferida.
- **Siguiente paso:** cambiar el perfil `prometeo` a una identidad IAM de mínimo privilegio, comprobar cuenta con STS y completar la verificación de dos corridas de T31. En paralelo, solicitar la revisión humana D7/PDF y la aprobación de D3.

### 2026-11-15 · T31 ejecución parcial con rol SSO
- `aws sso login --profile prometeo` completado por el dueño. STS confirma cuenta `352818909129` y rol `AWSReservedSSO_Prometeo-T31_e5fccb7bc636c4a5/prometeo-admin`; ya no se usa la identidad root.
- `infra/30_data.sh` se ejecutó dos veces. La primera creó DynamoDB `prometeo-hack-data` y S3 `prometeo-hack-corpus-352818909129`; la segunda constató DynamoDB/S3 existentes y SQS DLQ/ingest existentes, y reaplicó atributos previstos. Ambos intentos llegaron a Cognito y fallaron con `AccessDeniedException`: falta `cognito-idp:TagResource` durante `CreateUserPool` para etiquetar `project=prometeo-hack`.
- Verificación de recuperación: `list-user-pools` no encontró `prometeo-hack-users`; `git diff -- infra/outputs.env` vacío. El script solo escribe outputs al final, así que no hay salidas parciales. No se borró ni reemplazó ningún recurso.
- **Siguiente paso exacto:** agregar al permission set `Prometeo-T31` la acción `cognito-idp:TagResource` sobre `arn:aws:cognito-idp:us-east-1:352818909129:userpool/*`, con condición `aws:RequestTag/project = prometeo-hack`; reprovisionar el permission set, volver a hacer `aws sso login --profile prometeo` y ejecutar `infra/30_data.sh` dos veces. Luego inspeccionar `infra/outputs.env` por IDs/ARNs/URLs solamente.

### 2026-11-15 · T31 completada
- El dueño renovó SSO; STS confirmó rol `AWSReservedSSO_Prometeo-T31_e5fccb7bc636c4a5/prometeo-admin`, cuenta `352818909129`.
- Se agregó el permiso faltante de etiquetado Cognito al permission set. Primera corrida de reanudación: tabla DynamoDB, bucket S3, DLQ/cola SQS ya existentes; Cognito `prometeo-hack-users` y cliente `prometeo-hack-web` creados. Salida `30_data: OK` (código 0).
- Segunda corrida: los seis recursos se reportaron existentes; configuración CORS/privacidad/cifrado/lifecycle y atributos SQS se reaplicaron; salida `30_data: OK` (código 0).
- `git diff -- infra/outputs.env` mostró solo diez variables nuevas: `DATA_TABLE`, su ARN, bucket, URLs/ARNs de cola y DLQ, ID/ARN del pool y client ID público. `git diff --check` pasó; no hay credenciales ni secretos. No se tocó Lambda ni se desplegó API/web.
- **Siguiente paso:** revisión humana D7 y semántica PDF T32; aprobación de T30/D3 antes de T33. Recursos creados quedan bajo control de los scripts; no borrar/reemplazar sin aprobación.

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
