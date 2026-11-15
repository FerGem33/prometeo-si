# Instrucciones para agentes — Prometeo

Prometeo (NASA Space Apps 2026, reto *Flame in Freefall*) es un informe interactivo tipo artículo científico.
- **Qué hace:** sintetiza los datos de combustión de NASA PSI y evalúa un escenario contra la evidencia.
- **Cómo se desarrolla:** solo con agentes, en relevos entre laptops y cuentas distintas.
- **Tiempo:** 8 h en total. El trabajo que no está en git no existe.

## 1. Al empezar una sesión (siempre, en este orden)

1. `git pull --rebase`.
2. Lee este archivo completo.
3. Lee `PROGRESS.md`: estado, bloqueos, la última entrada de la bitácora y el "siguiente paso exacto".
4. Lee en `docs/PLAN.md` la tarea que toca:
   - si hay una tarea `en curso` con commit WIP, termínala primero;
   - si no, toma la primera `pendiente` en orden de ID cuyos prerrequisitos estén hechos.
5. Marca la tarea `en curso` en `PROGRESS.md`, con tu nombre o laptop. Commit y push de ese cambio.
6. Si usas AWS: `export AWS_PROFILE=prometeo` y `source infra/config.env`. Si existe, `source infra/outputs.env`.

## 2. Al terminar cada tarea

1. Ejecuta la **verificación** que define la tarea en `docs/PLAN.md`. Si no pasa, la tarea no está hecha.
2. Actualiza `PROGRESS.md`:
   - estado `hecha`, commit y nota breve;
   - "Siguiente paso exacto";
   - URL y `MODEL_ID` si cambiaron.
3. `git add -A && git commit -m "T0x: <qué>" && git push`.
   - **Nunca agregues coautoría ni firmas de agente al commit:** nada de `Co-Authored-By`, `Generated with`, ni menciones al agente o al modelo en el mensaje. El autor es la persona dueña de la laptop. Aplica también a descripciones de PR.
4. Sigue con la siguiente tarea. No pidas confirmación entre tareas salvo que haya un bloqueo real.

## 3. Si se va a acabar el uso de la cuenta o la sesión

- Commit inmediato `WIP T0x: <qué falta>` y push, aunque no compile. Deja la tarea `en curso`.
- Agrega una entrada en la bitácora de `PROGRESS.md`: qué hiciste, qué falta, el siguiente paso exacto y las trampas que encontraste.
- Nunca dejes cambios sin commit ni recursos de AWS creados a mano que no estén en un script.

## 4. Reloj y corte

- Anota la hora 0 en `PROGRESS.md` al empezar T00. Compara contra los tiempos de `docs/PLAN.md`.
- **A las 5:00 h se congela P0:**
  - se despliega lo que haya;
  - después solo se trabaja en P1, P2 o P3 si la versión desplegada sigue funcionando.
- Si una tarea pasa de 1.5× su tiempo, simplifica (recorta la función, no la calidad del dato) y anota el recorte en la nota de la tarea.
- Las tareas P2 y P3 se pueden marcar `omitida (corte)`. Las P0 no.

## 5. Reglas de producto (no negociables)

- **Prometeo compara condiciones; no predice llamas.**
  - Nunca escribas que algo "es seguro", "arde" o "no arde" como predicción.
  - Se dice "studied", "not studied", "near, not covered" o "scarce evidence".
- **Todo valor visible tiene procedencia** (archivo + fila o documento + página, y DOI). Si no hay fuente, no se muestra.
- **Los niveles, el ranking, los hallazgos y la ficha de ML los calcula el motor**, de forma determinista. La IA solo:
  - traduce preguntas a JSON validado (`/ask`);
  - redacta texto que pasa el verificador (`/analysis`).
- **Honestidad:** "Not studied" y "Scarce evidence" tienen el mismo peso visual que "Studied". Ningún nivel se comunica solo con color.
- **Prohibido presentar una respuesta grabada como IA en vivo.** Si la API falla, se muestra el texto por plantilla, marcado como tal.
- **Interfaz solo en inglés.** La documentación del equipo está en español.
- **Datos reales:** no inventes números ni datos de ejemplo. Los hallazgos conocidos sirven para verificar:
  - 0 de 268 pruebas de sólidos registran presión;
  - el O₂ máximo probado en sólidos es 22.2 % (BASS-II);
  - la base lunar del reto tiene 30 % O₂ a 10.2 psi.

## 6. Reglas de código

- **Motor** (`web/src/engine/`):
  - TypeScript puro, sin DOM, red ni dependencias;
  - **sin vocabulario de dominio** (`scripts/check_agnostic.sh` debe pasar);
  - todo lo específico entra por `pack`, `mapping` y `lens`.
- **Componentes:** sin textos del dominio escritos a mano. Títulos, etiquetas y presets salen de `lens` y `pack`.
- **Vectores de prueba:** `web/src/engine/golden.test.ts` usa datos reales. Si un vector falla, el motor está mal o el pack cambió. Investiga antes de tocar el vector, y si lo cambias, explica por qué en el commit.
- **Python:** 3.12. En `pipeline/` solo librería estándar. Ejecutar scripts que leen datos con `python3 -I`.
- **Bedrock:** SDK oficial `anthropic` (`AnthropicBedrock`) y modelo desde `MODEL_ID`. Nunca escribas el ID de modelo en el código. No inventes la API del SDK: consulta su documentación.
- **Modelo aprobado (D6, 15-nov):** todas las tareas futuras de API, pipeline, extracción y despliegue usarán `us.anthropic.claude-haiku-4-5-20251001-v1:0`, definido en `infra/config.env`. Conservarlo al actualizar SDK, prompts o infraestructura. No migrar a Haiku 5.5 ni a otro modelo sin una nueva instrucción explícita del dueño. La falta de acceso a 5.5 no es un bloqueo del proyecto.
- **Validación:** toda salida de la IA se valida contra el esquema antes de usarse. El texto del usuario va delimitado como dato.
- **Tareas pequeñas:** nada de refactors fuera de la tarea en curso.

## 7. Reglas de diseño (identidad "artículo")

- **Referencias visuales:** `estilos2/1_articulo.html` y `report/report.css`.
- **Tipografía:** EB Garamond (texto) + Fira Sans / Fira Sans Condensed (UI, figuras, tablas).
- **Colores:**
  - papel `#FDFCF9`;
  - tinta `#1D1C1A`;
  - acento único `#A3271B`;
  - nota A `#2F6A4E`;
  - nota B `#9A6B0F`.
- **Prohibido:** gradientes, glassmorphism, sombras, radios > 4 px, emojis, un segundo color de acento, tarjetas flotantes y hero de landing.
- **Estructura de artículo científico:** Key findings, Abstract, figuras numeradas con pie, tablas numeradas, Methods y References.
- **Contenido:** académico, sin simplificar. Lo amigable es la forma, no rebajar el contenido.

## 8. AWS

- Todo con AWS CLI, mediante scripts **idempotentes** en `infra/`: comprueban si el recurso existe antes de crearlo.
- Región `us-east-1`, perfil `prometeo` y prefijo de nombres `prometeo-hack`.
- **`infra/outputs.env` se commitea:** solo IDs, ARNs y URLs. **Nunca** credenciales, llaves ni tokens. Nada de `.env` con secretos en git.
- **Permisos:**
  - la Lambda usa un rol con `AWSLambdaBasicExecutionRole` (logs permitidos) + `bedrock:InvokeModel` acotado;
  - sin `AdministratorAccess` ni comodines.
- Solo se crean los recursos que nombra un script de `infra/` aprobado en `docs/PLAN_FASE2.md`. Desde el 15-nov el equipo autorizó Cognito, SQS, DynamoDB y el bucket de corpus del bloque C (`infra/30_data.sh`). Cualquier otro servicio nuevo necesita que una persona lo apruebe antes.
- Los permisos nuevos se agregan acotados al recurso concreto (ARN de la tabla, de la cola, del bucket con prefijo); nunca `*`.
- Antes de borrar o reemplazar un recurso, confirma con una persona.

## 9. Comandos

| Qué | Comando |
|---|---|
| Generar pack | `python3 -I pipeline/build_pack.py && python3 -I pipeline/validate_pack.py` |
| Desarrollo web | `cd web && npm install && npm run dev` |
| Pruebas | `cd web && npm test` · `python3 -m pytest api/` · `scripts/check_agnostic.sh` |
| Comprobar AWS | `infra/00_check.sh` |
| Desplegar web | `infra/deploy_web.sh` |
| Desplegar API | `infra/20_api.sh` |
| Recursos de datos del bloque C | `infra/30_data.sh` |

## 10. Documentos

- `docs/PLAN.md`: tareas, alcance y verificación (manda sobre cualquier otro doc en caso de conflicto).
- `PROGRESS.md`: estado vivo.
- `docs/Prometeo — Documento de casos de uso.md`: casos de uso y criterios de aceptación.
- `docs/Prometeo — Arquitectura final del sistema MVP.md`: arquitectura objetivo. Este plan es el recorte de 8 h.
- `PROMETEO_GUIA_DE_DESARROLLO.md`: contratos (§4), motor y vectores (§6). Su estética espacial (§9) y su stack (Gemini, Vercel, Render) **no aplican**.
