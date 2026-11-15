# T33: entrega local de identidad y proyectos

Estado: API de proyectos vacíos desplegada el 15-nov con aprobación acotada
del dueño. T33 no está hecha: faltan login/registro y prueba A/B con sesiones
reales. T30 completo/D3 siguen pendientes; no habilitar cargas. Pack sin cambios.

## Rutas implementadas

`api/handler.py` deriva `/projects` a `api/projects.py`. Se implementaron:

| Método/ruta | Resultado |
|---|---|
| `POST /projects` | Crea draft vacío, responde 201 |
| `GET /projects?limit=20&cursor=…` | Lista del usuario; límite 1–100 y cursor opaco |
| `GET /projects/{id}` | Consulta propia; ajena/inexistente devuelve 404 |
| `PATCH /projects/{id}` | Edita name/intent de draft sin documentos; responde 200 |

Cuerpo POST: `{"name":"…","intent":"…"}`. PATCH acepta uno o ambos campos.
No acepta `uid`, estado, versiones ni campos adicionales. Nombre 1–200 e
intención 1–4000 caracteres tras quitar espacios exteriores; cuerpo máximo
16000 bytes. Estas son validaciones locales de API, no límites D3 del corpus.

Crear con `Idempotency-Key` (1–128 caracteres alfanuméricos o `_.:-`) reutiliza
el proyecto para ese usuario y payload; misma clave con payload diferente da
409. La escritura condicional evita duplicados concurrentes. PATCH conserva
campos omitidos; repetición sin cambio no altera fecha; revisión interna evita
sobrescribir cambios concurrentes. Claves DynamoDB `U#sub`/`P#project_id`.
Campos internos no aparecen en respuestas. El cursor solo permite la partición
del usuario autenticado y claves de proyecto.

**Límite explícito:** cambiar intención de un proyecto procesado/publicado
devuelve 409 hasta implementar la regeneración de lente. Un draft vacío conserva
`lens_version=null`; no se simula una lente regenerada. DELETE y subrutas de
documentos/esquema aún no están implementadas.

## Identidad y frontera de confianza

Solo se leen claims de `requestContext.authorizer.jwt.claims`, que debe insertar
un authorizer JWT de API Gateway tras validar firma y vigencia. No se decodifica
ni se confía en `Authorization` dentro de Lambda. Además se comprueban issuer,
audiencia, expiración finita, `token_use=id` y `sub`. Sin configuración responde
503; sin claims adecuados 401. Errores internos no exponen mensajes del SDK.

Variables nuevas: `DATA_TABLE`, `COGNITO_ISSUER`, `USER_POOL_CLIENT_ID`.
Las rutas deben tener authorizer JWT con issuer/audience del pool/cliente de
`infra/outputs.env`. Cualquier invocador directo de Lambda capaz de fabricar
el evento también puede fabricar estos claims: no conceder invocación pública
o directa a clientes; restringir permisos de invocación al API autorizado.

Referencia de firma/claims del authorizer:
https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html

## Preparar configuración sin desplegar

```bash
source infra/config.env
source infra/outputs.env
python3.12 -I infra/prepare_projects.py --output-dir /tmp/prometeo-t33-config
# Repetir produce la misma configuración; si cambió, usar otro directorio/revisar.
```

Se generan cuatro JSON sin secretos: política DynamoDB acotada a tabla;
authorizer; fragmento de variables; lista de rutas JWT. Son artefactos para
revisión, no un despliegue. El fragmento de variables se debe **combinar** con
MODEL_ID/CF_URL y otras variables existentes, no reemplazar el entorno completo.

Antes de despliegue, el implementador de infra debe:

1. Publicar primero el paquete de `infra/20_api.sh`, que ahora incluye
   `api/projects.py` y conserva las variables existentes. Se añadió dependencia
   explícita boto3 1.44.3.
2. Configurar permisos DynamoDB GetItem/PutItem/Query solo para la tabla.
3. Crear/reutilizar authorizer y proteger cada ruta; configurar integración y
   permisos de invocación acotados. No exponer una ruta alternativa sin auth.
4. Añadir CORS Gateway GET/POST/PATCH/OPTIONS y headers Authorization,
   Content-Type e Idempotency-Key solo para CF_URL. El handler ya responde esos
   headers para proyectos, pero eso no configura el Gateway.
5. Integrar estas configuraciones en un script idempotente sin perder las
   rutas/variables del MVP, y probar dos usuarios reales antes de publicar UI.

`infra/20_api.sh` por sí solo no activa proyectos. `infra/deploy_projects.py`
configura los puntos 2–4 sobre API, integración, rol y Lambda existentes.
El despliegue final lo hará el dueño, tras registrar aprobación T30.

### Preparación y aplicación del despliegue de proyectos

```bash
source infra/config.env
source infra/outputs.env
# Seguro para preparar: no contacta AWS.
python3.12 -I infra/deploy_projects.py --output-dir /tmp/prometeo-t33-deploy
```

Revisar los cuatro JSON. Cuando el dueño haya aprobado T30, registrado la
decisión y revisado permisos SSO para IAM/Lambda/API Gateway:

```bash
export AWS_PROFILE=prometeo
aws sso login --profile prometeo
# Publica código; conserva variables previas de Lambda.
bash infra/20_api.sh
# Ejecutar solo después de registrar aprobación real, no para eludirla.
python3.12 -I infra/deploy_projects.py --output-dir /tmp/prometeo-t33-deploy \
  --apply --contract-approved
```

Los comandos se ejecutaron en la continuación del 15-nov: API y dos corridas
de configuración completadas con código 0. El flag no
autentica al aprobador: exige una decisión humana ya documentada. El script
verifica cuenta/rol no root, Lambda/rol exactos, API, stage `$default` auto-deploy
y una integración v2 existente. Reutiliza authorizer si coincide; detiene
configuraciones distintas sin reemplazarlas. Crea/actualiza únicamente las
cuatro rutas protegidas de proyectos. Conserva la ruta pública `$default` del
MVP, combina variables y aplica CORS del origen web.

Los permisos de invocación Lambda se acotan al API, stage, método y prefijo
projects; el comodín final `projects/*` corresponde a IDs de proyectos, no a
otros servicios o APIs. DynamoDB se acota al ARN exacto de la tabla. No se
concede acceso al bucket/colas ni se implementa el worker en este script.

Si falla un paso, conservar salida y reejecutar tras corregir la causa; las
pruebas locales comprueban reutilización, pero no demuestran idempotencia AWS
real. Verificar rutas/configuración efectivas y pruebas A/B después. No borrar
recursos para recuperar un fallo parcial. Evitar despliegues concurrentes;
la actualización de entorno usa RevisionId para detectar cambios externos.

Referencias de comandos AWS usados:
- https://docs.aws.amazon.com/cli/latest/reference/apigatewayv2/create-authorizer.html
- https://docs.aws.amazon.com/cli/latest/reference/apigatewayv2/create-route.html
- https://docs.aws.amazon.com/cli/latest/reference/lambda/update-function-configuration.html

## Pruebas y pendientes para interfaz

```bash
api/.venv/bin/python -m pytest api/ -q
npm test --prefix web
python3.12 -I pipeline/validate_pack.py
bash scripts/check_agnostic.sh
```

Pruebas de proyectos usan dobles locales de tabla y claims. Comprueban
aislamiento A/B, ausencia de claims, emisor/audiencia/expiración/tipo inválidos,
validación de entrada, reintentos con clave, concurrencia, paginación,
errores sanitizados y CORS. **No demuestran** firma JWT real, IAM ni aislamiento
del despliegue AWS. Validación real con Cognito/API Gateway/DynamoDB pendiente.

La interfaz puede preparar lista/creación/consulta/edición de draft con el
contrato `Project` y `Page<Project>`, conservando estados de carga y errores
401/404/409. Falta login/registro Cognito, rutas DELETE, uploads D3, worker y
lente de proyectos procesados. No conectar estas pantallas a producción hasta
que exista backend desplegado y verificado.

## Comprobación HTTP real y prueba A/B pendiente

`api/check_projects_live.py` comprobó 401 sin sesión, 401 con token inválido y
204 en CORS. `/ask` y `/analysis` regresaron 200; analysis fue mode=ai con tres
oraciones citadas. Authorizer `m6kz2q`, integración `ga1agdj`, cuatro rutas JWT;
`$default` permanece público para el MVP. Esto no prueba aún acceso autorizado
ni aislamiento de DynamoDB en ejecución real.

```bash
source infra/outputs.env
python3.12 -I api/check_projects_live.py --output /tmp/prometeo-t33-http.json
```

Para A/B, proporcionar `T33_TOKEN_A` y `T33_TOKEN_B` en el entorno local de la
terminal (ID tokens vigentes de dos usuarios diferentes del pool). No ponerlos
en comandos compartidos, capturas, chat, archivos versionados ni logs. El script
no los imprime ni persiste y solo usa el token en Authorization. Tras la prueba,
ejecutar `unset T33_TOKEN_A T33_TOKEN_B`.

Con ambos tokens, el mismo comando crea dos drafts de prueba, verifica lecturas,
listados, edición propia, 404 cruzado e idempotencia. La salida contiene sus IDs;
conservarlos para limpieza posterior del dueño. No se borran automáticamente:
DELETE aún no está implementado. El script es operativo, no ejecuta registro
ni inicio de sesión; esas sesiones siguen siendo el requisito pendiente.
