# T33: cargas desplegadas, verificación completa pendiente

**Estado más reciente:** se publicó API y se aplicó --uploads correctamente.
Get/Put CORS ya autorizados y preflight real S3 HTTP 200 permite PUT con
content-type/if-none-match desde CloudFront. Falta smoke de archivo real y el
consumidor worker no está desplegado: complete deja mensajes en cola pendientes.
Las notas de bloqueo anteriores documentan el estado previo.

**Actualización 15-nov:** el dueño aprobó D3 con los límites de este documento
(20.000.000 bytes, 60 páginas, 30 documentos). Las secciones de propuesta/costo
conservan el contexto revisado. La carga continúa deshabilitada hasta completar
integridad, confirmación y procesamiento verificables; no es tope de gasto.

**Avance posterior:** implementados localmente complete, listado, jobs y resume,
y worker hasta propuesta. Intento de despliegue de cargas detenido antes de
habilitar variables/rutas por AccessDenied en s3:PutBucketCORS. La versión
desplegada sigue siendo la API de drafts verificada. Ver detalles actuales abajo.

## Alcance implementado localmente

`api/upload_tickets.py` reserva un documento y genera una URL PUT S3 privada
con vigencia máxima de 300 segundos. Usa el cuerpo vigente de §5.4:
`name`, `media_type` (`text/csv` o `application/pdf`) y `bytes`.
No acepta rutas/bucket/key del usuario; construye `u/<uid>/p/<pid>/raw/<doc_id>`.
Consulta propietario del proyecto antes de firmar o escribir.

Una transacción DynamoDB reserva documento y contador de proyecto juntos.
Condiciones de estado draft, revisión y cupo evitan superar el límite con
solicitudes simultáneas o sobrescribir una edición. Reintento con misma
Idempotency-Key y cuerpo reutiliza doc_id sin consumir otro cupo; otro cuerpo
da 409. Un conflicto concurrente da 409 y permite reintentar; no inventa éxito.

El URL firma tipo, ContentLength e If-None-Match: *, sin poner el nombre del archivo en la ruta.
El cliente debe enviar los bytes exactos con Content-Type indicado. El navegador
calcula Content-Length; no debe intentar fijarlo desde JS. Esta compatibilidad
aún requiere prueba real navegador/S3. Una URL puede caducar antes si vence la
sesión que la firmó. No registrar URLs prefirmadas en logs/repositorio.

`complete` comprueba existencia, bytes y Content-Type con HEAD; registra el hash
declarado en un campo interno y deja sha256 público null hasta que el worker
compare los bytes reales. Registra transición y envío pendiente en transacción;
si SQS falla, repetir complete o resume reintenta el envío. Duplicados de entrega
son posibles tras un fallo entre envío y checkpoint: el worker usa lease/cache.
Listados/paginación, jobs y resume verifican propietario; resume omite cargas
sin confirmar, trabajos terminados y leases aún activos.

## Gate D3 y estado del despliegue

No hay límites de producción implícitos: sin `UPLOADS_ENABLED=true` y sin
`UPLOAD_LIMITS_JSON` completo con enteros positivos, el servicio responde 503.
La configuración ya se aplicó a Lambda junto con rutas JWT de documentos,
permisos S3/tabla/cola y límites D3. Sigue pendiente comprobar el flujo de
archivo real; la configuración de la API no crea un consumidor SQS.

Ejemplo **para revisión**, no aprobación ni instrucción de activación:

```json
{"max_bytes":20000000,"max_pages":60,"max_documents":30}
```

20 MB significa aquí 20.000.000 bytes. El límite de documentos cuenta reservas,
incluidas subidas aún pendientes. Una reserva fallida/abandonada necesita una
operación de cancelación/limpieza para devolver cupo; no está implementada.
`uploaded_at` se inicializa al reservar conforme al shape actual; todavía no
demuestra que el archivo llegó a S3. El hash permanece null, stage upload y
status queued; no es confirmación ni evidencia de extracción.

## Lo que falta para verificar la etapa completa

1. D3 está aprobada. Mantener revisión de contrato/datos consolidada en
   `REVISION_FINAL_PENDIENTE.md`, sin aprobación automática de esquemas/datos.
2. Desplegar/probar complete y listado; hash verificado y duplicados se
   implementan en worker. No aceptar SHA del cliente como prueba de integridad.
3. PUT firmado IfNoneMatch impide sobrescritura, por comprobar en S3 real;
   no borrar una clave mientras su URL siga vigente. Worker usa ETag/hash real
   para verificar el original antes de parsear.
4. Control de páginas PDF y contenido real en parser/worker antes de Bedrock.
   El ticket solo valida la declaración de bytes/tipo, no interpreta archivos.
5. Verificar encolado durable/reintentos reales y desplegar el worker. Código
   local usa checkpoints, lease y respuestas persistentes; no se encoló nada
   ni se hizo una invocación Bedrock desde este avance.
6. Permisos mínimos de actualización/transacción DynamoDB y PUT S3 al prefijo
   raw, rutas JWT de documentos, configuración de límites y CORS necesarios.
7. Pruebas reales: URL firmada en navegador/S3, expiración/tamaño/tipo,
   propietario ajeno, cupo concurrente, repetición, hash y lote con corrupto.

## Estimación D3 para revisión

T32 registró **288.423 tokens de entrada y 47.227 de salida** en 56 llamadas;
son uso SDK observado, no lectura de la factura. El ejemplo oficial de AWS
de asistente con Haiku 4.5 usa USD 1,10/M entrada y 5,50/M salida. Aplicar
esas tarifas de referencia al uso T32 da **USD 0,5768 solo de modelo**.
No se verificó que sean la tarifa efectiva de este perfil/cuenta; la tabla
dinámica de Bedrock consultada no mostró la fila Haiku en su texto extraíble.

Escenario hipotético: 30 PDF × 60 páginas × 2.000 tokens/página × 2 etapas =
7.200.000 tokens de entrada; 30 × 2 etapas × 6.000 salida = 360.000 salida.
Con las mismas tarifas de referencia: USD 7,92 + 1,98 = **USD 9,90 por pasada**.
Tres pasadas equivalentes serían USD 29,70. No es una medición ni tope de gasto:
texto por página, chunking, reintentos y propuestas conjuntas cambian el costo.
S3, Lambda, DynamoDB, SQS, logs y transferencias se agregan; no se presupone
capa gratuita ni se cotiza el total. Máxima reserva del ejemplo: 600 MB raw por
proyecto, sin contar texto extraído ni packs/versiones.

Antes de producción hacen falta medición del worker y política de presupuesto,
tokens/llamadas y reintentos. Los límites de MB/páginas/documentos por sí solos
no garantizan un máximo monetario. No se cambió de modelo D6.

Fuentes consultadas 15-nov-2026:
- [Ejemplo oficial AWS con tarifas Haiku 4.5](https://aws.amazon.com/blogs/machine-learning/live-meeting-assistant-with-amazon-transcribe-amazon-bedrock-and-strands-agents/).
- [Precios Bedrock, verificar perfil/región/tier efectivos](https://aws.amazon.com/bedrock/pricing/).
- [S3: cargas con URLs prefirmadas y reemplazo de objetos](https://docs.aws.amazon.com/AmazonS3/latest/userguide/PresignedUrlUploadObject.html).

## Verificación local

```bash
api/.venv/bin/python -m pytest api/ -q
```

99 pruebas API/worker pasan con el entorno de `T34_WORKER_PREPARACION.md`: incluye dobles de reservas/transacciones, aislamiento,
límites y carrera por último cupo, repetición/conflicto y estados. También SDK
S3 real generando firma sin red con credenciales ficticias solo de test para
comprobar headers y caducidad. No prueba enforcement S3 ni transacciones AWS.

## Despliegue aplicado y smoke pendiente

El script `infra/deploy_projects.py --uploads` agrega las rutas JWT de tickets,
complete/listado/jobs/resume y permisos de ejecución de tabla, prefijo raw y
SendMessage de la cola existente. Antes de habilitar variables aplica CORS PUT
con if-none-match; el primer intento fue rechazado. Tras actualizar permisos,
la aplicación terminó con código 0 y el preflight real S3 fue HTTP 200.

Guion de despliegue aplicado y comprobación con una fuente real aún pendiente:

```bash
source infra/config.env
source infra/outputs.env
bash infra/20_api.sh
python3.12 -I infra/deploy_projects.py --output-dir /tmp/nueva-config-uploads \
  --uploads --apply --contract-approved
# Dos sesiones SRP; no se imprimen tokens ni URL prefirmada.
node tools/cognito/cli.mjs uploads /ruta/real/al/original.csv
```

Smoke preparado en `api/check_uploads_live.py`: PUT 200, sobrescritura 412,
complete/repetición 200, hash distinto 409, aislamiento 404 y listados/jobs 200.
Todavía no ejecutado. Deja un proyecto y un original para limpieza del dueño;
no elimina archivos. Solo probar el procesamiento completo cuando el consumidor
T34 esté empaquetado, desplegado y configurado de forma verificada.
