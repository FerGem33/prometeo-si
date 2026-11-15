# T34 — Validación administrativa del mapping

El permiso de despliegue ya está aplicado. Antes de crear el worker, RELEVO §0
exige comprobar la condición `lambda:FunctionArn` con el simulador IAM.
El perfil operativo `prometeo` no tiene `iam:SimulateCustomPolicy`; no repetir
allí la consulta que ya devolvió AccessDenied ni concederle administración.
Un administrador ejecuta estas dos comprobaciones desde su sesión autorizada
y devuelve solamente las decisiones (sin credenciales).

## 1. Preparar la declaración exacta

Desde la raíz del repositorio, localmente:

```bash
api/.venv/bin/python -I - <<'PY'
import json
from pathlib import Path
policy = json.loads(Path('infra/t34-deployer-policy.json').read_text())
statements = [s for s in policy['Statement'] if s['Sid'] == 'CreateMappingOnlyForWorker']
assert len(statements) == 1
Path('/tmp/prometeo-t34-mapping-simulation.json').write_text(
    json.dumps({'Version': policy['Version'], 'Statement': statements}, separators=(',', ':')))
PY
```

Si se usa otra terminal/máquina administrativa, llevar solo este JSON de política
(no contiene secretos). La ruta del comando debe apuntar a esa copia.

## 2. Control positivo

En la sesión administrativa autorizada para usar el simulador:

```bash
aws iam simulate-custom-policy \
  --policy-input-list file:///tmp/prometeo-t34-mapping-simulation.json \
  --action-names lambda:CreateEventSourceMapping \
  --resource-arns '*' \
  --context-entries ContextKeyName=lambda:FunctionArn,ContextKeyValues=arn:aws:lambda:us-east-1:352818909129:function:prometeo-hack-worker,ContextKeyType=string \
  --query 'EvaluationResults[].{Decision:EvalDecision,Missing:MissingContextValues}' \
  --region us-east-1 --output json --no-cli-pager
```

Esperado: `Decision: allowed`, `Missing: []`.

## 3. Control negativo

```bash
aws iam simulate-custom-policy \
  --policy-input-list file:///tmp/prometeo-t34-mapping-simulation.json \
  --action-names lambda:CreateEventSourceMapping \
  --resource-arns '*' \
  --context-entries ContextKeyName=lambda:FunctionArn,ContextKeyValues=arn:aws:lambda:us-east-1:352818909129:function:prometeo-hack-other-negative-control,ContextKeyType=string \
  --query 'EvaluationResults[].{Decision:EvalDecision,Missing:MissingContextValues}' \
  --region us-east-1 --output json --no-cli-pager
```

Esperado: `Decision: implicitDeny`, `Missing: []`. No se crea esa función ni
ningún mapping: ambas operaciones son simulaciones. Si difiere algún resultado,
conservar la salida y corregir la condición; no quitarla para obtener permiso.

Tras confirmar ambos resultados, seguir RELEVO §3: primera aplicación crea el
mapping deshabilitado, segunda comprueba reutilización. Luego ventana de lote
acotada, medición, DLQ y deshabilitación. No publicar otra web sin la revisión
humana de interfaz incorporada en AGENTS §6 por el commit 2bc00e8.
