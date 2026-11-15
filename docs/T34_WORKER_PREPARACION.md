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

Falta script idempotente de provisión/despliegue y sus permisos administrativos.
Antes de crear el consumidor deben comprobarse:

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
