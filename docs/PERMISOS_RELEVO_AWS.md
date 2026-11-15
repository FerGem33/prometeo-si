# Permisos concretos para continuar el relevo AWS

Comprobación real del 15-nov con `AWS_PROFILE=prometeo`, cuenta 352818909129,
rol SSO `Prometeo-T31`. Login/STS y despliegue API funcionan. No se necesita
cambiar modelo, perfil ni usar root. Faltan permisos del operador; no nuevas
decisiones científicas.

## Worker T34

Aplicar `infra/t34-deployer-policy.json` al permission set existente en la
cuenta y reprovisionarlo. Conservar las políticas de T31/T33. El preflight real
devuelve AccessDenied en `iam:GetRole` sobre:

`arn:aws:iam::352818909129:role/prometeo-hack-worker-role`

La consulta real del contador de la cola también fue denegada en
`sqs:GetQueueAttributes`. La política del relevo ya cubría esa acción en ingest;
se completó la lectura de la DLQ y `logs:FilterLogEvents` del grupo exclusivo
del worker para verificar REPORT/memoria. ReceiveMessage se limita a la DLQ
para identificar el ID del corrupto, sin DeleteMessage ni SendMessage ni lectura
del contenido de la cola principal. No permite consultar facturación global.
Registrar uso de tokens y estimación
con precio documentado por separado de los cargos facturados; no inventar un
costo exacto cuando no hay evidencia de facturación.

Para identificar el corrupto después de los tres intentos, comparar el doc_id
del cuerpo con el recibo del lote; usar `--visibility-timeout 0`,
`--max-number-of-messages 1` y `--wait-time-seconds 0`. No borrar ni reenviar.
Un contador aproximado por sí solo no demuestra qué mensaje llegó a la DLQ.

El relevo exige además validar `CreateMappingOnlyForWorker` con el simulador
IAM, comprobando allowed para el ARN del worker y implicitDeny para otra
función. El perfil operativo tampoco tiene `iam:SimulateCustomPolicy`; puede
validarlo el administrador desde su propia sesión. No se agrega una política
administrativa general al operador. La sentencia usa Resource `*` solamente
para CreateEventSourceMapping y condición exacta FunctionArn, tal como quedó
en el archivo aprobado del relevo; no se debe quitar la condición.

La simulación del documento completo devolvió límite de 2000 caracteres. Para
comprobar esa condición basta simular la sentencia aislada, sin alterar la
política de despliegue completa. Conservar el resultado del simulador; ninguna
prueba local con dobles lo sustituye.

La referencia oficial confirma que CreateEventSourceMapping admite la condición
FunctionArn y carece de tipo de recurso acotable para esa acción:
[autorización de Lambda](https://docs.aws.amazon.com/service-authorization/latest/reference/list_lambda.html).
GetCallerIdentity no necesita agregar un permiso STS:
[API STS](https://docs.aws.amazon.com/STS/latest/APIReference/API_GetCallerIdentity.html).

## Web T38

`infra/deploy_web.sh` se detuvo **antes del sync** en GetDistribution denegado
para `E2SO4K789H7YOQ`. No publicó archivos ni creó invalidación.

Aplicar `infra/t38-web-deployer-policy.json` al mismo permission set y
reprovisionarlo. Solo permite consultar/invalidate la distribución existente,
listar el bucket web existente y subir sus objetos. No permite crear/borrar
distribuciones/buckets ni borrar objetos. GetInvalidation permite comprobar
el resultado; el script de publicación usa GetDistribution/CreateInvalidation.

## Después de aplicar

```bash
aws sso login --profile prometeo
export AWS_PROFILE=prometeo
set -a
source infra/config.env
source infra/outputs.env
set +a
aws sts get-caller-identity
aws iam get-role --role-name prometeo-hack-worker-role
```

Si el rol todavía no existe, `NoSuchEntity` confirma que pasó la autorización;
AccessDenied sigue siendo permiso faltante. No crearlo manualmente. Continuar
con el script idempotente y los pasos3–4 de `RELEVO_LAPTOP_AWS.md`, después de
la simulación del administrador. Empaquetar el commit más reciente; el ZIP
949f729 anterior no incluye todas las correcciones nuevas. Se dejó un paquete
actualizado en `/tmp/prometeo-worker-relevo-final.zip`, sin desplegar ni habilitar.
Si se mueve de laptop o cambia el código, regenerarlo; no subir el ZIP a Git.

Para web, repetir `bash infra/deploy_web.sh`, comprobar invalidación, dos
descargas T38 en CloudFront y comparar demo antes/después. Las comparaciones
previas de los tres JSON ya dieron igualdad byte a byte; no generar ni cambiar
el pack como parte de esta publicación.
