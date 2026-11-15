# Backend listo para la integración del frontend

El cierre del 15-nov-2026 completa las APIs del bloque C del MVP. Se reutilizan
la API, Lambdas, roles, tabla, bucket, Cognito y colas existentes. No se publicó
otra web ni se cambió `web/public/demo`. Las tareas T35–T37 completas incluyen
pantallas y aceptación de interfaz, que siguen a cargo de ese equipo.

## Configuración y autenticación

| Dato público | Valor |
|---|---|
| API | `https://ve5oqmsyie.execute-api.us-east-1.amazonaws.com` |
| Región | `us-east-1` |
| Cognito UserPoolId | `us-east-1_JP5FcOZMA` |
| Cognito ClientId | `n509p2ooh8opklaphskhs68sc` |
| Origen web autorizado por defecto | `https://dursf4nho4zl6.cloudfront.net` |

El cliente de Cognito es público y usa SRP. Enviar el **ID token** como
`Authorization: Bearer <id token>`: el backend comprueba `sub`, emisor,
audiencia, tipo y caducidad mediante el authorizer JWT. Proyecto ajeno:404.
Los valores de la tabla pueden compartirse como configuración; las sesiones
permanecen en memoria y no deben entrar al repositorio. Modelo fijo D6: Haiku
4.5 desde `MODEL_ID` de `infra/config.env`; SDK oficial AnthropicBedrock 2.8.0.

Hay **42 rutas JWT**, declaradas por `infra/prepare_projects.py --evidence`.
Las rutas públicas originales `/ask` y `/analysis` conservan su contrato y demo.
Contrato base: `CONTRATOS_FASE2.md` §5; tipos: `web/src/contracts/backend.ts`.

## Recorrido que debe conectar la interfaz

1. Registro/confirmación/login mediante Cognito. Crear/listar/editar proyecto
   con `/projects`; crear todas las reservas de documentos antes de completar
   la primera carga. PUT a la URL temporal con sus cabeceras exactas, después
   POST `documents/{doc_id}/complete` con SHA-256. Consultar `/jobs`.
2. GET/PATCH `/schema`, editando por lotes dentro del límite de16 kB del cuerpo.
   Enviar la versión vigente;409 exige recargar. Cada edición genera otra
   versión propuesta. POST `/schema/approve` registra aprobación explícita y
   dispara extracción ligada a hashes, con metadatos de fuentes/lente revisados.
3. GET `/records`; PATCH conserva original, cita, actor, motivo e historial.
   DELETE excluye del próximo pack sin borrar el original. Resolver `/conflicts`.
   No presentar la cita original como respaldo de un valor corregido.
4. Revisar PDF con `/paper-candidates`, descrito abajo. Guardar relaciones y
   huecos con `/claims`: son declaraciones de autores, separadas del motor.
5. POST `/publish` con `{}`. Devuelve versiones y URLs temporales de 300 s para
   `pack`, `lens`, `mapping`; GET `/pack` las renueva. Cargar los tres JSON en el
   mismo motor del informe. Repetir publish sin cambios conserva la versión.
6. Guardar variantes con `/proposals`; preguntar/analizar/sintetizar con las
   rutas del proyecto. Mostrar `template` cuando haya respaldo por plantilla.

## APIs añadidas para completar el backend

Todas las rutas de la tabla están bajo `/projects/{id}`.

| Método y sufijo | Cuerpo / respuesta relevante |
|---|---|
| GET `/diagnostics` | Motivos, nombres de respuestas y uso; sin texto crudo por defecto |
| GET `/diagnostics?doc_id=…&response=…` | Inspección explícita de una respuesta del documento propio; texto privado acotado, sin aprobación |
| GET `/documents/{doc_id}/text?page=11` | Página física y texto exacto del parser, con SHA; tablas usan cursor/limit≤50 |
| POST `/documents/{doc_id}/proposal` | `{proposal,reason}`: recuperación manual de una propuesta IA rechazada; conserva el rechazo y sigue `proposed` |
| GET `/paper-candidates` | Candidatos, estados por lote, páginas, rechazos y huellas de artefactos |
| POST `/papers/{doc_id}/extract` | `{}` reutiliza selección inicial; `{pages:[11,14,17,26]}` agrega lote explícito de hasta 4 páginas |
| POST `/paper-candidates` | `{candidate,reason}` agrega candidato manual validado, pendiente de revisión semántica |
| POST `/paper-candidates/{cid}/review` | `{status,reason,scope?,supports_value?}`; `contextual` exige alcance y `supports_value:true`; también `rejected` |
| POST `/papers/{doc_id}/review` | `{reason}` excluye sus candidatos; `{status:"manual",artifact_sha256,reason}` acusa un lote fallido concreto sin aprobar otros |
| GET/POST `/claims` | Lista / `{claim,reason}`; alta devuelve201, repetición idéntica conserva auditoría |
| DELETE `/claims/{cid}` | `{reason}` retira la declaración en la siguiente publicación, conservando historial |
| GET `/proposals` y `/proposals/{pid}` | Lista paginada / variante guardada |
| PUT `/proposals/{pid}` | `{name,scenario}`; guarda `pack_version` y `lens_version` de referencia |
| DELETE `/proposals/{pid}` |204; idempotente, con transacción de propiedad/revisión |
| PATCH proyecto | `{name?,intent?}`; intención publicada genera lente nueva sin reextraer ni cambiar los bytes del pack |
| GET/PUT `/lens` | Lectura / `{version,lens,reason}` para revisar una lente y presets; publicar aplica el borrador |
| POST `/ask` | `{question,version?:2}`; el esquema sale del pack privado del servidor |
| POST `/analysis` | `{scenario,levels,findings}` del motor; hechos alterados devuelven400 |
| POST `/synthesis` | `{study_ids,focus?}`; selección de IDs de citas validados, caché por publicación/foco y cobertura explícita |

Codificar IDs de registros en la ruta con `encodeURIComponent`. Respuestas de
listas: `{items,next_cursor}`. Para las variantes, el cursor pertenece al proyecto.
Los cambios concurrentes devuelven409; no sobrescribir una versión vieja.

La intención regenera determinísticamente título, foco y selección de la lente:
si menciona variables revisadas, prioriza sus ejes/variables activas; conserva
criterios numéricos, fuentes y presets respaldados. No inventa nuevos umbrales.
PUT `/lens` permite ajustar explícitamente un preset tras corregir su registro.
Una variante guardada conserva las versiones con las que se guardó; no hay un
historial completo de resultados calculados ni comparación automática entre
dos versiones de la base.

## PDF: citas, alcance y reanudación

El worker procesa un PDF por mensaje y conserva respuestas/uso antes de validar.
Una selección inicial considera hasta cuatro páginas; **no es extracción
exhaustiva**. La revisión permite pedir otras páginas físicas en lotes de hasta
cuatro, conservando los lotes anteriores. La clave incluye fuente, esquema,
extractor, modelo y selección. Repetir el lote reutiliza su respuesta.

Los candidatos pasan por los mismos validadores locales de T32: variable
aprobada, tipo, unidad, página y cita. Se permite solo normalización NFC y
espacios/saltos; no se eliminan números ni puntuación. La envoltura PDF admite
un bloque JSON seguido de explicación, pero usa únicamente el JSON y rechaza
bloques ambiguos. El validador de propuestas sigue siendo estricto.

**Encontrar la cita no prueba su significado.** La aceptación contextual exige
alcance revisado y actor/motivo. Se conservan el alcance propuesto y el aprobado.
Publicar exige esperar/revisar todos los lotes vigentes o excluirlos explícitamente;
un acuse de fallo queda ligado al hash exacto y no cubre fallos de lotes nuevos.

Los valores aceptados van a `pack.contextual_evidence`; la cobertura de páginas
queda en `pack.paper_extractions`. **Nunca se copian a `records`**, constantes
tabulares, distancias o niveles de evidencia. Las declaraciones autorales van a
`pack.claims`, también fuera de los cálculos del motor. Mostrar estas secciones
con etiquetas distintas y enlaces al original mediante `/documents/{id}/url`.

La extracción tabular fallida se reanuda repitiendo approve con la misma versión
aprobada; no concede otra aprobación científica. Para PDF usar `/papers/{id}/extract`.
Para propuestas inválidas usar recuperación manual explícita; un archivo que no
se pudo parsear requiere corregir la fuente, no fabricar una propuesta válida.

## Evidencia real del cierre

- Dos usuarios: aislamiento404 en variantes, claims, lente, PDF y pack; variantes
  persistentes/repetición/borrado pasan. Intención incrementa solo lente y mantiene
  bytes del pack y versiones históricas de la propuesta.
- Proyecto `prj_c6888f85103d49a692cfae4119434ce0`: CVB/PBE más FinalReport CVB.
  Pack v2/lente v3:51 registros tabulares,2 estudios,3 fuentes,2 evidencias PDF
  contextuales y 1 hueco literal. Cero valores PDF añadidos a filas de tablas.
- PDF: lotes 1–4 y 11/14/17/26;8 candidatos,2 contextuales/6 rechazados por revisión
  delegada conservadora. Se rechazó 40 mm como longitud de burbuja: era longitud
  del módulo. El efecto sugerido de nanopartículas se conservó como incertidumbre
  declarada, no como medición categórica validada.
- `/ask` conserva el valor de origen; análisis real `ai` con 4 frases y síntesis
  real `ai` con 5 extractos y ambos estudios representados. La selección exitosa
  repetida se recupera de caché.
- Original PDF:HTTP200, SHA correcto y fragmento `#page=11`; cita validada
  contra la página del parser. Inspección visual de las páginas 3/11. `validate_pack`
  y motor existente pasan con el bundle privado descargado.
- Un resumen de tesis de 3 páginas produjo 0 mediciones compatibles. El parser
  corregido reutilizó la respuesta guardada; no se inventaron candidatos.

Los recibos y `PROGRESS.md` distinguen llamadas reales de pruebas con dobles.
El corpus completo de23 fuentes aún requiere revisión de sus datos: este cierre
del backend no declara aceptadas científicamente las fuentes restantes.

## Despliegue, pruebas e integración local

```bash
export AWS_PROFILE=prometeo
aws sso login --profile prometeo
source infra/config.env
source infra/outputs.env
api/.venv/bin/python -m pytest api/ -q
bash scripts/check_agnostic.sh
bash infra/20_api.sh
api/.venv/bin/python -I infra/deploy_projects.py \
  --output-dir /tmp/prometeo-projects-next --uploads --schema --originals --evidence \
  --apply --contract-approved
bash infra/package_worker.sh /tmp/prometeo-worker-next.zip
api/.venv/bin/python infra/deploy_worker.py --output-dir /tmp/prometeo-worker-next \
  --zip /tmp/prometeo-worker-next.zip --apply --enable
```

Solo el operador necesita SSO. La interfaz usa Cognito y las APIs. Para habilitar
desarrollo local se debe optar explícitamente por sus orígenes en el comando de
configuración; esto alinea API, entorno Lambda y CORS GET/PUT del bucket:

```bash
EXTRA_ORIGINS=http://localhost:5173,http://127.0.0.1:5173 \
api/.venv/bin/python -I infra/deploy_projects.py \
  --output-dir /tmp/prometeo-projects-local --uploads --schema --originals --evidence \
  --apply --contract-approved
```

Sin `EXTRA_ORIGINS`, ese guion vuelve al CloudFront autorizado por defecto.
No acepta comodines ni orígenes con rutas/credenciales. Un dominio propio requiere
el hostname y DNS/certificado correspondientes; no se configuró un dominio no
identificado. No se necesitan claves AWS en el frontend.

La ventana de integración usa el mapping existente con concurrencia máxima 2,
120 s/1024 MB, límites D3 y máximo 20 llamadas por documento. Presupuesto aprobado
USD 30; revisar un lote que excedaUSD 5. No reprocesar DLQ automáticamente.
Para cerrar una ventana sin pruebas usar el mismo guion con `--disable`.
El deploy web final sigue sujeto a revisión humana de `PLAN_FASE2.md` §9.2/§9.3.
