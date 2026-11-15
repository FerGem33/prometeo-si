# T33: registro, confirmación, login SRP y prueba A/B

Herramienta local para el dueño y para verificar integración sin construir las
pantallas del equipo frontend. SDK `amazon-cognito-identity-js` 6.3.22 fijado con
lockfile. No requiere llaves AWS, privilegios IAM ni secreto de cliente.
Usa el cliente público de Cognito existente y `USER_SRP_AUTH`; no cambia sus
flujos de autenticación. Node 22, npm y Python 3.12 para el smoke A/B.

## Preparación

Desde la raíz del repo, en tu terminal local:

```bash
npm ci --prefix tools/cognito --ignore-scripts
source infra/config.env
source infra/outputs.env
```

Si la sesión requiere usar otro Python 3.12, exportar `T33_PYTHON` con la ruta
del ejecutable. No modificar pool/client para apuntar a otro entorno sin revisar.

## Registrar dos cuentas reales

Para cada correo que puedas consultar:

```bash
node tools/cognito/cli.mjs register
node tools/cognito/cli.mjs confirm
node tools/cognito/cli.mjs login
```

`register` pide correo y contraseña y envía el código mediante Cognito al correo
indicado. `confirm` pide correo y código recibido. `login` comprueba SRP sin
imprimir el ID token. Cognito aplica la política de contraseña del pool; el
script no la relaja. No compartir contraseñas, códigos ni tokens por chat.
No usar correos ajenos. Dos registros reales del dueño, confirmación y SRP
ya se comprobaron; evidencia en `docs/T33_PRUEBA_USUARIOS.md`.

## Verificar aislamiento con las dos cuentas

```bash
node tools/cognito/cli.mjs ab
```

Pide por separado el correo y contraseña de A y B, inicia dos sesiones SRP
independientes e invoca `api/check_projects_live.py`. Comprueba rechazo de
peticiones anónimas, CORS, creación/listado/lectura/edición, reintentos y 404
cruzado. Si ambas sesiones pertenecen al mismo usuario, la prueba falla.
Recibo sin tokens en `/tmp/prometeo-t33-ab.json`.

La prueba **crea dos proyectos vacíos** de verificación. Sus IDs quedan en el
recibo para limpieza futura; no se borran automáticamente porque DELETE aún
no existe. No cargar documentos para esta prueba. D3 de cargas sigue pendiente.

La contraseña y el código se ocultan durante entrada. El SDK usa almacenamiento
aislado en memoria y se limpia al terminar. Los tokens A/B pasan únicamente al
entorno del proceso hijo, no a argumentos de shell, archivos ni logs. La
limpieza local no revoca tokens emitidos ni constituye un logout global.

Errores del SDK se muestran solo por código/clase: por ejemplo,
UserNotConfirmedException requiere confirmar el correo; NotAuthorizedException
requiere revisar sesión/credenciales; TooManyRequestsException requiere esperar.
MFA, contraseña temporal y desafíos personalizados se detectan y detienen;
su interacción no está implementada. Repetir `register` no elimina ni reemplaza
una cuenta existente.

## Qué puede reutilizar la interfaz

`client.mjs` expone `register`, `confirm`, `login` y `clear`, y utiliza las APIs
del SDK oficial. Sirve como referencia técnica; no está conectado al bundle web.
El equipo debe implementar estados de sesión, recuperación de contraseña,
renovación/cierre de sesión y desafíos que decida soportar. Esta CLI no sustituye
esas pantallas ni un cliente web completo. El token enviado al backend es el
ID token, conforme al contrato vigente de T33.

## Verificación de esta entrega

```bash
npm test --prefix tools/cognito
```

Seis pruebas: construcción del SDK real sin red y dobles para registro,
confirmación sin transferencia de alias, SRP, errores/desafíos, sesión inválida
y almacenamiento aislado/limpieza. No prueban correos enviados, login real ni
aislamiento A/B remoto por sí solas. Esos flujos se ejecutaron y comprobaron
por separado con las cuentas confirmadas; ver `docs/T33_PRUEBA_USUARIOS.md`.

Referencias de API: declaraciones `index.d.ts` del paquete fijado y
[ejemplo AWS de Cognito con interfaz propia](https://github.com/aws-samples/sample-aws-cognito-oidc-saml-proxy/blob/main/examples/custom-ui/README.md).
