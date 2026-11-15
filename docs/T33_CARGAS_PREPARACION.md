# T33: reservas de carga preparadas, aún deshabilitadas

**Actualización 15-nov:** el dueño aprobó D3 con los límites de este documento
(20.000.000 bytes, 60 páginas, 30 documentos). Las secciones de propuesta/costo
conservan el contexto revisado. La carga continúa deshabilitada hasta completar
integridad, confirmación y procesamiento verificables; no es tope de gasto.

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

El URL firma tipo y ContentLength, sin poner el nombre del archivo en la ruta.
El cliente debe enviar los bytes exactos con Content-Type indicado. El navegador
calcula Content-Length; no debe intentar fijarlo desde JS. Esta compatibilidad
aún requiere prueba real navegador/S3. Una URL puede caducar antes si vence la
sesión que la firmó. No registrar URLs prefirmadas en logs/repositorio.

## Gate D3 y estado del despliegue

No hay límites de producción implícitos: sin `UPLOADS_ENABLED=true` y sin
`UPLOAD_LIMITS_JSON` completo con enteros positivos, el servicio responde 503.
La configuración no se ha aplicado a Lambda. Tampoco se agregaron rutas JWT
de documentos ni permisos S3/actualización de tabla en AWS. La API desplegada
continúa con el alcance de proyectos vacíos.

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

## Lo que falta antes de habilitar

1. Aprobación explícita D3 y del resto del contrato relevante. Registro en
   PROGRESS, no inferirla de mensajes de continuidad.
2. `complete`, listado de documentos, confirmación de tipo/tamaño reales y hash
   comprobado; detección de duplicados. No aceptar SHA del cliente como prueba.
3. Integridad ante reemplazo de un objeto después de confirmar: las URLs PUT
   pueden reutilizarse hasta expirar. Diseñar/validar fuente inmutable o
   verificación de hash antes de cada extracción; una cita no basta para hash.
4. Control de páginas PDF y contenido real en parser/worker antes de Bedrock.
   El ticket solo valida la declaración de bytes/tipo, no interpreta archivos.
5. Encolado durable y reintentos (SQS estándar no es atómico con DynamoDB),
   worker idempotente y estados por documento. No se encola nada en esta entrega.
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

85 pruebas API pasan: incluye dobles de reservas/transacciones, aislamiento,
límites y carrera por último cupo, repetición/conflicto y estados. También SDK
S3 real generando firma sin red con credenciales ficticias solo de test para
comprobar headers y caducidad. No prueba enforcement S3 ni transacciones AWS.
