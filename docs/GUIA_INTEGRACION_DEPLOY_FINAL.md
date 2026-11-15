# Entrega del bloque C e integración para el despliegue final

Estado al 15 de noviembre de 2026. Leer junto con `PROGRESS.md`,
`PLAN_FASE2.md` y `CONTRATOS_FASE2.md` §5. El contrato del bloque C sigue
pendiente de aprobación humana; esta guía no lo aprueba.

## 1. Qué está listo y qué falta

T31 está hecha y comprobada con dos ejecuciones reales de `infra/30_data.sh`.
En la cuenta `352818909129`, región `us-east-1`, existen:

| Recurso | Identificador |
|---|---|
| DynamoDB | `prometeo-hack-data` (PK/SK, bajo demanda) |
| S3 privado del corpus | `prometeo-hack-corpus-352818909129` |
| SQS y DLQ | `prometeo-hack-ingest`, `prometeo-hack-ingest-dlq` |
| Cognito user pool | `us-east-1_JP5FcOZMA` |
| Cliente público Cognito | `n509p2ooh8opklaphskhs68sc` |

La web y la API MVP también existen; sus salidas están en `infra/outputs.env`.
Crear estos recursos no conecta las cuentas, cargas y procesamiento con la app.
Faltan backend C, worker, permisos de ejecución, rutas protegidas, pantallas y
pruebas del recorrido completo. Por ello, la arquitectura completa aún no está
lista para el despliegue final.

## 2. Responsabilidades y orden de entrega

| Responsable | Entrega | Condición de aceptación |
|---|---|---|
| Dueño/revisor, T30/D3 | Aprobar contrato §5, límites de MB/páginas/documentos y revisar costos | Decisión explícita en `PROGRESS.md`; 20 MB/60 páginas/30 documentos siguen siendo propuesta |
| Revisor de datos, T32/D7 | Resolver discrepancias de mapping y soporte semántico/alcance de citas PDF | Evidencia en `T32_EVALUACION.md`; conservar rechazos y fuente original |
| Backend, T33 | Cognito, identidad validada, proyectos, tickets de carga y finalización de carga | Usuarios A/B aislados; identidad tomada del token, proyecto ajeno 404 |
| Backend, T34 | Worker SQS, ejecución de etapas, estados y reanudación | Lote de 10 documentos; corrupto termina en DLQ y el resto continúa |
| Backend + interfaz, T35 | Revisión versionada y aprobación explícita del esquema | Editar/fusionar variables y verificar efecto; versión vieja devuelve 409 |
| Backend + interfaz, T36 | Correcciones, conflictos, claims y originales PDF | Original, cita, autor y razón conservados; PDF abre en la página citada |
| Backend + interfaz, T37 | Publicación de pack/lens/mapping y síntesis citada | Pack válido, mismo motor y segundo dominio elegido en D10 |
| Interfaz, T21–T29 | Pantallas del bloque B sobre motor y estado local existentes | Pruebas, build, accesibilidad y revisión visual; decisiones ML D4 documentadas |
| Dueño | Integrar entrega aprobada y ejecutar despliegue final | Evidencia local y AWS; revisión privada/móvil del recorrido completo |

El equipo de interfaz trabaja en `frontend`; ese equipo realiza su integración
con `main`. Motor, contratos, API, pipeline e infraestructura se desarrollan en
`main`. Coordinar archivos compartidos; no sobrescribir cambios del otro equipo.
CU-03 tiene rutas de gestión en §5.3: asignar su implementación explícitamente
en T33. CU-09 (ampliar una base ya publicada) permanece posterior.

## 3. Implementación del backend y worker

Usar tipos de `web/src/contracts/backend.ts`, ejemplos de
`docs/fixtures/fase2/` y endpoints de `CONTRATOS_FASE2.md` §5.3–5.8.
Los fixtures permiten construir pantallas, pero no demuestran integración real.

- Validar tokens Cognito y obtener `uid` del `sub` verificado. Todas las
  operaciones, incluidas URLs prefirmadas, comprueban pertenencia del proyecto.
- Mantener DynamoDB PK/SK y prefijos privados S3 de §5.9; no hacer público el
  bucket del corpus. Comprobar tamaño/tipo/hash y límites aprobados en servidor.
- Reutilizar T32 para lectura, perfilado, propuesta, revisión, extracción y
  verificación. Conservar hashes/versiones, citas, alcance, rechazos y caché.
  Una respuesta del modelo no equivale a aprobación humana.
- Adaptar el flujo local al worker: dependencias Python 3.12, SDK oficial
  `AnthropicBedrock`, Poppler para PDF y almacenamiento persistente de progreso.
  Documentar empaquetado compatible con el runtime y la arquitectura elegidos.
- Mantener modelo desde `MODEL_ID` de `infra/config.env`: Haiku 4.5 aprobado
  en D6. La ejecución se autentica con roles de AWS; no empaquetar credenciales.
- Implementar idempotencia, reintentos, DLQ y seguimiento por documento.
  Verificar la relación entre timeout de Lambda, visibilidad SQS y reintentos
  antes de activar el consumidor; no asumir que 960 s ya resuelve esa relación.
- Agregar mediante scripts idempotentes las rutas, validación de identidad,
  permisos de API/worker y asociación SQS-Lambda. Acotar permisos a los ARN y
  prefijos necesarios. Documentar cada cambio y sus outputs.

El avance T33 ya dispone de `infra/deploy_projects.py` para preparar/aplicar
configuración de proyectos sobre la API existente; su alcance y requisitos
están en `T33_API_PROYECTOS.md`. Aún falta probarlo en AWS y terminar sesiones,
cargas y worker; no equivale al despliegue completo descrito abajo.

**Entregable indispensable:** un comando reproducible para desplegar backend C
y worker, con preflight, dependencias, variables, orden y comprobaciones. Hoy
no hay un script específico completo para ese despliegue. Su nombre y comando
deben incorporarse aquí antes de entregar al dueño; no crear recursos a mano.
El permiso SSO `Prometeo-T31` sirvió para T31; verificar permisos adicionales
de despliegue de API/worker con el administrador, sin conceder acceso general.

## 4. Integración de interfaz

- Consumir funciones de `web/src/engine/` y estado local de
  `web/src/contracts/workspace.ts`; no recalcular ranking/niveles en componentes.
- Implementar registro/sesión, lista de proyectos, carga/progreso, revisión,
  correcciones y apertura de originales contra los endpoints aprobados.
- Gestionar 401, 404, 409, límites, fallos de modelo y estados por documento
  según §5.1. Mostrar errores/reanudación y conservar borradores del usuario.
- Cargar el pack publicado del proyecto con su `pack_version` y `lens_version`.
  Cambiar intención regenera lente sin repetir extracción, conforme al contrato.
- Mantener UI en inglés y procedencia visible; mostrar síntesis solo tras
  validación. Los candidatos PDF pendientes no entran como valores aprobados.
- Entregar instrucciones para configurar Cognito y API en desarrollo/build,
  pruebas de integración y revisión de navegador privado y móvil.

## 5. Configuración compartida y privada

| Dónde | Contenido |
|---|---|
| `infra/config.env` (Git) | `PROJECT`, región y `MODEL_ID` aprobado |
| `infra/outputs.env` (Git) | IDs, ARNs y URLs de recursos, incluido cliente público Cognito |
| Perfil local AWS `prometeo` | Sesión SSO de cada persona; nunca se copia al repo |
| Variables de Lambda | Nombres/ARNs de tabla, bucket, colas y modelo, definidos por el script de despliegue |
| Configuración de web | URL API, región y configuración pública Cognito; documentar nombres exactos al implementar |

El script web actual exporta `VITE_API_URL` desde `API_URL`. Todavía no existen
variables de build Cognito implementadas: quien integre autenticación debe
añadirlas al script y documentar un ejemplo sin secretos. Toda variable `VITE_`
es visible en el bundle. No poner contraseñas, claves AWS, refresh tokens ni
secretos de cliente en `.env` versionados o en variables `VITE_`.

## 6. Guion del dueño para el despliegue final

Antes: T30/D3 y revisión de datos aprobadas, rama de interfaz integrada por su
equipo, backend/worker terminados y comandos de despliegue entregados. Registrar
el commit candidato y el último commit desplegado recuperable.

Desde la raíz, con el árbol revisado (la descarga local PSI permanece fuera de Git):

```bash
git status --short --branch
git pull --rebase
git log -1 --oneline
npm ci --prefix web
npm test --prefix web
npm run build --prefix web
api/.venv/bin/python -m pytest api/ -q
python3.12 -I pipeline/test_ingest.py
python3.12 -I pipeline/test_review_extract.py
python3.12 -I pipeline/test_ingest_run.py
python3.12 -I pipeline/validate_pack.py
bash scripts/check_agnostic.sh
git diff --check
```

Crear previamente el entorno Python 3.12 e instalar
`api/requirements-dev.txt` si la laptop no tiene `api/.venv`.
Ejecutar además las pruebas nuevas que entregue T33–T37. Corregir cualquier fallo
antes de publicar; no regenerar el pack publicado con datos sin revisión.

```bash
export AWS_PROFILE=prometeo
aws sso login --profile prometeo
source infra/config.env
source infra/outputs.env
aws sts get-caller-identity --no-cli-pager
```

Confirmar cuenta `352818909129` y rol esperado. Después, en este orden:

1. Comprobar T31 con `bash infra/30_data.sh`; revisar cualquier diff de outputs.
2. Ejecutar el **comando aún por entregar** de despliegue backend C/worker,
   con sus verificaciones de permisos/rutas/consumidor. Este paso bloquea el
   despliegue final de la arquitectura mientras no esté implementado.
3. Si cambió la API MVP, ejecutar `bash infra/20_api.sh`. Revisar su composición
   con el nuevo despliegue para no sobrescribir rutas, variables o permisos C.
4. Comprobar backend real y aislamiento A/B antes de publicar pantallas.
5. Publicar la web con `bash infra/deploy_web.sh` y esperar distribución
   `Deployed` e invalidación completada antes de verificar en navegador.

Los scripts existentes publican el MVP; ejecutar solo `20_api.sh` y
`deploy_web.sh` todavía no despliega el bloque C completo.

## 7. Evidencia de aceptación y recuperación

- Dos usuarios reales de prueba: A no puede leer/editar proyectos, archivos ni
  URLs de B. Sesión vencida y acceso sin token fallan según contrato.
- Subir CSV/PDF reales, probar límites, observar progreso y reanudar sin
  duplicar llamadas exitosas. Documento corrupto aislado en DLQ.
- Aprobar una versión concreta; editar esquema/fuentes invalida resultados o
  aprobaciones anteriores según hashes. Publicar sin aprobación devuelve error.
- Verificar corrección con original/autor/razón, conflicto, PDF/página y síntesis
  con citas. Publicar pack válido, abrirlo y repetir con segundo dominio D10.
- Repetir `/ask` y `/analysis` del MVP y probar UI privada/móvil. Registrar
  códigos HTTP, respuestas relevantes, capturas, versión desplegada y límites.
- Entregar reversión probada del frontend y de API/worker antes del despliegue:
  conservar versiones previas y documentar cómo desactivar el consumidor SQS
  si falla. No borrar bucket, tabla, pool ni colas para volver al código previo.

Actualizar `PROGRESS.md` solo con resultados observados; conservar tareas
pendientes cuando falte aprobación o una prueba real. Commit/push con archivos
explícitos, sin corpus local, PDFs, artefactos extraídos ni credenciales.
