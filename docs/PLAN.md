# Prometeo — Plan de desarrollo (8 h)

14 de noviembre de 2026 · Plan para agentes de código · El estado vive en [`PROGRESS.md`](../PROGRESS.md) y las reglas en [`AGENTS.md`](../AGENTS.md).

## 0. Contexto

**Base del plan:** los documentos del equipo (`docs/Prometeo — Arquitectura final del sistema MVP.md` y `docs/Prometeo — Documento de casos de uso.md`) más las 7 decisiones de la revisión:

| # | Tema | Decisión |
|---|---|---|
| 1 | Niveles de evidencia | Niveles de cobertura calculables (§2). El guion de la demo se reescribe con datos reales. |
| 2 | Alcance | El corte queda escrito antes de empezar (§2). |
| 3 | Logs | Se permiten los logs básicos de Lambda. Sin alarmas ni retención configurada. |
| 4 | Timeout de `/analysis` | Una sola llamada al modelo y un verificador determinista en código. |
| 5 | Pack de demo | Se genera fuera de línea con un script, sin Bedrock ni worker. |
| 6 | Idioma e ingesta | Interfaz solo en inglés. Ingesta por lotes fuera de línea. |
| 7 | Limpieza de `docs/` | Se hace en T00. |

**Restricciones:**
- 8 h de reloj.
- 100 % por agentes de código, uno a la vez. Cuando se acaba el uso de una cuenta, otra persona sigue en su laptop con su propia cuenta.
- Todo AWS con el AWS CLI (sin SAM ni consola).

**Resultado buscado:** una URL pública de CloudFront donde los jueces de la NASA:
- exploran un informe tipo artículo sobre datos reales de PSI;
- ajustan un escenario;
- hacen preguntas en lenguaje natural (`/ask`);
- leen un análisis verificado.

**Material existente que se reutiliza:**
- `report/tools/build_data.py`: parseo de 5 investigaciones de PSI (501 pruebas, DOIs y notas de datos).
- `report/index.html` y `report/report.css`: estructura y estilo del artículo.
- `estilos2/1_articulo.html`: identidad visual elegida.
- `PROMETEO_GUIA_DE_DESARROLLO.md`: §4 contratos, §6 motor y vectores, §5.10–5.12 prompts y verificación.

**Datos:** fuera del repo, en `../datos_fuego/psi_tablas` (102 CSV, 864 KB) y `../datos_fuego/psi_json` (107 JSON, 44 MB). T01 copia al repo solo los de combustión.

## 1. Decisiones técnicas

| Tema | Decisión |
|---|---|
| Frontend | Vite + React + TypeScript en `web/`. Gráficas en SVG propio, sin librería de charts. Estética de artículo. Solo inglés. |
| Motor | TypeScript puro en `web/src/engine/`: sin DOM, sin red y sin vocabulario de dominio. Pruebas con Vitest y vectores con datos reales. |
| Pack de demo | `pipeline/build_pack.py` (Python, solo librería estándar) genera `web/public/demo/pack.json`, `mapping.json` y `lens.json`. |
| API | Una Lambda Python 3.12 (`api/handler.py`) con `POST /ask` y `POST /analysis`, detrás de API Gateway HTTP API. Claude en Bedrock con el SDK oficial `anthropic` (`AnthropicBedrock`), empaquetado en el zip. |
| Modelo | Uno solo, en la variable `MODEL_ID`. Por defecto Claude Haiku 5.5 (latencia). Sonnet 5.5 si la calidad no alcanza. El ID exacto de Bedrock o del perfil de inferencia (`us.anthropic.…`) se toma de `aws bedrock list-foundation-models --by-provider anthropic` y `aws bedrock list-inference-profiles`, nunca de memoria. |
| `/analysis` | Una llamada. El modelo devuelve `{"sentences":[{"text","finding_ids":[]}]}`. `api/verify.py` descarta cada oración cuyos números o fuentes no estén en los hallazgos referidos. Timeout del cliente: 20 s. Si falla, el frontend muestra el texto por plantilla. Nunca se presenta una respuesta grabada como IA. |
| Infra | Scripts idempotentes de AWS CLI en `infra/`, región `us-east-1`. S3 privado + CloudFront con OAC para el web. Un rol IAM para la Lambda con `AWSLambdaBasicExecutionRole` + `bedrock:InvokeModel` acotado. Throttling en el stage de la API. |
| Fuera de las 8 h | Cognito, SQS/worker, DynamoDB, subida de archivos y pantallas de revisión (CU-02, 05–09). Se declaran "posterior" en el README y el pitch. |

## 2. Alcance y niveles de evidencia

| Prioridad | Casos de uso | Contenido |
|---|---|---|
| **P0** (sin esto no hay demo) | CU-01, 10, 11, 13, 15, 16, 17, 21 | Informe tipo artículo desplegado. Ranking A–D, mapa, tabla de calor, hallazgos, niveles por variable, escenario ajustable, procedencia (fila + DOI de PSI) y PDF con `window.print()`. |
| **P1** | CU-19, 20 | `/ask` (pregunta → escenario/filtros validados) y `/analysis` verificado. |
| **P2** | CU-24, 14, 18 | Ficha de datos para ML determinista; comparar 2 estudios; relaciones/huecos solo si da tiempo de extraerlos con cita. |
| **P3** (pitch) | Prueba agnóstica | Bedrock propone el mapeo de columnas de las tablas de PSI y se compara con el mapeo aprobado. Resultado en `docs/agnostic_proof.md`. |
| Posterior | CU-02, 03–09, 12 completo, 22, 23, 25 | No se tocan. |

**Niveles de evidencia por variable de la propuesta.** Se calculan sobre el `pool` comparable (misma partición). Los umbrales viven en `lens.evidence` y se muestran en Methods.

| Nivel | Condición |
|---|---|
| **Studied** | El valor `t` está dentro del rango probado y lo cubren registros de ≥ `min_studies` (2) estudios. |
| **Scarce evidence** | `t` está dentro del rango, pero lo cubren menos de `min_studies` estudios o solo registros con bandera. |
| **Near, not covered** | `t` está fuera del rango, a menos de `closeness_reach·σ` del borde. |
| **Not studied** | Ningún registro del `pool` tiene la variable, o `t` está más lejos que eso. |

Además, cada estudio lleva su nota A–D (guía §6.3). Ningún nivel se comunica solo con color.

**Regla de corte:** a las **5:00 h** se congela P0 y se despliega lo que haya. P1 y P2 entran solo si la versión desplegada sigue funcionando.

## 3. Prerrequisitos humanos (antes de la hora 0, en paralelo)

- [ ] **Dueño de la cuenta AWS:**
  - crear acceso por persona;
  - en cada laptop, `aws configure --profile prometeo` (región `us-east-1`).
- [ ] **Bedrock:** confirmar acceso a Claude con una invocación real. Si es la primera vez que la cuenta usa modelos de Anthropic, puede pedir llenar un formulario de caso de uso.
- [ ] **GitHub:** acceso de push al repo (`origin`) para todos los que vayan a relevar.
- [ ] **Corpus del compañero:** si tiene `construir_corpus.py` o `seed/corpus.json` (guía §10.1), subirlos a `pipeline/legacy/`.
- [ ] **Herramientas en cada laptop:** Node 20+, Python 3.12, AWS CLI v2 y git.

## 4. Tareas

Tiempos en reloj acumulado. Cada tarea define su **verificación**: el agente la ejecuta antes de marcarla como hecha en `PROGRESS.md`.

### Bloque 0 · Cimientos (0:00–0:45)

**T00 — Repo y docs**
- `.gitignore`: `node_modules`, `dist`, `build`, `__pycache__`, `*.zip`, `.env`, `.venv`.
- Borrar `docs/Prometeo — Documento de casos de uso (1).md` (duplicado byte a byte).
- En §13 de la arquitectura final, quitar o corregir los enlaces a archivos que no existen.
- Mover `prototipo/`, `estilos/` y `design/` a `archive/`.
- Escribir `docs/Prometeo — Decisiones del hack.md` con la tabla de §0 y el corte de §2.
- En casos de uso, reescribir la tabla de §11 con el escenario real: base lunar a 30 % O₂, 10.2 psi ≈ 0.69 atm, PMMA. Esperado:
  - O₂: *Near, not covered* o *Not studied* para sólidos (máximo probado: 22.2 %, BASS-II);
  - presión: *Not studied* (0 de 268 pruebas de sólidos la registran);
  - PMMA: *Studied*.
- Primer commit y push.
- *Verificación:* `git log --oneline` muestra el commit y `ls docs` no tiene duplicados.

**T01 — Datos en el repo**
- Leer `../datos_fuego/psi_json/*.json` y quedarse con las investigaciones con `researchArea == "Combustion Science"`.
- Copiar sus CSV a `data/psi/tables/` y sus JSON a `data/psi/meta/`.
- `data/psi/README.md`: origen (NASA PSI), licencia (CC0) y cómo se filtró.
- *Verificación:* `du -sh data/` < 10 MB y conteo de investigaciones registrado en `PROGRESS.md`.

**T02 — Scaffold**
- `web/`: Vite + React + TS + Vitest. Tokens y CSS de `report/report.css` y `estilos2/1_articulo.html` portados a `web/src/styles/`.
- `api/`, `pipeline/` e `infra/`, cada uno con un README de una línea.
- `scripts/check_agnostic.sh`: falla si `web/src/engine/` contiene alguna de `flame fire oxygen habitat psi moon lunar combust nasa` (sin distinguir mayúsculas).
- `infra/config.env`: `REGION`, `MODEL_ID`, `PROJECT=prometeo-hack`.
- `infra/00_check.sh`:
  - `aws sts get-caller-identity`;
  - listado de modelos e inferencias de Anthropic;
  - una invocación de prueba.
- *Verificación:* `cd web && npm run build && npm test` y `scripts/check_agnostic.sh` en verde. Un humano corre `infra/00_check.sh` y anota el `MODEL_ID` real.

### Bloque 1 · Pack y motor (0:45–2:30)

**T03 — Pack de demo**
- `pipeline/build_pack.py` → `web/public/demo/pack.json`. Sigue el contrato de la guía §4, con estos ajustes:
  - `presets` en lugar de `habitats`;
  - `provenance` opcional por variable (`{"p": {"confidence": "paper", "quote": "…", "page": 4}}`);
  - `claims[]` (vacío por ahora).
- **Ruta rápida:** si existe `pipeline/legacy/construir_corpus.py` o `corpus.json`, convertirlo (guía §10.1).
- **Si no:** extender la lógica de `report/tools/build_data.py` (que ya maneja FLEX, CFI, BASS-II, SAFFIRE-I/II, DOIs y la presión inválida de FLEX) a todas las tablas de combustión que se alcancen. Prioridad: sólidos y tablas con presión (guía §1.3).
- Cada registro lleva:
  - `src` (archivo + fila);
  - rangos `[min, max]` en unidades normalizadas;
  - la partición (`phase`);
  - banderas.
- `mapping.json` aprobado. `lens.json` escrito a mano:
  - ejes por defecto O₂ × presión;
  - presets: lunar base 30 %/0.69 atm, station 21 %/1 atm, suit 100 %/0.29 atm;
  - preguntas sugeridas;
  - umbrales de evidencia.
- `pipeline/validate_pack.py`: validador mínimo del contrato.
- *Verificación:* `python3 -I pipeline/build_pack.py && python3 -I pipeline/validate_pack.py`.

**T04 — Motor**
- En `web/src/engine/`:
  - `closeness`, `distance`/`grade`, `rank`, `coverage` (guía §6.1–6.3);
  - `gaps`: malla 8×8 con bordes por cuantiles (§6.4);
  - `findings`: detectores de §6.7;
  - `evidenceLevels`: §2 de este plan.
- Todo con funciones puras y tipos estrictos.
- `web/src/engine/golden.test.ts`:
  - **Si el pack es el corpus completo del compañero:** usar los valores de la guía §6.6 y §6.7 (notas C4 D20; BASS-II `d = 1.56`; O₂ +7.8 sobre 22.2 %; presión 0/268).
  - **Si el pack es parcial:** congelar los valores de la primera corrida, revisados a mano contra los CSV (máx. O₂ de sólidos 22.2 en BASS-II; 0 sólidos con presión), y documentar el origen de cada valor en un comentario.
- *Verificación:* `npm test` y `scripts/check_agnostic.sh` en verde.

### Bloque 2 · Informe y primer despliegue (2:30–5:00)

**T05 — Esqueleto del informe**
- Portar `report/index.html` a componentes React, todo llenado desde `pack` y `lens` (ningún texto de dominio escrito a mano en componentes):
  - título y escenario;
  - Key findings (de `findings`);
  - abstract por plantilla;
  - tabla de fuentes (`studies`);
  - Methods, desde `mapping`: conversiones, columnas rechazadas, banderas y umbrales;
  - References con DOI.
- *Verificación:* `npm run build`, revisión visual y captura en `docs/screens/`.

**T06 — Escenario y figuras interactivas**
- Panel de propuesta (CU-15/17): un slider por variable numérica, selector categórico y presets. Recalcula en < 200 ms.
- Figuras y tablas:
  - Fig. 1: mapa de dos ejes elegibles, con el escenario y la tolerancia;
  - Fig. 2: tabla de calor estudio × variable (cercanía y valor real al pasar el cursor);
  - Fig. 3: cobertura y huecos;
  - Table 1: ranking A–D ordenable, con los `why`.
- Nivel de evidencia por variable, con texto e icono.
- *Verificación:* preset lunar base reproduce los niveles de T00. Captura.

**T07 — Procedencia, PDF y URL**
- Clic en un valor → popover con archivo, fila, valor original, conversión y enlace DOI de PSI (CU-13).
- `@media print` y botón "Export PDF" (CU-21).
- Escenario en la URL (`?o2=30&p=0.69&material=PMMA`).
- *Verificación:* imprimir a PDF desde el navegador con todas las secciones presentes.

**T08 — Infra web**
- `infra/10_web.sh` (idempotente): bucket S3 privado, OAC, distribución CloudFront y política del bucket. Escribe `WEB_BUCKET`, `CF_ID` y `CF_URL` en `infra/outputs.env`.
- `infra/deploy_web.sh`:
  - build;
  - `aws s3 sync web/dist s3://$WEB_BUCKET --delete`;
  - `aws cloudfront create-invalidation --paths '/*'`.
- *Verificación:* `curl -sI $CF_URL` → 200 y la página abre. Anotar la URL en `PROGRESS.md`.

> **⏱ 5:00 — Congelar P0.** Desplegar y probar desde otra laptop y desde un celular.

### Bloque 3 · IA (5:00–6:45)

**T09 — Lambda**
- `api/handler.py`: router mínimo, CORS y validación de entrada.
- **`/ask`:** recibe `{question, schema}`.
  - El prompt pide `{"values":{}, "active":[], "filters":{}}` o `{"unsupported":"<reason>"}`.
  - Se valida contra el esquema: variables existentes, números dentro de rangos plausibles, categorías conocidas.
- **`/analysis`:** recibe `{scenario, levels, findings}`. Una llamada al modelo. Después, `api/verify.py`.
- Texto del usuario delimitado como dato (defensa ante inyección). `max_tokens` acotado.
- `api/test_verify.py` con casos de oraciones válidas e inventadas.
- *Verificación:* `python3 -m pytest api/` e invocación local del handler con eventos de ejemplo en `api/events/`.

**T10 — Infra API**
- `infra/20_api.sh` (idempotente):
  - rol IAM con `AWSLambdaBasicExecutionRole` + política inline `bedrock:InvokeModel` sobre el modelo o perfil de `MODEL_ID`;
  - `pip install anthropic -t api/build/` y zip;
  - `aws lambda create-function` / `update-function-code` (timeout 29 s, 512 MB, env `MODEL_ID`);
  - `aws apigatewayv2 create-api --protocol-type HTTP --target <lambda-arn>`;
  - CORS solo para `CF_URL`;
  - `aws lambda add-permission`;
  - throttling del stage (5 rps, ráfaga 10).
- Escribe `API_URL` en `infra/outputs.env`.
- *Verificación:* `curl -X POST $API_URL/ask -H 'content-type: application/json' -d @api/events/ask.json` devuelve JSON válido en < 10 s.

**T11 — UI de preguntas y análisis**
- Barra de preguntas con las sugerencias de `lens`:
  - aplica el escenario devuelto y muestra lo entendido como chips editables;
  - `unsupported` → mensaje de límite (preguntas de contenido = CU-23, futuro).
- Sección "Analysis": llama a `/analysis`, muestra cada oración con sus fuentes y cae a plantilla si hay error o pasan 20 s.
- `VITE_API_URL` sale de `infra/outputs.env`. Redeploy.
- *Verificación:* en la URL pública, "What if the base used 25% O₂ at 0.5 atm with Nomex?" cambia el escenario y el análisis aparece con fuentes.

### Bloque 4 · Extras y entrega (6:45–8:00)

**T12 (P2) — Ficha de datos para ML (CU-24)**
- Determinista, por variable de resultado del pack (p. ej. tasa, tiempo de quemado, resultado):
  - número de registros, completitud de entradas y unidades;
  - balance de clases y duplicados entre fuentes;
  - veredicto con umbrales visibles;
  - cada número abre los registros que lo producen.
- *Verificación:* pruebas del cálculo en Vitest.

**T13 (P2) — Comparar 2 estudios (CU-14)**
- Dos columnas con unidades, citas y etiquetas.
- *Verificación:* captura.

**T14 (P3) — Prueba agnóstica**
- `pipeline/induce_schema.py`: envía a Bedrock los encabezados y 5 filas de cada tabla y recibe un mapeo propuesto.
- Compara contra `mapping.json` y escribe la tabla de aciertos en `docs/agnostic_proof.md`.
- Corre una vez, fuera de línea.
- *Verificación:* el documento existe con los números reales.

**T15 — Aceptación y entrega**
- Recorrer la checklist de §5 en la URL pública.
- `README.md` para jueces: qué es, URL, uso en 3 pasos, qué es real y qué es posterior, fuentes CC0 de PSI.
- Deploy final.
- *Verificación:* checklist completa en `PROGRESS.md`.

## 5. Aceptación final

1. La URL de CloudFront abre en ventana privada, sin cuenta y sin escrituras al servidor (CU-01).
2. Preset lunar base:
   - O₂ = *Near, not covered* o *Not studied* para sólidos, con fuente BASS-II y fila;
   - presión = *Not studied*;
   - PMMA = *Studied*.
3. Mover un slider recalcula el ranking y las figuras sin retraso visible.
4. Clic en un valor muestra archivo, fila y DOI.
5. "Export PDF" produce el artículo completo: figuras, Methods y References.
6. `/ask`: una pregunta de condiciones cambia el escenario; una de contenido recibe el mensaje de límite.
7. `/analysis` solo muestra oraciones con fuente. Con la API caída aparece el texto por plantilla, sin error.
8. `npm test`, `python3 -m pytest api/` y `scripts/check_agnostic.sh` en verde.
9. Otra laptop con su perfil corre `infra/deploy_web.sh` sin duplicar recursos.

## 6. Estructura del repo al final

```
prometeo-researcher/
├─ AGENTS.md  CLAUDE.md  PROGRESS.md  README.md
├─ docs/            PLAN.md, decisiones, casos de uso, arquitectura, screens/
├─ data/psi/        tables/ (CSV), meta/ (JSON) — solo combustión
├─ pipeline/        build_pack.py, validate_pack.py, induce_schema.py, legacy/
├─ web/             Vite + React + TS
│  ├─ public/demo/  pack.json, mapping.json, lens.json
│  └─ src/          engine/ (puro), components/, styles/
├─ api/             handler.py, verify.py, test_verify.py, events/
├─ infra/           config.env, outputs.env, 00_check.sh, 10_web.sh, 20_api.sh, deploy_web.sh
├─ scripts/         check_agnostic.sh
├─ report/          prototipo de referencia (no se despliega)
└─ archive/         prototipos y estilos descartados
```
