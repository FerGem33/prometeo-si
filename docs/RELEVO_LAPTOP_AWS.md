# Relevo a la laptop con AWS — 15-nov-2026

Todas las decisiones humanas están cerradas (`DECISIONES_CIERRE.md`, `D7_DECISIONES.md`), salvo la revisión semántica
de los PDF de T32 (paso 5), que necesita archivos que solo existen en esta laptop. El código de esta guía está en
`main` y probado con dobles. **Nada de lo siguiente se ha ejecutado contra AWS.**

Orden: 0 → 1 → 2 → 3 → 4. El paso 5 se puede hacer en paralelo. Después de cada paso: actualizar `PROGRESS.md`,
commit y push (sin coautoría).

## 0. Preparación (~10 min)

```bash
git pull --rebase
export AWS_PROFILE=prometeo && aws sso login --profile prometeo
source infra/config.env && source infra/outputs.env
aws sts get-caller-identity          # cuenta 352818909129, rol AWSReservedSSO_… (nunca root)
python3.12 -m venv api/.venv && api/.venv/bin/pip install -r api/requirements-dev.txt -r api/requirements-worker.txt
api/.venv/bin/python -m pytest api/ -q && npm test --prefix web && bash scripts/check_agnostic.sh
npm ci --prefix tools/cognito --ignore-scripts
# Corpus del segundo dominio (D10), fuera de git. Comparar los SHA-256 con docs/t37/manifest_ebullicion.csv:
api/.venv/bin/python -I tools/psi/corpus_dominio.py          # ~3 min; usa pypdf del venv para contar páginas
```

**Prerrequisito del administrador:** el permission set `Prometeo-T31` debe incluir `infra/t33-deployer-policy.json` y
`infra/t34-deployer-policy.json`. Antes de aplicarla, validar la de T34 con el simulador de políticas IAM, en
particular `lambda:CreateEventSourceMapping` con la condición `lambda:FunctionArn`.

## 1. API: DELETE de T33 y CORS solo con CloudFront (~10 min)

```bash
bash infra/20_api.sh        # SIN EXTRA_ORIGINS: CORS solo CloudFront (DECISIONES_CIERRE §6)
api/.venv/bin/python -I infra/deploy_projects.py --output-dir /tmp/prometeo-t33-delete --apply --contract-approved --uploads
```

Esperado:
- 11 rutas JWT (se suman `DELETE /projects/{id}` y `DELETE /projects/{id}/documents/{doc_id}`).
- La política `prometeo-hack-projects` del rol de la API añade `dynamodb:DeleteItem`, `s3:DeleteObject` en `u/*/p/*` y
  `s3:ListBucket` con la condición `s3:prefix` `u/*/p/*`.
- Los IDs de API, Lambda y rol no cambian.

Regresión pública:

```bash
curl -s -X POST "$API_URL/ask" -H 'content-type: application/json' --data @api/events/ask.json            # 200, o2=25 p=0.5 Nomex
curl -s -X POST "$API_URL/analysis" -H 'content-type: application/json' --data @api/events/analysis_lunar.json  # 200, mode=ai
curl -si -X OPTIONS "$API_URL/projects/x" -H "Origin: $CF_URL" -H 'Access-Control-Request-Method: DELETE' | grep -i allow-methods
```

## 2. Smoke real de T33 con borrado (requiere a Daniel: contraseñas A y B)

```bash
T33_PYTHON=api/.venv/bin/python node tools/cognito/cli.mjs uploads \
  "$(ls tools/psi/data/dominio_ebullicion/lote/PSI-87__*.csv)" --cleanup
```

En Windows: `tools\cognito\run_uploads_smoke.ps1 -Cleanup`.

Comprobaciones esperadas:

| Comprobación | Resultado |
|---|---|
| Ticket ajeno | 404 |
| PUT a S3 | 200 |
| Sobrescritura | 412 |
| `complete` | 200, y repetido 200 |
| `complete` con hash en conflicto | 409 |
| Listado ajeno | 404 |
| DELETE ajeno (documento y proyecto) | 404 |
| DELETE del dueño (documento y luego proyecto) | 204 |
| GET del proyecto borrado | 404 |

El recibo queda en `/tmp/prometeo-t33-upload-check.json`. Con eso **T33 queda hecha**. Opcional: borrar los dos drafts
vacíos de la prueba A/B (IDs en `docs/T33_PRUEBA_USUARIOS.md`).

## 3. Despliegue del worker (T34)

```bash
ZIP=/tmp/prometeo-worker-$(git rev-parse --short HEAD).zip
bash infra/package_worker.sh "$ZIP"
api/.venv/bin/python -I infra/deploy_worker.py --output-dir /tmp/prometeo-t34          # revisar worker-*.json
api/.venv/bin/python -I infra/deploy_worker.py --output-dir /tmp/prometeo-t34 --apply --zip "$ZIP"
source infra/outputs.env                                                               # recoge WORKER_MAPPING_UUID
api/.venv/bin/python -I infra/deploy_worker.py --output-dir /tmp/prometeo-t34 --apply --zip "$ZIP"   # 2ª corrida: nada nuevo
aws sqs get-queue-attributes --queue-url "$INGEST_QUEUE_URL" --attribute-names ApproximateNumberOfMessages
```

- La primera corrida crea rol, Lambda y una asociación **deshabilitada**.
- La segunda no crea nada.
- Commit de `infra/outputs.env` (solo ARN y UUID).

**Antes de `--enable`**, mira cuántos mensajes hay en la cola. Los que dejaron smokes previos sin `--cleanup` se
procesarán con llamadas reales a Bedrock (tope operativo USD 30, `DECISIONES_CIERRE` §5).

## 4. Verificación de T34: lote de 10 + 1 corrupto (~15 min + espera de DLQ)

```bash
api/.venv/bin/python -I infra/deploy_worker.py --output-dir /tmp/prometeo-t34 --apply --zip "$ZIP" --enable
T33_PYTHON=api/.venv/bin/python node tools/cognito/cli.mjs batch tools/psi/data/dominio_ebullicion/lote --limit 10 --corrupt
```

Esperado:
- 10 documentos reales en `done` (o `skipped` si se repiten).
- El control `corrupt-control.csv` en `failed` con `unreadable`.
- `project_status: failed`, porque hay un fallo. El resto continúa: eso es lo que verifica T34.
- Recibo en `/tmp/prometeo-batch-check.json`.

El corrupto llega a la **DLQ tras 3 recepciones** (visibilidad de 960 s), unos 35 minutos después:

```bash
aws sqs get-queue-attributes --queue-url "$INGEST_DLQ_URL" --attribute-names ApproximateNumberOfMessages   # → 1
api/.venv/bin/python -I infra/deploy_worker.py --output-dir /tmp/prometeo-t34 --apply --zip "$ZIP" --disable
```

Registrar en `PROGRESS.md`:
- duración y memoria máxima de las invocaciones con PDF (líneas `REPORT` de CloudWatch; ajustar `MEMORY` en `deploy_worker.py` si hace falta);
- el gasto de Bedrock del lote (si pasa de USD 5, parar y revisar);
- que la DLQ recibió el corrupto.

Con eso **T34 queda hecha**. No reenviar mensajes de la DLQ de forma automática.

## 5. T32: revisión semántica de los PDF (aprobación delegada al agente, `DECISIONES_CIERRE.md` §8)

Un agente prepara `docs/T32_PDF_DECISIONES.md`, precargada igual que `D7_DECISIONES.md`, a partir de
`/tmp/prometeo-t32/papers-real/*/response.json` y del texto de cada página citada. La tabla cubre:
- los 15 candidatos verificados textualmente, con valor, unidad, página, cita y si la cita respalda la población de pruebas;
- el PDF `20120015928`: Poppler no le encontró texto, pero pypdf sí; comparar y decidir.

El agente aplica sus recomendaciones por delegación del dueño, con criterio conservador y registro honesto (§8).
Luego recalcula la métrica de T32 sin las 55 columnas rechazadas por ambos (D7, regla A) y cierra T32.
**Si `/tmp/prometeo-t32/` ya no existe**, repetir `api/evaluate_papers.py` (`T32_EVALUACION.md` §Reproducir);
cuesta unas 4 llamadas.

## Lo que sigue después del relevo

| Tarea | Qué | Depende de |
|---|---|---|
| T35 | API y pantalla de revisión del esquema (aprobar, fusionar, renombrar) | T34 hecha |
| T37 | Proyecto nuevo con los 23 documentos (`cli.mjs batch …/lote`), revisión T35, publicar y abrir en la misma interfaz | T35 |
| T36 | Correcciones, conflictos y claims con cita | T35 |
| T38 | Exportación para ML (contrato §5.10); se puede hacer sin AWS | — |
| T21–T29 | Pantallas del bloque B | Equipo de interfaz (rama `frontend`) |
