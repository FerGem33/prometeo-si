# T33: permisos pendientes para desplegar

## CORS para cargas: resuelto

Tras actualizar el permission set, GetBucketCors y aplicación --uploads
terminaron correctamente. OPTIONS real S3 respondió HTTP 200 con PUT y
content-type/if-none-match desde CloudFront. La declaración de abajo ya está
comprobada; los rechazos descritos corresponden al intento previo.

El intento `deploy_projects.py --uploads` fue rechazado con AccessDenied al
ejecutar s3api put-bucket-cors (exit 254). No habilitó rutas/variables de cargas.
La política versionada añade esta declaración, que debe agregarse a la política
inline existente sin eliminar declaraciones anteriores ni duplicar Sid:

```json
{
  "Sid": "ConfigureOnlyCorpusUploadCors",
  "Effect": "Allow",
  "Action": ["s3:GetBucketCORS", "s3:PutBucketCORS"],
  "Resource": "arn:aws:s3:::prometeo-hack-corpus-352818909129"
}
```

Reprovisionar permission set en la cuenta y renovar SSO. Esta es una acción
administrativa para desplegar, no una aprobación de datos científicos.

## Historial del permiso de Lambda

**Actualización:** el dueño añadió permisos y renovó SSO; se completó el
despliegue acotado de drafts. El bloqueo descrito abajo es histórico. Los
waiters se corrigieron para usar GetFunctionConfiguration, sin ampliar acceso
a GetFunction. Resultados reales y prueba A/B pendiente en `T33_API_PROYECTOS.md`.

## Resultado real del preflight

El perfil `prometeo` autentica en cuenta `352818909129` con el rol SSO
`AWSReservedSSO_Prometeo-T31_e5fccb7bc636c4a5/prometeo-admin`.
AWS rechazó la consulta de la API Lambda:

```text
GetFunctionConfiguration: AccessDeniedException
Acción faltante: lambda:GetFunctionConfiguration
Recurso: arn:aws:lambda:us-east-1:352818909129:function:prometeo-hack-api
```

No se ejecutó un despliegue ni se modificaron recursos en este intento.
T31 sigue hecha. T33 no puede verificarse en AWS con los permisos actuales.

## Acción del administrador de la cuenta

En IAM Identity Center, editar el permission set asignado a la cuenta para el
perfil `prometeo` (actualmente `Prometeo-T31`) o crear uno específico de
despliegue y asignarlo a la misma persona. La política adicional propuesta
está en [`infra/t33-deployer-policy.json`](../infra/t33-deployer-policy.json).

1. Revisar sus acciones y recursos. Concede despliegue sobre la Lambda/API
   existentes, configuración de su rol y lectura del perfil Bedrock aprobado.
   No concede crear/borrar tabla, bucket, colas ni pool; no cubre worker ni web.
2. En la política inline del permission set, añadir sus declaraciones dentro
   del array `Statement` existente. No pegar un segundo objeto JSON completo
   ni eliminar los permisos T31 si se pretende conservar ese alcance.
3. Guardar y reprovisionar el permission set en la cuenta `352818909129`.
4. Si se creó otro permission set, volver a configurar `aws configure sso
   --profile prometeo` y elegir ese rol; conservar nombre local `prometeo`.
5. Ejecutar `aws sso login --profile prometeo` y avisar para reanudar el preflight.

`iam:PutRolePolicy` modifica únicamente el rol de la API, pero es un permiso
de administración de sus políticas; el administrador debe revisarlo antes de
asignarlo. `iam:PassRole` está limitado a ese rol y al servicio Lambda.
El comodín en rutas Gateway se limita a rutas de la API concreta (sus IDs
los asigna AWS). No hay Resource global ni acciones de borrado.

La política se revisó como JSON y contra las operaciones de los scripts;
no está validada con IAM Access Analyzer ni probada desplegando en AWS.
Permisos adicionales que AWS rechace deberán diagnosticarse de forma concreta.
Los permisos de los scripts no sustituyen la aprobación del contrato T30.

## Reanudación

Tras actualizar permisos y aprobar el alcance concreto de cuentas/proyectos,
el agente verifica identidad y lectura, ejecuta pruebas, publica la API y
configura rutas de T33 siguiendo `T33_API_PROYECTOS.md`. Después comprueba
rechazo sin token y aislamiento con dos usuarios reales. Las cargas permanecen
pendientes de D3 y de implementar sus validaciones/worker.

`infra/20_api.sh` ahora consulta el rol y Lambda concretos, y reutiliza API_ID
de outputs. Ya no necesita listar todos los roles, funciones o APIs para
desplegar sobre los recursos existentes. No usar este conjunto de permisos
como política de bootstrap: crear recursos distintos requiere otra revisión.

Referencias oficiales:
- [Acciones y recursos de API Gateway V2](https://docs.aws.amazon.com/service-authorization/latest/reference/list_apigatewayv2.html).
- [Restricción de las políticas que se pueden adjuntar](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_controlling.html).
