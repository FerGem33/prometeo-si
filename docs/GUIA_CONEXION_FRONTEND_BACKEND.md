# Guía de conexión del frontend con el backend de Prometeo

Fecha de referencia: 15 de noviembre de 2026. Dirigida al equipo de interfaz.

El backend del MVP está desplegado y tiene comprobaciones reales registradas. Esta guía explica cómo consumirlo desde React/Vite; no implica que las pantallas ya estén conectadas. No hace falta crear otra API, otro pool de Cognito ni recursos AWS. La integración de pantallas corresponde a frontend. Infraestructura interviene para autorizar un origen de desarrollo, diagnosticar servicios y publicar la web cuando se cumpla la revisión requerida.

## 1. Documentación y código que deben tener abiertos

| Referencia | Para qué sirve |
|---|---|
| [Entrega final del backend](BACKEND_INTEGRACION_FINAL.md) | Configuración desplegada, extensiones PDF, operación y evidencia real |
| [Contratos de fase 2, §4 y §5](CONTRATOS_FASE2.md) | Preguntas/análisis y recorrido completo del bloque C |
| [Tipos del backend](../web/src/contracts/backend.ts) | `Project`, `UploadTicket`, `SchemaEdit`, `CorpusMetadata`, `RecordDraft`, `PublishResponse`, PDF y síntesis |
| [Cliente y validadores actuales de preguntas/análisis](../web/src/report/api.ts) | `parseAsk`, `parseAnalysis`, transporte público existente |
| [Motor](../web/src/engine/index.ts) | `assess`, `diffAssessment`, `graph`, `partLevels` y exportación de datos |
| [Contexto React de datos](../web/src/components/ctx.tsx) | La vista recibe conjuntamente `pack`, `lens` y `mapping` |
| [Referencia Cognito](../tools/cognito/README.md) y [cliente SRP](../tools/cognito/client.mjs) | Registro, confirmación y login comprobados; no es un cliente web ya integrado |
| [Fixtures de pantallas](fixtures/fase2/README.md) | Datos reales de la demo para desarrollar sin red; IDs/fechas son ilustrativos |
| [Prueba integral del backend](../api/check_backend_live.py) y [recibo AWS](backend-smoke-2026-11-15.json) | Ejemplos del recorrido ejecutado y resultados sin tokens |
| [Estado y restricciones de despliegue](../PROGRESS.md) | Pendientes reales y revisión antes de publicar |

Hay comentarios históricos como «PROPOSAL, not deployed» en el archivo de tipos y textos antiguos en algunos README. No describen el cierre actual: el contrato desplegado se detalla en la entrega final. Los fixtures no son IDs válidos del servidor. Ante una discrepancia de forma, contrastar con [el router](../api/projects.py), los servicios enlazados en esta guía y sus pruebas; no inventar campos para compensarla.

## 2. Configuración pública del frontend

| Variable propuesta para Vite | Valor de este entorno |
|---|---|
| `VITE_API_URL` | `https://ve5oqmsyie.execute-api.us-east-1.amazonaws.com` |
| `VITE_COGNITO_REGION` | `us-east-1` |
| `VITE_COGNITO_USER_POOL_ID` | `us-east-1_JP5FcOZMA` |
| `VITE_COGNITO_CLIENT_ID` | `n509p2ooh8opklaphskhs68sc` |
| Web pública autorizada | `https://dursf4nho4zl6.cloudfront.net` |

`VITE_API_URL` ya se usa en el proyecto; los otros nombres son una propuesta de configuración para el adaptador de sesión que implemente frontend. Los valores se pueden cotejar con `infra/outputs.env`. Vite incorpora la configuración al compilar: después de cambiarla, reiniciar desarrollo o reconstruir.

Estos identificadores son públicos. No poner claves AWS, perfiles SSO, contraseñas, tokens ni secretos de cliente en `VITE_*`. El navegador habla con Cognito, la API y las URLs firmadas de S3; no necesita acceso IAM ni llamar directamente a Bedrock, DynamoDB o SQS.

### Desarrollo local y CORS

**Aplicado en AWS el 15-nov-2026:** API Gateway, Lambda y bucket de corpus permiten CloudFront, `http://localhost:5173` y `http://127.0.0.1:5173`. No hace falta pedir otra habilitación para esos dos orígenes. [Recibo de comprobación](cors-local-5173-2026-11-15.json): configuración leída de AWS, 11 preflight HTTP correctos y 3 solicitudes anónimas que siguen recibiendo `401` con CORS. Las 42 rutas de proyectos conservan JWT. Esto no sustituye probar login y una carga real desde el navegador.

Para arrancar la web desde la raíz, con las dependencias ya instaladas:

```bash
VITE_API_URL=https://ve5oqmsyie.execute-api.us-east-1.amazonaws.com \
  npm run dev --prefix web -- --host 127.0.0.1 --port 5173 --strictPort
```

Abrir `http://127.0.0.1:5173`. `--strictPort` evita que Vite cambie a otro puerto no autorizado. Si se quiere abrir por `http://localhost:5173`, arrancar con `--host localhost` en lugar de `127.0.0.1`. El CORS permite conectar; las pantallas y el adaptador Cognito descritos más adelante todavía deben integrarse.

CloudFront sigue siendo el origen por defecto de los scripts. Los dos hosts locales son distintos; otro puerto, HTTPS local o una IP de la red necesitan autorización adicional. Para otro origen, entregar a infraestructura su URL exacta. Para reproducir la configuración aplicada, el operador puede ejecutar el comando documentado en [la entrega final](BACKEND_INTEGRACION_FINAL.md), con su sesión AWS:

```bash
EXTRA_ORIGINS=http://localhost:5173,http://127.0.0.1:5173 \
api/.venv/bin/python -I infra/deploy_projects.py \
  --output-dir /tmp/prometeo-projects-local --uploads --schema --originals --evidence \
  --apply --contract-approved
```

Este ajuste coordina CORS de API/Lambda y GET/PUT del bucket y permanece aplicado en AWS; no depende de dejar abierta la terminal del operador. Requiere el entorno del operador descrito en la entrega final; no es un comando de arranque para frontend. No usar `mode: "no-cors"`, extensiones del navegador ni comodines. Un `curl` exitoso no demuestra que el recorrido completo funcione en el navegador.

**Para conservar la configuración:** pasar `EXTRA_ORIGINS` en los siguientes despliegues de API/proyectos. `deploy_projects.py` sin esa variable restablece API, Lambda y bucket a CloudFront. `infra/20_api.sh` sin ella restablece API/Lambda, pero no actualiza CORS del bucket. No dejar ambos lados desalineados. Para retirar deliberadamente los orígenes locales, ejecutar el mismo comando de proyectos sin `EXTRA_ORIGINS`. El navegador puede conservar preflight durante 300 s; tras un cambio, esperar ese plazo si sigue mostrando el resultado anterior.

## 3. Autenticación: Cognito, antes de llamar a `/projects`

El cliente es público, sin secreto, y usa `USER_SRP_AUTH`. La autenticación se hace con Cognito, no con una ruta `/login` de esta API. Para una interfaz propia, AWS documenta los [flujos de autenticación](https://docs.aws.amazon.com/cognito/latest/developerguide/authentication-implement.html) y el uso de [clientes de aplicación](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-client-apps.html).

Secuencia que debe implementar la interfaz:

1. Registrar correo y contraseña; Cognito aplica su política de contraseña.
2. Confirmar el correo con el código recibido. No transferir un alias de otra cuenta.
3. Iniciar sesión mediante una biblioteca con SRP; no implementar el algoritmo criptográfico a mano.
4. Completar el desafío que devuelva el SDK antes de considerar abierta la sesión.
5. Obtener el **ID token** y enviarlo en cada llamada privada:

   ```http
   Authorization: Bearer <ID token>
   ```

6. Renovar la sesión mediante el SDK cuando corresponda. Si no puede renovarse, volver a login. Al salir o cambiar de usuario, limpiar sesión, datos privados y solicitudes pendientes.

El backend valida `sub`, `iss`, `aud`, `token_use: "id"` y expiración. No enviar el access token, refresh token, un `user_id` elegido por el navegador ni credenciales AWS para sustituirlo. Un recurso ajeno devuelve `404` para no revelar su existencia.

Referencia del repositorio: `tools/cognito/client.mjs` usa `amazon-cognito-identity-js` 6.3.22 con almacenamiento aislado en memoria. Sus métodos son `register(email,password)`, `confirm(email,code)`, `login(email,password)` y `clear()`. `login` devuelve el ID token; la CLI detecta desafíos pero no contiene sus pantallas ni renovación de sesión. `clear()` limpia memoria local y no equivale a revocación global.

Frontend debe implementar sus estados de registro, confirmación, sesión, recuperación de contraseña y los desafíos que soporte. Conservar tokens en memoria, sin persistirlos en localStorage, URLs, registros de consola ni recibos. Si se elige Amplify para el cliente web, se puede conectar al [pool existente sin desplegar infraestructura Amplify](https://docs.amplify.aws/react/frontend/connect-to-existing-resources/); configurar explícitamente [almacenamiento en memoria mediante su proveedor de tokens](https://docs.amplify.aws/react/build-a-backend/auth/concepts/tokens-and-credentials/) y manejar los [pasos adicionales del login](https://docs.amplify.aws/react/frontend/auth/sign-in/). No usar su configuración de almacenamiento por defecto sin revisarla. La elección de ID token para esta API viene del contrato de Prometeo y su validación actual; no intercambiar tipos de token al copiar ejemplos genéricos del SDK.

Para comprobar Cognito por separado de la UI, usar la CLI interactiva del repo:

```bash
npm ci --prefix tools/cognito --ignore-scripts
source infra/config.env
source infra/outputs.env
node tools/cognito/cli.mjs register
node tools/cognito/cli.mjs confirm
node tools/cognito/cli.mjs login
```

Usar un correo propio accesible. Estos comandos contactan Cognito; no sustituyen las pantallas. No pedir al operador que comparta contraseñas o tokens con el equipo.

## 4. Transporte HTTP y validación

El helper actual `postApi` está pensado para las rutas públicas de la demo: no añade JWT. Crear un adaptador privado que obtenga el ID token vigente mediante la capa de sesión. Ejemplo de transporte, para adaptar dentro de `web/src/`:

```typescript
type PrivateRequest = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  idempotencyKey?: string;
};

export async function privateRequest(
  path: string,
  idToken: string,
  options: PrivateRequest = {},
): Promise<unknown> {
  const base = import.meta.env.VITE_API_URL as string | undefined;
  if (!base || !path.startsWith("/projects")) {
    throw new Error("Invalid private API configuration");
  }
  const headers = new Headers({ Authorization: `Bearer ${idToken}` });
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (options.idempotencyKey) {
    headers.set("Idempotency-Key", options.idempotencyKey);
  }
  const response = await fetch(`${base.replace(/\/$/, "")}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
    cache: "no-store",
  });
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try { payload = JSON.parse(text) as unknown; }
    catch { payload = null; }
  }
  if (!response.ok) {
    throw Object.assign(new Error(`HTTP ${response.status}`), {
      status: response.status,
      payload,
    });
  }
  if (response.status === 204) return undefined;
  if (payload === null) throw new Error("Invalid JSON response");
  return payload;
}
```

El transporte devuelve `unknown` deliberadamente: **los tipos TypeScript no validan JSON recibido**. Añadir validadores de cada recurso antes de usarlo en estado o renderizarlo. Reutilizar `parseAsk` y `parseAnalysis` donde su contrato coincida. No resolver una respuesta desconocida con un simple `as Project` o `as Pack`.

Reglas comunes:

- Codificar cada ID con `encodeURIComponent`, especialmente los registros, cuyos IDs pueden contener caracteres reservados. No modificar su contenido ni asumir su formato.
- Paginar hasta que `next_cursor === null`; enviar el cursor opaco con `URLSearchParams`. No tomar la primera página como corpus completo. `/jobs` tiene forma propia, no `Page<T>`.
- Los cuerpos privados pasan por un límite de **16 000 bytes UTF-8** en `api/projects.py`; comprobar `new TextEncoder().encode(JSON.stringify(body)).length`. Dividir ediciones de esquema en lotes y actualizar la versión tras cada respuesta. Evitar adjuntar el pack entero a una petición de análisis.
- Para crear un proyecto o reservar un documento, generar una `Idempotency-Key` por operación y conservarla en el reintento de esa misma operación. No reutilizarla con otro cuerpo. No asumir que repetir cualquier PATCH con una versión vieja funciona: puede devolver `409`.
- Cancelar peticiones al cambiar proyecto, usuario o escenario; ignorar respuestas obsoletas. No cachear respuestas privadas, tokens ni URLs firmadas en un service worker.
- Los errores del servicio suelen ser `{error:{code,message,details?}}`. Gateway puede rechazar un JWT antes de Lambda y devolver otro cuerpo; conservar el HTTP status y tolerar JSON o texto inesperado.

## 5. Recorrido de pantallas y rutas

En las tablas siguientes, `P` significa `/projects/{project_id}`; sustituirlo por el ID real devuelto por la API. No hay un prefijo `/api` ni `/prod` adicional en este entorno.

### 5.1 Proyectos

| Acción | Petición | Respuesta esperada |
|---|---|---|
| Crear | `POST /projects`, `{name,intent}` | `201 Project` |
| Listar | `GET /projects?limit=20` | `Page<Project>` |
| Abrir | `GET P` | `Project` |
| Editar | `PATCH P`, `{name?,intent?}` | `Project` |
| Borrar | `DELETE P` | `204`, acción destructiva explícita de la persona |

`name` es texto no vacío de hasta 200 caracteres; `intent`, hasta 4000. La intención orienta la lente, no constituye evidencia ni aprobación de datos. En un proyecto publicado, cambiar intención regenera la lente sin reextraer ni cambiar los bytes del pack. Recargar después `GET P/pack` y el conjunto de archivos; no conservar la lente anterior en la vista.

### 5.2 Carga: reservar todo, subir bytes y confirmar

Orden obligatorio para un lote:

1. Crear proyecto en `draft` y seleccionar los archivos.
2. **Reservar todos los documentos antes de completar el primero.** Las reservas nuevas solo se aceptan en `draft`; confirmar la primera carga puede pasar el proyecto a `processing`. Reservar secuencialmente evita conflictos entre revisiones concurrentes.
3. Por cada archivo, `POST P/documents` con `{name:file.name, media_type, bytes:file.size}`. Tipos admitidos: `text/csv` o `application/pdf`. No confiar solo en `file.type`, que puede venir vacío; validar la selección y el tipo que se enviará.
4. Validar el `UploadTicket` y hacer PUT directo a `ticket.upload.url`, enviando el archivo binario y **exactamente** `ticket.upload.headers`. No usar JSON, FormData ni añadir JWT a S3. Hoy incluye `content-type` e `if-none-match: *`; no quitarlos. El navegador calcula Content-Length a partir del cuerpo.
5. Calcular SHA-256 de esos mismos bytes y `POST P/documents/{doc_id}/complete` con `{sha256}`.
6. Consultar documentos/jobs para ver parsing, propuesta y errores. Un PUT exitoso solo acredita transferencia; `complete` tampoco demuestra extracción correcta ni aprobación científica.

Fragmentos para los pasos 4–5, después de validar el ticket:

```typescript
import type { UploadTicket } from "./contracts/backend";

async function putOriginal(file: File, ticket: UploadTicket): Promise<void> {
  const result = await fetch(ticket.upload.url, {
    method: ticket.upload.method,
    headers: ticket.upload.headers,
    body: file,
  });
  if (!result.ok) throw new Error(`Upload HTTP ${result.status}`);
}

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
```

Límites aprobados: 20 000 000 bytes/archivo, 60 páginas/PDF, 30 documentos/proyecto. Las URLs de carga duran 300 segundos. Presentar el límite que devuelva el servidor en `error.details`; no interpretarlo como un fallo de login.

Si el PUT falla por CORS, revisar también CORS de S3. Si vence el ticket mientras sigue `draft`, se puede repetir la reserva con la misma clave y cuerpo para obtener otro ticket. Si ya pudo subirse, no repetir el PUT sin comprobar el estado: `if-none-match: *` impide sobrescribir y puede devolver `412`. Verificar/confirmar la carga existente o diagnosticar el documento, sin omitir el SHA ni reemplazar el original.

CU-09 —añadir nuevos documentos a una base ya publicada— sigue fuera del cierre actual. No ofrecerlo como una acción operativa.

### 5.3 Progreso y recuperación

| Ruta | Uso |
|---|---|
| `GET P/documents` | `Page<ProjectDocument>`, estado y errores por archivo |
| `GET P/jobs` | `{project_status,jobs,totals}`; consultar cada 3 s durante procesamiento |
| `POST P/ingest/resume`, `{}` o `{doc_ids:[...]}` | Reanudar pendientes/fallidos; preferir reintento selectivo |
| `GET P/diagnostics` | Motivos/uso sin texto crudo por defecto |
| `GET P/diagnostics?doc_id=…&response=…` | Inspección explícita de una respuesta propia; tratarla como contenido privado |
| `GET P/documents/{doc_id}/text?page=…` | Texto de una página física PDF para cotejar citas |
| `GET P/documents/{doc_id}/text?cursor=…&limit=50` | Filas parseadas de una tabla; máximo 50 por página |
| `POST P/documents/{doc_id}/proposal`, `{proposal,reason}` | Recuperación manual revisada; conserva rechazo original y queda propuesta |

Etapas: `upload`, `parse`, `profile`, `propose`, `extract`, `verify`. Estados de trabajo: `queued`, `running`, `done`, `failed`, `skipped`. El polling no debe bloquear la navegación ni seguir después de salir de la pantalla. Para los lotes PDF, consultar también `/paper-candidates`: `/jobs` no describe por sí solo todas las selecciones PDF.

`no_text_layer` requiere una fuente legible o tratamiento explícito; el backend no promete OCR. Un duplicado puede aparecer `skipped/duplicate`. No reanudar automáticamente todos los fallidos en bucle ni reproducir la DLQ desde frontend. Si todo permanece en cola, escalar con IDs/horas/estados para comprobar el worker; no es necesario compartir tokens.

### 5.4 Revisión de esquema y aprobación

1. `GET P/schema` devuelve `SchemaProposal`: versión, variables, columnas y constantes.
2. Mostrar evidencia, muestras literales, unidades, conversiones y estados. La persona decide; no aprobar por defecto toda propuesta del modelo.
3. `PATCH P/schema` con `{version:schema.version, edits:[...]}`. Cada respuesta es la nueva referencia de versión. En `409`, recargar y revisar; no sobrescribir silenciosamente.
4. Aprobar con `POST P/schema/approve` usando la versión vigente y los metadatos revisados. Después esperar la extracción y verificación.

Ejemplo de cuerpo de edición construido con objetos que ya devolvió el servidor:

```typescript
const body = {
  version: schema.version,
  edits: [{
    op: "set_status",
    target: "column",
    id: column.column,
    doc_id: column.doc_id,
    status: reviewedStatus,
    note: reviewReason,
  }],
};
```

La columna se identifica por su nombre literal en `id`, junto con `doc_id`. Operaciones disponibles: `add_variable`, `set_status`, `rename`, `merge`, `set_unit`, `set_convert`, `map_column`, `set_role`, `set_sigma`; sus campos exactos están en `SchemaEdit`. No debe quedar ninguna variable/columna en `proposed`; a lo sumo una variable tiene rol `partition`.

**No omitir los metadatos de publicación.** Aprobar solo `{version}` no prepara por sí mismo una publicación utilizable. El cuerpo completo admite:

```typescript
import type { SchemaApprovalRequest } from "./contracts/backend";

const approval: SchemaApprovalRequest = {
  version: schema.version,
  metadata: reviewedMetadata,
  review_authority: reviewAuthority,
};
```

`reviewedMetadata` debe cumplir `CorpusMetadata`: `id`, `documents`, `lens`, `thresholds`. Para cada documento incluye SHA-256 real, estudio, título, DOI, tipo test/campaign, motivo y cita `kind_evidence`; la lente contiene títulos, presets respaldados y ejes compatibles. Los valores y umbrales requieren revisión: no copiar los de combustión para otro dominio ni fabricar DOI/presets para pasar el validador. El servidor liga la aprobación a actor, fecha y hashes. Ejemplo ejecutado de construcción: [check_evidence_live.py, líneas 152–221](../api/check_evidence_live.py#L152), desde la lectura de esquema hasta el envío de aprobación; criterio del segundo dominio en [la revisión local versionada](t37/revision_local.json) y sus hashes en [el manifiesto](t37/manifest_ebullicion.csv). El ejemplo usa IDs de documentos y bytes del proyecto de prueba: construir los equivalentes del proyecto de la persona, no copiar sus IDs.

`review_authority` es opcional; si se envía, admite de 1 a 1000 caracteres. Es una declaración auditada, no una certificación experta. Las delegaciones concretas registradas no autorizan aprobar cualquier corpus nuevo. La publicación exige los metadatos revisados; si se omitieron, volver al flujo de revisión con el operador, sin inventarlos en el cliente. Repetir approve de la misma aprobación permite reanudar extracción fallida; no concede una aprobación científica nueva ni incorpora metadatos nuevos a una aprobación ya guardada.

### 5.5 Registros, originales y conflictos

| Acción | Petición |
|---|---|
| Consultar filas | `GET P/records?variable=…&flag=…&doc_id=…&cursor=…&limit=100` |
| Corregir | `PATCH P/records/{rid}`, `{variable,value,reason}` |
| Excluir | `DELETE P/records/{rid}`, `{reason}`; responde `204` |
| Ver conflictos | `GET P/conflicts?status=open` |
| Resolver | `POST P/conflicts/{cid}/resolve`, `{choice,note?}` |
| Abrir original | `POST P/documents/{doc_id}/url`, `{}` o `{page:paginaFisica}` |

Valores numéricos de registros son rangos `[mínimo,máximo]`; una medición puntual usa ambos extremos iguales. Categorías son strings. No enviar un número escalar donde se exige rango. `choice` es un índice de candidatos devuelto por la API o `"keep_all"`/`"exclude"`.

Cada valor tiene `citations[variable]`. Las correcciones conservan original, actor, fecha y motivo: mostrar el valor actual junto al original y la corrección. La cita del original no prueba el valor corregido. Excluir conserva historial; no borra la fuente. Publicar requiere cero conflictos abiertos.

La URL del original es temporal y ya puede contener `#page=…`; usarla sin reconstruir la firma. No guardarla como enlace permanente: pedir otra al abrir. Una página PDF es la página física del archivo, no necesariamente la numeración impresa.

### 5.6 PDF contextual y declaraciones de autores

El PDF no completa automáticamente filas tabulares ni cambia niveles, distancias o rankings. Las citas literales verificadas todavía requieren revisión de significado y alcance.

| Petición bajo `P` | Cuerpo / resultado |
|---|---|
| `GET /paper-candidates` | `items`, `documents` por lote, `exclusions`, `failure_reviews`, `next_cursor` |
| `POST /papers/{doc_id}/extract` | `{}` reutiliza selección inicial; `{pages:[...]}` pide hasta 4 páginas físicas únicas; `202` |
| `POST /paper-candidates` | `{candidate,reason}`; campos exactos en `PaperCandidateInput` |
| `POST /paper-candidates/{cid}/review` | `{status:"contextual",reason,scope,supports_value:true}` o `{status:"rejected",reason}` |
| `POST /papers/{doc_id}/review` | `{reason}` excluye; `{status:"manual",artifact_sha256,reason}` acusa un lote fallido concreto |
| `GET /claims` | `Page<Claim>` |
| `POST /claims` | `{claim,reason}`; alta `201`, ver tipo `Claim` |
| `DELETE /claims/{cid}` | `{reason}`; `204`, conserva historial |

La selección inicial de hasta cuatro páginas **no es extracción exhaustiva**. Mostrar páginas/selecciones revisadas y pendientes. Publicar exige revisar candidatos y esperar/revisar los lotes vigentes o excluirlos explícitamente. El acuse de fallo está ligado al hash exacto; no cubre un lote nuevo.

En la vista, distinguir `pack.contextual_evidence` de `pack.records`, y las afirmaciones autorales `pack.claims` de los resultados del motor. Mostrar su cita y alcance. No llamar «medición validada» a una expectativa, explicación o hueco mencionado por los autores. El conjunto de 23 fuentes todavía no está aceptado científicamente en su totalidad.

### 5.7 Publicar y abrir el informe privado

1. `POST P/publish` con `{}` devuelve `PublishResponse`:

   ```typescript
   type PublishResponse = {
     pack_version: number;
     lens_version: number;
     files: { pack: string; lens: string; mapping: string };
     expires_in: number;
   };
   ```

2. Hacer GET directo a las tres URLs firmadas, sin cabecera JWT. Caducan a los 300 s.
3. Validar los tres JSON y comprobar su compatibilidad antes de cambiar el contexto React. Si una descarga falla, conservar el conjunto anterior o mostrar error; no mezclar pack nuevo con lens/mapping viejos.
4. Entregar conjuntamente `{pack,lens,mapping}` al contexto del informe y recalcular con el motor existente. Elegir un preset del nuevo lens y ejes de su esquema; reiniciar escenario, selecciones y solicitudes del proyecto anterior.
5. Para volver a abrir o renovar enlaces, `GET P/pack`. Si vencieron durante la descarga, solicitar un descriptor nuevo y descargar de nuevo el conjunto completo.

Publicar es privado al propietario autenticado; no crea un enlace público compartible. Repetir publicación sin cambios conserva versión. No modificar `web/public/demo` para abrir un proyecto privado, ni sustituir silenciosamente una descarga fallida por la demo.

Separar la opción de demo pública de proyectos autenticados. El motor recibe el mismo formato `prometeo.pack/1`; no necesita conocer el origen de los archivos. Las funciones de niveles, ranking, diferencias, grafo y partes viven en el motor, no se reimplementan en componentes ni adaptadores.

### 5.8 Variantes, lente y consultas del proyecto

| Acción | Petición bajo `P` |
|---|---|
| Guardar variante | `PUT /proposals/{pid}`, `{name,scenario}` |
| Listar/abrir/borrar | `GET /proposals`, `GET /proposals/{pid}`, `DELETE /proposals/{pid}` |
| Consultar lente | `GET /lens` → `{lens,lens_version,draft}` |
| Revisar lente | `PUT /lens`, `{version,lens,reason}` |
| Pregunta de condiciones | `POST /ask`, `{question}` o `{question,version:2}` |
| Análisis | `POST /analysis`, `{scenario,levels,findings}` |
| Síntesis de fuentes | `POST /synthesis`, `{study_ids,focus?}` |

Para una nueva propuesta, el cliente puede generar `crypto.randomUUID()` como ID: se admiten letras ASCII, números, `_` y `-`, de 1 a 128 caracteres. Guardar devuelve las versiones pack/lens de referencia. Las variantes remotas no son los proyectos locales guardados en el navegador: identificar explícitamente dónde se guarda cada cosa. No prometer historial de resultados ni comparación automática entre versiones de la base.

En PUT `/lens`, enviar `version` igual a **`lens_version` vigente**, no a `schema.version` ni a `pack_version`. La respuesta de PUT anuncia un borrador; publicar lo aplica. Ante conflicto, recargar lente/proyecto y revisar antes de reenviar.

Para `/analysis`, construir los hechos con `assess(pack,lens,scenario)` del conjunto privado cargado. El servidor los coteja contra su pack; no enviar rankings/valores inventados ni hechos de la demo. Un cuerpo privado de más de 16 000 bytes debe ajustarse al contrato, sin truncar frases JSON ni inventar un resumen de hechos.

Para `/ask` privado **no enviar `schema`**: lo aporta el servidor. La respuesta sin `version` conserva `{values,active,filters}` o `{unsupported}`. La versión 2 agrega `notes`: el `parseAsk` actual exige claves exactas y todavía no acepta ese campo. Elegir inicialmente la respuesta sin versión o ampliar el validador v2 con pruebas; no conectar v2 al parser antiguo sin adaptación. Aplicar la respuesta únicamente al proyecto que originó la petición.

`/analysis` devuelve `{mode,sentences:[{finding,text,sources}],dropped}`. `/synthesis` devuelve citas estructuradas y puede incluir `represented_studies`, `omitted_studies`, `fallback_reason` y `method`; no usar el parser de análisis para síntesis. Mostrar fuentes representadas y omitidas. La síntesis selecciona extractos originales: no es una predicción ni una certificación científica.

Si `mode === "template"`, mostrarlo como plantilla. Un error o timeout de inferencia tampoco autoriza presentar texto grabado como IA en vivo. Las rutas públicas `/ask` y `/analysis` siguen sirviendo a la demo; no usarlas para analizar datos de un proyecto privado.

## 6. Errores: respuesta que debe ofrecer la pantalla

| Situación | Tratamiento |
|---|---|
| `400 invalid_request` | Revisar campos, forma, tipos y tamaño UTF-8; mostrar motivo, sin reintento automático del mismo cuerpo |
| `401` | Renovar sesión con SDK si es posible; si falla, login y limpiar contenido privado |
| `404` | Recurso inexistente o ajeno; no filtrar información sobre otra cuenta |
| `409 conflict` | Recargar versión/estado y revisar cambios antes de reenviar |
| `413/422 limit_exceeded` | Mostrar `details.limit`, `details.value` y campo si existen |
| `429` | Esperar con backoff acotado; evitar polling o envíos paralelos intensivos |
| `502 model_unavailable` | Ofrecer reintento explícito y fallback identificado donde corresponda |
| `503 not_configured` | Informar a infraestructura; no corregirlo alterando permisos desde la UI |
| S3 `403` | Revisar vencimiento/firma/headers/origen; renovar descriptor según el estado |
| S3 `412` | El objeto ya existe: comprobar estado/hash y confirmación, sin sobrescribir |
| Error de red/CORS | Ver Network/preflight, origen y endpoint; no confundir con contraseña incorrecta |
| Parseo o cita rechazada | Mostrar diagnóstico y permitir revisión; no fabricar datos para cambiar a `done` |

No repetir una escritura destructiva por un fallo de red sin consultar el estado. Para comunicar una incidencia, entregar método, ruta sin firma, HTTP status, código de error, ID de proyecto/documento, origen y hora UTC. Omitir JWT, contraseñas, URLs firmadas y texto privado del corpus salvo inspección autorizada.

## 7. Checklist de aceptación de frontend

- [ ] Demo pública abre sin login y proyectos privados requieren sesión.
- [ ] Registro, confirmación, login, expiración y salida tienen estados visibles.
- [ ] A no puede abrir proyectos, documentos ni packs de B; respuesta ajena `404`.
- [ ] El lote reserva todos sus documentos antes del primer complete; bytes y SHA corresponden al original.
- [ ] Progreso/errores por archivo visibles; abandonar pantalla detiene polling.
- [ ] Revisión de esquema muestra citas, unidades y conversiones; `409` no pierde decisiones silenciosamente.
- [ ] Aprobación incluye fuentes/lente/umbrales revisados; no aprueba automáticamente todo el modelo.
- [ ] Correcciones muestran original, actor y motivo; exclusiones/conflictos quedan auditados.
- [ ] PDF contextual y claims se distinguen de mediciones tabulares, con páginas y alcance.
- [ ] Publicar y reabrir carga los tres archivos compatibles; vencimiento de URL es recuperable.
- [ ] El segundo dominio muestra sus propias etiquetas/presets; no aparecen frases de combustión fijadas en componentes.
- [ ] Variantes y preguntas usan el proyecto correcto; respuestas obsoletas no cambian otro proyecto.
- [ ] Plantilla e IA se distinguen; no se comunica predicción de ignición ni seguridad.
- [ ] Móvil, teclado, procedencia y exportación conservan contenido y citas.
- [ ] Una persona registra la revisión de §9.2/§9.3 en PROGRESS antes de publicar la web.

Pruebas locales desde la raíz:

```bash
npm test --prefix web
npm run build --prefix web
api/.venv/bin/python -m pytest api/ -q
npm test --prefix tools/cognito
bash scripts/check_agnostic.sh
```

Para las comprobaciones remotas A/B, usar los procedimientos interactivos de [tools/cognito](../tools/cognito/README.md) y [la entrega final](BACKEND_INTEGRACION_FINAL.md), con cuentas propias. Esas pruebas crean recursos/datos y algunas invocan IA facturable: no confundirlas con pruebas locales con dobles. La aceptación exige además recorrer las pantallas reales; los tests locales y los recibos previos del backend no demuestran por sí solos la conexión de la UI nueva.

## 8. Reparto de responsabilidad para cerrar

| Equipo | Entrega pendiente |
|---|---|
| Frontend | Adaptador Cognito/HTTP, pantallas y estados, validación de respuestas, consumo de pack privado y QA del recorrido |
| Responsable de datos | Revisión científica de fuentes/esquema, citas, alcance PDF, correcciones y criterios de lente |
| Infraestructura | Orígenes CORS identificados, diagnóstico operativo y despliegue web final tras revisión registrada; DNS/certificado solo si se solicita un hostname concreto |

No hace falta pedir nuevas claves AWS para conectar las pantallas. Si se detecta una incompatibilidad, documentar el endpoint, cuerpo sin secretos y respuesta antes de cambiar el contrato. Mantener el modelo D6 y los recursos existentes; esta guía no autoriza otra infraestructura ni una nueva publicación web.
