# T35–T37: integración del recorrido esencial desplegado

Estado comprobado el15-nov-2026: API y worker en AWS, pack privado de dos
tablas reales publicado. Las tareas completas siguen en curso; las pantallas
del bloque C no se implementaron aquí. No se reemplazó la demo de combustión.

## Prueba real y alcance

Proyecto `prj_caf172e0a0ba42939157ee2eb06020a4`, propietario de prueba A:
PSI-46/CVB y PSI-87/PBE, SHA cotejado con el manifiesto. Aprobación del esquema
v3 por delegación del dueño según `t37/revision_local.json`, conservando esta
declaración: **Aprobado por delegación del dueño (15-nov); recomendación del
agente, sin revisión humana línea por línea**. No es aprobación general de
documentos o respuestas futuras.

- Extracción tabular determinista:51 registros/dos estudios, cinco celdas ambiguas
  rechazadas, sin completar ausentes ni incorporar presiones de artículos.
- Publicación privada v1, confirmación del mismo valor con actor/motivo y v2;
  repetir publish mantiene v2. El cambio de un valor se probó con fixture local;
  no se alteró un dato científico para provocar la demostración AWS.
- GET/PATCHschema, approve, records, publish y synthesis:HTTP200; creación201;
  resume202; pack sinJWT401; descarga de los tres JSON por URL temporal200.
- `validate_pack` y el motor existente pasan con el bundle descargado de AWS.
- Síntesis:HTTP200, cinco extractos y **mode=template**. Se activó el fallback;
  esta llamada no demuestra selección IA verificada. Los candidatos son citas
  originales, no reinterpretaciones de valores corregidos.

El lote independiente de10 documentos+control llegó a8propuestas válidas y dos
PDF rechazados por citas, conservando sus respuestas crudas en el bucket
privado. El control corrupto y esos dos PDF llegaron a DLQ; no hubo replay ni
borrado. Cita localizada significa coincidencia literal, no respaldo semántico.
Ver recibo `t34-t37-smoke-2026-11-15.json` y bitácora de PROGRESS.

## Contrato para el equipo de interfaz

Base: `API_URL` de `infra/outputs.env`. Todas estas rutas requieren
`Authorization: Bearer <access token Cognito>` y propiedad del proyecto.
Proyecto ajeno:404. Errores409 requieren recargar versiones/estado; no repetir
una edición vieja automáticamente. No guardar tokens ni URLs firmadas en git.

| Método y ruta bajo `/projects/{id}` | Uso |
|---|---|
| GET `/jobs` | Progreso; esperar `awaiting_review` para revisar propuestas |
| POST `/ingest/resume` | `{doc_ids:[...]}` para reanudar solo documentos fallidos; sin lista conserva comportamiento de reanudar pendientes. No toca DLQ |
| GET `/diagnostics` | Motivos de rechazo y uso de respuestas, solo propietario; sin texto crudo ni URLs |
| GET `/schema` | Esquema propuesto/versionado; nunca concede aprobación |
| PATCH `/schema` | `{version,edits}`; devuelve versión nueva y conserva anterior |
| POST `/schema/approve` | `{version,review_authority?,metadata?}`; aprobación explícita y extracción |
| GET `/records` | `{items,next_cursor}`; filtros `variable`, `flag`, `doc_id`, `cursor`, `limit`(1–100) |
| PATCH `/records/{record_id}` | `{variable,value,reason}`; ID con `encodeURIComponent`, conservar cita original y mostrar auditoría |
| DELETE `/records/{record_id}` | `{reason}`; exclusión reversible en artefactos históricos, sin borrar original |
| GET `/conflicts?status=open` | `{items,next_cursor:null}`; no hay paginación de conflictos en este recorte |
| POST `/conflicts/{conflict_id}/resolve` | `{choice,note?}`; opciones del conflicto, sin resolver discrepancias nuevas automáticamente |
| POST `/publish` | `{}`; publica estado revisado del servidor, bloquea conflictos abiertos |
| GET `/pack` | Obtener de nuevo URLs temporales de la publicación vigente |
| POST `/synthesis` | `{study_ids:[...],focus?:string}`; hasta 20 estudios y4000 caracteres de foco |

`PATCH schema` añade `add_variable` con `variable` revisada; sus evidencias se
verifican contra el documento. Se inicia `proposed` y requiere `set_status`
explícito. Las demás operaciones están en `CONTRATOS_FASE2.md` §5.5.
Variables categóricas tienen `unit:null`, no una unidad inventada.

La aprobación puede incluir `metadata` con **id,documents,lens,thresholds**.
`documents` se indexa por ID e incluye SHA, study, doi, title, kind, kind_note,
kind_evidence y licencia si existe. La lente aporta ejes, sigma del esquema,
preset con registro de origen y umbrales. El servidor valida y liga metadatos a
actor/fecha/hashes; el cliente no manda un sello de aprobación ya calculado.
Sin estos metadatos se permite aprobar extracción, pero publish se bloquea.
Ejemplo reproducible completo: `api/check_evidence_live.py`; no copiar valores
de ese corpus a otro proyecto.

`publish` y `pack` devuelven:

```json
{"pack_version":2,"lens_version":2,"expires_in":300,
 "files":{"pack":"<URL temporal>","lens":"<URL temporal>","mapping":"<URL temporal>"}}
```

Descargar inmediatamente los tres JSON y pasarlos al cargador/motor existente.
Si expiran, renovar con GETpack. CORS GET permite el CloudFront actual;
un dominio nuevo requerirá añadir su origen autorizado. Las URLs temporales
son acceso privado por posesión durante 300 s; no deben exponerse en documentación.
No sobrescribir `/demo`. La clave S3 incluye versión y hash; dos publicaciones
concurrentes no pisan los bytes de una versión ya publicada. La actualización
del puntero usa revisión condicional de DynamoDB.

Los registros devuelven `corrections`, `original_citations` e historial cuando
existen: mostrar dato corregido y original por separado. Corregir el registro
que sustenta un preset puede bloquear publicación hasta revisar también la
lente; no se adapta silenciosamente. Los excluidos se omiten de GETrecords y
del pack siguiente, conservándose en snapshots de revisión.

La síntesis devuelve `mode`, `method:"extractive_source_quotes"`,
`sentences:[{text,citations}]`, `dropped` y `note`. Considera como máximo seis
extractos originales y la IA selecciona hasta cinco; no redacta nuevos hechos.
Presentar `template` explícitamente. Este recorte no garantiza representar cada
estudio seleccionado: los primeros registros pueden ocupar los seis candidatos.

## Reproducir sin repetir llamadas exitosas

Python3.12, perfil `prometeo`, modelo desde configuración. No se imprimen
credenciales. La CLI pide la contraseña oculta; los tokens viven en memoria
del proceso y entorno del hijo, no en un `.env` compartido.

```bash
export AWS_PROFILE=prometeo
source infra/config.env
source infra/outputs.env
api/.venv/bin/python -m pytest api/ -q
T33_PYTHON=api/.venv/bin/python node tools/cognito/cli.mjs evidence \
  --workflow-dir tools/psi/data/dominio_ebullicion/lote \
  --output /tmp/prometeo-evidence-workflow.json
```

El primer comando de workflow crea un proyecto y consume modelo. Para continuar
un recibo existente usar además `--resume-receipt /tmp/prometeo-evidence-workflow.json`.
Si una propuesta falló, diagnosticar primero y añadir `--retry-docs <id fallido>`
solo después de corregir su causa. No volver a subir ni repetir fuentes exitosas.
`--diagnostics-project <id>` es solo lectura; `--inspect-project` es una inspección
previa y **no impide** que después continúe un workflow de escritura.
El recibo se guarda aun si falla, fuera del corpus; no contiene URLs ni tokens.

```bash
api/.venv/bin/python -I pipeline/validate_pack.py /tmp/prometeo-live-project-bundle
PROMETEO_PUBLICATION_PATH=/tmp/prometeo-live-project-bundle \
  npm test --prefix web -- src/engine/publication.test.ts
```

Para desplegar código nuevo del backend, sin crear otro proyecto AWS:

```bash
bash infra/20_api.sh
api/.venv/bin/python -I infra/deploy_projects.py \
  --output-dir /tmp/prometeo-evidence-next --uploads --schema --originals --evidence \
  --apply --contract-approved
bash infra/package_worker.sh /tmp/prometeo-worker-next.zip
api/.venv/bin/python infra/deploy_worker.py --output-dir /tmp/prometeo-worker-next \
  --zip /tmp/prometeo-worker-next.zip --apply --enable
# Solo después del lote controlado; no replay automático de DLQ:
api/.venv/bin/python infra/deploy_worker.py --output-dir /tmp/prometeo-worker-closed \
  --zip /tmp/prometeo-worker-next.zip --apply --disable
```

El mapping queda deshabilitado fuera de la ventana de prueba. Las cargas nuevas
se encolarán hasta habilitarlo; no interpretar eso como un worker permanente
de producción. Respetar USD 30 de presupuesto y revisar si un lote superaUSD 5.

## Pendientes conservados para el cierre completo

1. Pantallas de revisión, auditoría/conflictos, publicación y carga del pack
   privado. Equipo de interfaz; unificar lógica existente y revisión humana
   de `PLAN_FASE2.md` §9.2/§9.3 antes de otro deploy web.
2. Extracción PDF integrada contra el esquema aprobado y cita/página contextual;
   hay parser/propuestas, pero ningún PDF se convirtió aquí en registro de tabla.
3. Ruta explícita para revisar manualmente una propuesta IA rechazada; hoy el
   proyecto queda bloqueado hasta una propuesta válida o exclusión/corrección
   del corpus por un flujo posterior. No fabricar una aprobación del modelo.
4. APIs de claims de relación/huecos, variantes guardadas y cambio de intención
   con regeneración de lente; la CLI local no constituye persistencia API.
5. Revisión de las otras 21 fuentes del manifiesto de ebullición, sin ampliar la
   aprobación delegada de dos tablas. Síntesis de IA y cobertura por estudio
   requieren mejora/verificación adicional si se quieren declarar terminadas.
6. Medición CloudWatch de memoria máxima y costo facturado: consulta REPORT
   devolvió[]; los tokens de respuestas guardadas no prueban costo total AWS.
   La simulación IAM administrativa fue omitida por instrucción expresa del
   dueño bajo reloj; no se presenta como aprobada.
