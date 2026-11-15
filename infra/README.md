# Despliegue y relevo de Prometeo

## Estado comprobado

Web: https://dursf4nho4zl6.cloudfront.net

El 2026-11-14 se comprobó CloudFront `Deployed` y HTTPS HTTP 200.
Está publicado el informe de T05–T07. Falta verificar visualmente la página:
la herramienta de navegador del agente no estuvo disponible. T08 sigue en
curso hasta completar esa verificación. La API ya está desplegada y Bedrock verificado; la integración UI T11 está
implementada en el repo, pendiente de deploy final por el dueño.

## Qué se comparte y qué se configura por persona

Los archivos necesarios ya están versionados; no hace falta otro `.env`:

| Archivo | Contenido | Tratamiento |
|---|---|---|
| `infra/config.env` | Región us-east-1, prefijo prometeo-hack, MODEL_ID | Compartido en Git; MODEL_ID confirmado con invocaciones reales |
| `infra/outputs.env` | WEB_BUCKET, CF_ID y CF_URL reales | Compartido en Git; lo actualiza 10_web.sh |
| Perfil AWS `prometeo` | Sesión y credenciales de cada persona | Solo local, fuera del repositorio |

No guardar claves, contraseñas ni tokens en esos archivos, commits o mensajes.
No copiar `~/.aws/` entre personas. Los IDs públicos no conceden acceso a AWS.
No cambiar PROJECT, REGION ni los outputs para publicar en la infraestructura
existente. El despliegue debe autenticar contra la misma cuenta propietaria del
bucket; el script comprueba esa correspondencia.

## Equipo: añadir cambios sin publicar

Trabajar desde la raíz del repositorio. Requisitos: Git, Node 22.23.1 o una
versión compatible con Vite 8, npm; Python 3.12 para pipeline/API.

```bash
git status --short
git pull --rebase
npm ci --prefix web
```

Antes de editar, leer AGENTS.md, PROGRESS.md y la tarea de docs/PLAN.md.
Si hay cambios locales, resolverlos antes del pull; no descartarlos.
Registrar quién toma la tarea y su siguiente paso en PROGRESS.md.
Hacer cambios solo dentro de su alcance. Para comprobarlos:

```bash
npm test --prefix web
npm run build --prefix web
bash scripts/check_agnostic.sh
python3.12 -I pipeline/validate_pack.py
```

Si se cambia el pipeline, regenerar y validar el pack según el plan. Cuando
existan la API y sus dependencias, ejecutar también `python3.12 -m pytest api/`.
La API ya tiene pruebas: instalar api/requirements-dev.txt y ejecutar
`api/.venv/bin/python -m pytest api/ -q`.

Actualizar PROGRESS.md con tarea, resultados reales, bloqueos y siguiente paso.
Revisar y añadir únicamente los archivos de esa tarea:

```bash
git diff --check
git diff
# Sustituir las rutas y el mensaje por los de la tarea real:
git add PROGRESS.md ruta/del/archivo
git commit -m "Txx: descripción del cambio"
git pull --rebase
git push
```

Si el rebase integra cambios que afectan la tarea, repetir las comprobaciones.
No incluir `tools/datos_psi/` por accidente: es una carpeta local preexistente.
**Un push no publica la web:** la publicación es manual y la realiza el dueño
al final. Los colaboradores que solo editan código no necesitan acceso AWS.

## Dueño: preparar acceso AWS una vez por laptop

Instalar AWS CLI v2. Para autenticación por navegador se requiere 2.32.0 o
superior y una identidad con permiso `SignInLocalDevelopmentAccess`:

```bash
aws --version
aws configure set region us-east-1 --profile prometeo
aws configure set output json --profile prometeo
aws login --profile prometeo
aws sts get-caller-identity --profile prometeo
```

Si la cuenta usa IAM Identity Center, usar en su lugar:

```bash
aws configure sso --profile prometeo
aws sso login --profile prometeo
aws sts get-caller-identity --profile prometeo
```

Comprobar que Account coincide con la cuenta del bucket en outputs.env.
Cada persona usa su identidad; no compartir el acceso root usado en la sesión
inicial. Esta guía no crea usuarios ni concede permisos automáticamente.

Para publicar en infraestructura existente se requieren las operaciones
`sts:GetCallerIdentity`, `cloudfront:GetDistribution`,
`cloudfront:CreateInvalidation`, `s3:ListBucket`, `s3:PutObject` y, según las
comprobaciones de transferencia, `s3:GetObject`, acotadas a los recursos de
outputs.env donde sea posible. Crear infraestructura requiere además las
operaciones S3/CloudFront de `10_web.sh`; no se necesita AdministratorAccess.
El acceso web no demuestra acceso a Bedrock o Lambda.

Documentación oficial de autenticación:
- https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sign-in.html
- https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html

## Dueño: despliegue final de la web

No ejecutar hasta que los cambios del equipo estén integrados y sus pruebas
pasen. Desde la raíz del repositorio:

```bash
git status --short
git pull --rebase
git log -1 --oneline
npm ci --prefix web
npm test --prefix web
npm run build --prefix web
bash scripts/check_agnostic.sh
python3.12 -I pipeline/validate_pack.py
export AWS_PROFILE=prometeo
source infra/config.env
source infra/outputs.env
aws sts get-caller-identity
bash infra/deploy_web.sh
```

Si falla una comprobación, detenerse y corregirla antes de publicar.
`deploy_web.sh` verifica cuenta/bucket/origen, compila, sube web/dist e invalida
`/*`. No requiere recrear infraestructura. No usa `--delete`: conserva assets
antiguos para evitar borrados no confirmados, diferencia documentada con el
plan original. No modifica el código fuente ni publica la API.

Si se necesita crear o recuperar infraestructura, ejecutar primero
`bash infra/10_web.sh`. Reutiliza bucket, OAC y distribución existentes; guarda
outputs sin credenciales. No editar los IDs a mano ni crear otra distribución
desde la consola. Revisar y commitear outputs.env si cambia.

## Verificación después de publicar

```bash
source infra/outputs.env
aws cloudfront get-distribution --profile prometeo --id "$CF_ID" --query Distribution.Status
curl -sI "$CF_URL"
```

Esperar `Deployed` y HTTP 200. La invalidación puede seguir `InProgress`:
consultar `aws cloudfront get-invalidation --profile prometeo
--distribution-id "$CF_ID" --id ID_DEVUELTO_AL_PUBLICAR` hasta `Completed`.
Abrir CF_URL en navegador y verificar el informe, presets, sliders, procedencia,
URL de escenario y exportación PDF; probar también en móvil y otra laptop.
HTTP 200 por sí solo no verifica React ni esas interacciones.

Anotar en PROGRESS.md el commit desplegado, fecha, URL, resultados y cualquier
pendiente; commit y push de esa evidencia. No marcar T15 completa sin todas sus
comprobaciones. La API T09/T10 ya está desplegada. La UI T11 está implementada y pendiente de
publicación/verificación visual. Si el equipo cambia API o pack, publicar
primero `bash infra/20_api.sh` y probar los eventos. Después publicar la web con
`bash infra/deploy_web.sh`: el script exporta VITE_API_URL desde API_URL de
outputs.env antes de compilar. Esa URL es pública, no una credencial.

Para desarrollo o build local con API:

```bash
source infra/outputs.env
export VITE_API_URL="$API_URL"
npm run dev --prefix web
```

CORS de producción admite solo CF_URL; desde localhost las llamadas pueden
ser bloqueadas por el navegador y se verá la plantilla. No ampliar CORS de
producción para una prueba local. El build final sí usará el origen permitido.

Verificación T11 tras el deploy final: usar la sugerencia de 25% O₂, 0.5 atm
y Nomex; comprobar escenario actualizado, chips editables, frases con fuentes
y fallback al bloquear la API. Esperar al menos 20 s para comprobar timeout.
El texto por plantilla está identificado, nunca se presenta como IA en vivo.

## Problemas conocidos

- Sesión vencida: repetir aws login o aws sso login para el perfil prometeo.
- AccessDenied: revisar identidad y permisos; no cambiar de cuenta sin revisar outputs.
- CloudFront recién creado: puede permanecer InProgress mientras propaga.
- DNS/TLS: en esta red el hostname virtual S3 devolvió un certificado ajeno.
  Los scripts usan el endpoint regional oficial S3 con validación TLS activa.
  Nunca usar --no-verify-ssl. Si ocurre en otro endpoint, revisar la red/DNS.
- Si la nueva web falla, identificar un commit conocido y desplegar su build
  desde un checkout separado; no hacer reset destructivo del trabajo del equipo.

## T10 disponible: desplegar o actualizar API

T10 ya está implementada. Preparar Python 3.12 y api/.venv como indica
api/README.md; luego ejecutar `bash infra/20_api.sh`. Se empaquetan wheels Linux
arm64, handler, verificador y pack. El script reutiliza rol, Lambda y Gateway,
actualiza código/configuración y guarda API_ID, API_URL, FUNCTION_ARN y
API_ROLE_ARN en outputs.env. No publica la web.

Permisos de ejecución Lambda: AWSLambdaBasicExecutionRole y bedrock:InvokeModel
sobre el perfil confirmado y sus ARNs de modelos destino, sin wildcard en esa
política. Gateway tiene CORS solo CF_URL y throttle 5 rps / ráfaga 10.
El usuario que ejecuta el script necesita administrar esos recursos y PassRole
sobre el rol concreto. No compartir las credenciales de esa persona.

```bash
bash infra/20_api.sh
source infra/outputs.env
curl -sS "$API_URL/ask" -H 'content-type: application/json' -d @api/events/ask.json
curl -sS "$API_URL/analysis" -H 'content-type: application/json' -d @api/events/analysis.json
```

Verificado el 2026-11-14: /ask HTTP 200 en 7.876 s; /analysis HTTP 200 en
0.904 s, mode=ai y fuentes reales. Falta T11 en la web pública. El primer
intento de T10 se interrumpió al leer una política vacía; se corrigió y la
reejecución reutilizó los recursos creados sin duplicación.
