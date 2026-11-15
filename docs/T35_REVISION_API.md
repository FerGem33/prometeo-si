# T35 — Revisión versionada del esquema (implementación local)

Estado: backend implementado y probado con dobles; no equivale a verificación
desplegada ni a T35 terminada. Falta la pantalla del equipo de interfaz y la
verificación completa con un pack publicado (T37).

## Contrato y garantías

Tres rutas JWT del contrato §5.5: `GET /projects/{id}/schema`, `PATCH` de la
misma ruta y `POST /projects/{id}/schema/approve`. La identidad se toma del
authorizer; un proyecto ajeno responde 404.

GET prepara una propuesta conjunta sin aprobarla. Los identificadores de
variables se separan por documento y fragmento; dos columnas con nombres
parecidos no se fusionan automáticamente. Una columna propuesta dos veces o
constantes sin revisión explícita de evidencia/alcance producen 409.

PATCH recibe `{version, edits}` con las operaciones de §5.5, conserva el
artefacto anterior y crea otra versión propuesta. Una versión vieja produce
409. Editar un esquema aprobado revoca su aprobación para esa nueva versión.
Cada artefacto queda vinculado a SHA-256 de fuentes y esquema. Se comprueban
además ETag y tamaño del original de S3; modificar fuentes exige reprocesar.

POST approve exige resolver todos los estados `proposed`, conversiones y
alcance de constantes; reutiliza el validador local de T32. Solo esa llamada
explícita genera la aprobación y un mensaje de extracción. El estado devuelto
por un modelo nunca concede aprobación. Extensión opcional del cuerpo:
`review_authority` (1–1000 caracteres) registra la declaración del revisor;
no certifica experiencia ni sustituye la autenticación. La delegación del dueño
solo se aplica a las versiones concretas revisadas de ebullición y PDF de T32.

La escritura usa una transacción con revisión/versión condicional y artefactos
inmutables. El indicador persistente `extraction_dispatch_pending` permite
repetir approve si SQS falló sin crear otra versión aprobada. Los mensajes
duplicados se verifican por versión/hash; una versión obsoleta no se extrae.

El worker reclama leases de esquema y documentos, extrae tablas con citas
por celda y conversiones explícitas y guarda un borrador independiente del
pack público. Conserva rechazos/conflictos y cuenta los conflictos abiertos;
`ready_to_publish` no autoriza publicar sin resolverlos. Esta etapa no añade
llamadas al modelo para tablas. La extracción PDF contra el esquema del
proyecto y su revisión contextual aún requieren integración antes del cierre.

## Preparación y despliegue por etapas

Desde la raíz, con Python 3.12 y entorno preparado:

```bash
api/.venv/bin/python -m pytest api/ -q
export AWS_PROFILE=prometeo
set -a
source infra/config.env
source infra/outputs.env
set +a
# Preparar sin tocar AWS, en una carpeta nueva:
api/.venv/bin/python -I infra/deploy_projects.py --output-dir /tmp/prometeo-t35-review --uploads --schema
# Después del smoke DELETE y del worker del relevo:
bash infra/20_api.sh
api/.venv/bin/python -I infra/deploy_projects.py --output-dir /tmp/prometeo-t35-review --uploads --schema --apply --contract-approved
```

Con `--schema` se esperan 14 rutas JWT. Sin ese flag, T33 mantiene sus 11 rutas.
El rol de API añade lectura de `text/*` y lectura/escritura de `schema/*` solo
bajo `u/*/p/*` del bucket de corpus existente. El paquete del worker incluye
los validadores estándar, y su rol puede leer los esquemas aprobados.
Actualizar el worker con `infra/package_worker.sh` y `infra/deploy_worker.py`
según el relevo, deshabilitado fuera de la ventana de prueba.

## Evidencia y límites

Pruebas funcionales con dobles de persistencia/AWS: aislamiento, versiones
inmutables, aprobación explícita y repetida, invalidación por cambio de fuentes
o esquema, conversión de unidades, alcance incompleto, mensaje malformado,
versión obsoleta, extracción sin publicación y fallo/recuperación de leases.
No son evidencia de IAM, transacciones DynamoDB ni SQS en AWS real.
Las cifras exactas de cada corrida están en PROGRESS.md.
