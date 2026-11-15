# T34: worker local hasta propuesta, todavía sin despliegue

## Implementación y alcance

`api/ingest_worker.py` recibe mensajes SQS con versión, uid, project_id y doc_id.
Comprueba que el proyecto pertenece al uid y que la ruta raw corresponde al
documento. Adquiere un lease condicional, lee S3 con IfMatch del ETag registrado
y compara tamaño y SHA-256 reales antes de parsear. Un hash declarado por
cliente nunca equivale a un valor verificado.

Reutiliza CSV/perfilado/validación de `pipeline/ingest.py`, que conserva librería
estándar. PDF usa pypdf 7.1.0 en el adaptador API/worker, con página física 1-based
y texto original; no requiere un binario Poppler en Lambda ni hace OCR.
Parser `pypdf-7.1.0-plain` se registra y participa en las claves de respuesta.
Es distinto del parser Poppler de T32; sus citas deben verificarse/revisarse con
ese texto y no se considera que sus resultados sean equivalentes automáticamente.

Se conservan en S3 parseo/perfil, respuestas crudas con uso SDK y propuestas
validadas por documento/lote de páginas. La clave de respuesta incluye fuente,
parser, modelo, prompt y contenido. Reintentos reutilizan respuestas guardadas;
la prueba local interrumpe el último checkpoint y demuestra 1 llamada al doble
de modelo en ambos intentos. Contador durable limita 20 intentos de modelo por
documento, incluidos fallos, con 6000 tokens máximos de salida por llamada.
No es presupuesto monetario global ni sustituye medir los costos efectivos.

Duplicados se detectan por SHA real, con marcador de hash de proyecto. No se
fusionan esquemas ambiguos: las propuestas por lote quedan separadas. Cuando
todos los documentos terminan, proyecto pasa a awaiting_review; si hay fallos
terminales, pasa a failed. Los errores son por documento y el handler retorna
`batchItemFailures`. No se aprueba, extrae ni publica automáticamente.

## PDF reales comprobados localmente

Los mismos cinco originales de T32, conservados en `/tmp/prometeo-t32/pdfs/`:

| NTRS PDF | Resultado con límite 60 páginas | Peticiones preparadas |
|---|---|---|
| 20120015928 | 44 páginas, 81049 caracteres | 3 |
| 20150008961 | 10 páginas, 31520 caracteres | 1 |
| 20150019858 | 9 páginas, 29883 caracteres | 1 |
| 20150023456 | Rechazado: too_many_pages | 0 |
| 20210011385 | Rechazado: too_many_pages | 0 |

No se invocó Bedrock en esta comprobación. Recibo local
`/tmp/prometeo-worker-parse-check.json`; hashes originales en `T32_EVALUACION.md`.
El primer PDF sí entrega texto con este parser, aunque Poppler lo marcó sin
texto en la prueba anterior. Es una diferencia técnica pendiente de revisar,
no evidencia de corrección científica. El primer intento con modo layout avisó
de texto girado omitido; se cambió a modo simple y se repitió la prueba.

## Empaquetado y configuración que falta desplegar

```bash
bash infra/package_worker.sh /tmp/nuevo-prometeo-worker.zip
```

Genera dependencias Linux arm64/Python 3.12 y módulos ingest_worker,
ingest_propose e ingest_core. No incluye corpus, credenciales ni configuración
de aprobación. No contacta AWS. No reemplaza un ZIP existente.

## Despliegue: `infra/deploy_worker.py` (escrito el 15-nov, sin ejecutar contra AWS)

Por defecto solo prepara: escribe `worker-trust.json`, `worker-policy.json`, `worker-env.json`
y `worker-mapping.json` para revisión y no hace llamadas AWS. Con `--apply`:

1. Preflight: identidad no root en `352818909129`, visibilidad de cola >= 6x timeout con la DLQ de
   T31, perfil de inferencia igual al modelo D6. Si algo no coincide, se detiene antes de escribir.
2. Rol `prometeo-hack-worker-role` (se crea si no existe; si existe con otra confianza, se detiene),
   `AWSLambdaBasicExecutionRole` y política inline acotada: tabla concreta; `GetObject` en `raw/`;
   `Get/PutObject` en `text/`; `ListBucket` solo del bucket de corpus; Receive/Delete/GetAttributes/
   ChangeVisibility de la cola concreta; `InvokeModel` del perfil D6 y sus modelos.
3. Lambda `prometeo-hack-worker`: Python 3.12 arm64, `ingest_worker.handler`, 120 s, 1024 MB,
   variables DATA_TABLE/CORPUS_BUCKET/MODEL_ID/UPLOAD_LIMITS_JSON (D3). Si existe con otro rol, se detiene.
4. Asociación SQS: batch 1, `ReportBatchItemFailures`, concurrencia máxima 2, **creada deshabilitada**.
   Su UUID se guarda en `outputs.env` (`WORKER_MAPPING_UUID`) y las corridas siguientes la reutilizan.
   Si existe pero falta el UUID, se detiene en vez de duplicarla.
5. `--enable` / `--disable` cambian el estado de forma explícita; sin ellas no se toca.

**Por qué `s3:ListBucket`:** sin él, S3 responde 403 (no 404) a un objeto inexistente y
`read_json` trataría cada caché vacía como error: la primera llamada al modelo de todo documento
fallaría. Los tests con dobles no lo detectan. ListBucket no se puede acotar por prefijo para esa
comprobación; queda limitado al bucket de corpus. Requiere visto bueno humano como cualquier permiso nuevo.

Permisos del operador: `infra/t34-deployer-policy.json` (añadir al permission set SSO, como T33).
`lambda:CreateEventSourceMapping` solo admite `Resource: "*"`; se limita con la condición
`lambda:FunctionArn` al worker. Conviene validarla con el simulador de políticas IAM antes de usarla.

Guion en la laptop con perfil `prometeo` (Linux/macOS, Python 3.12):

```bash
export AWS_PROFILE=prometeo && source infra/config.env && source infra/outputs.env
bash infra/package_worker.sh /tmp/prometeo-worker-$(git rev-parse --short HEAD).zip
python3.12 -I infra/deploy_worker.py --output-dir /tmp/prometeo-t34-config            # revisar JSON
python3.12 -I infra/deploy_worker.py --output-dir /tmp/prometeo-t34-config --apply --zip /tmp/prometeo-worker-<sha>.zip
source infra/outputs.env   # recoge WORKER_MAPPING_UUID antes de la segunda corrida
python3.12 -I infra/deploy_worker.py --output-dir /tmp/prometeo-t34-config --apply --zip /tmp/prometeo-worker-<sha>.zip   # idempotencia
# Solo después de revisar rol/variables y aceptar el costo Bedrock de los mensajes ya encolados:
python3.12 -I infra/deploy_worker.py --output-dir /tmp/prometeo-t34-config --apply --zip /tmp/prometeo-worker-<sha>.zip --enable
```

**Atención al habilitar:** la cola ya puede tener mensajes de `complete` (por ejemplo del smoke
de T33). Al habilitar, se procesan de inmediato con llamadas reales a Bedrock.

Pruebas: `api/test_deploy_worker.py` (10, con dobles): dos corridas sin duplicar, asociación
deshabilitada por defecto, `--enable`/`--disable`, conservación de variables ajenas, reintento solo
por propagación del rol nuevo, UUID perdido, preflight root/visibilidad y rol/función distintos.
No son evidencia de AWS real.

## Lo que falta comprobar

Antes de habilitar el consumidor deben comprobarse:

- Lambda worker separada: runtime Python 3.12 arm64, handler
  `ingest_worker.handler`, timeout propuesto 120 s y memoria a medir con PDF real.
- Variables: DATA_TABLE, CORPUS_BUCKET, MODEL_ID, UPLOAD_LIMITS_JSON. Rol de
  ejecución propio: tabla concreta, GetObject de raw, Get/PutObject de text,
  cola concreta para Receive/Delete/GetQueueAttributes, logs y modelo D6.
- Asociación SQS con batch size 1, ReportBatchItemFailures y estado inicialmente
  deshabilitado hasta comprobar permisos/configuración. La visibilidad actual
  960 s permite margen >=6x para 120 s, conforme a guía AWS.
- PDF malformados pueden agotar CPU/memoria aunque los bytes estén limitados.
  Medir aislamiento, timeout y consumo; un timeout debe poder reanudarse tras
  vencer lease, y un corrupto debe llegar a DLQ sin perder otros documentos.
- Falta lote real de diez documentos, recepción DLQ tras tres intentos y
  reanudación real con checkpoints. No marcar T34 hecha con dobles locales.
- Faltan rama extract/verify tras aprobación humana (T35), ensamblado del esquema
  conjunto y publicación (T37). Esta implementación termina en propuesta.

Referencia: [SQS/Lambda, visibilidad y configuración](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html).

## Pruebas reproducibles

Crear venv temporal Python 3.12 e instalar `api/requirements-worker.txt` y pytest
8.3.5. Luego:

```bash
/tmp/prometeo-worker-venv/bin/python -m pytest api/ -q
```

99 pruebas API/worker con PDF habilitado pasan. Incluyen hash incorrecto antes
de IA, CSV corrupto, páginas/no texto, cache, duplicados, aislamiento del mensaje
y estado proposed. Las llamadas del worker a S3, DynamoDB y modelo en esos
tests son dobles; la lectura de los cinco PDF es real/local.
