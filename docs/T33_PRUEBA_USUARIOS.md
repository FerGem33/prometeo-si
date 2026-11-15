# T33: comprobación real de usuarios y proyectos vacíos

15-nov-2026. API `https://ve5oqmsyie.execute-api.us-east-1.amazonaws.com`.
Pool Cognito `us-east-1_JP5FcOZMA`, cliente público de outputs.env.
El dueño autorizó dos cuentas propias. No se incluyen correos, contraseñas,
códigos ni tokens en este informe.

Ambos registros SignUp fueron aceptados, sus códigos se confirmaron y los dos
usuarios iniciaron sesión por USER_SRP_AUTH mediante `tools/cognito/cli.mjs`.
El comando `ab` obtuvo ID tokens independientes y ejecutó el smoke contra
Cognito/API Gateway/Lambda/DynamoDB reales; terminó con código 0.

| Comprobación | HTTP observado |
|---|---|
| Sin sesión | 401 |
| Token inválido | 401 |
| Preflight CORS | 204 |
| Crear draft A | 201 |
| Crear draft B | 201 |
| Repetir creación A con misma clave/payload | 201, mismo objeto |
| Misma clave A con otro payload | 409 |
| A lee proyecto B | 404 |
| B lee proyecto A | 404 |
| A edita proyecto B | 404 |
| A lee su proyecto | 200 |
| A edita su proyecto | 200 |
| Listado A | 200; no contiene ID del proyecto B |
| Listado B | 200; no contiene ID del proyecto A |

Las aserciones también comprobaron IDs distintos, igualdad de la respuesta
idempotente y paginación de los listados hasta agotar cursor. Se trata de estos
casos concretos, no de una auditoría exhaustiva de seguridad.

## Artefactos y limpieza

Recibo local: `/tmp/prometeo-t33-ab.json`. Contiene códigos HTTP e IDs, sin
tokens. Dos proyectos vacíos creados por la comprobación:

- A: `prj_b5c0debcba782937db5a509db8db696a67deba1e3058ba4126a3289e63fddc25`
- B: `prj_c5ad45fc81389729c844d55e363426e425496569adf9dd615b387958fd0e7e97`

Quedan retenidos para limpieza posterior del dueño. No se cargaron documentos,
no se publicó un pack y no se eliminó ningún recurso. DELETE aún no existe.

## Estado de T33 y siguiente entrega

Registro, confirmación, SRP y aislamiento probado de drafts están comprobados.
T33 sigue en curso: faltan tickets/cargas y límites D3, gestión completa de
proyectos y regeneración de lente al editar proyectos procesados. Las pantallas
de sesión/proyectos deben conectarse desde el equipo de interfaz.

Repetir con `tools/cognito/README.md` cuando cambien identidad, permisos o
rutas. Los tokens permanecen en memoria durante el comando; la limpieza local
no revoca las sesiones emitidas por Cognito.
