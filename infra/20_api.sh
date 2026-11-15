#!/usr/bin/env bash
# T10: recursos reproducibles, sin reemplazar ni borrar recursos existentes.
set -euo pipefail
cd "$(dirname "$0")/.."
export AWS_PROFILE=prometeo AWS_PAGER=""
source infra/config.env
source infra/outputs.env
: "${MODEL_ID:?Primero verificar MODEL_ID con 00_check.sh}"
: "${CF_URL:?Primero desplegar T08}"
PYTHON=${PYTHON:-api/.venv/bin/python}
"$PYTHON" -c 'import sys; assert sys.version_info[:2] == (3,12), "Se requiere Python 3.12"'
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
[[ "$WEB_BUCKET" == "${PROJECT}-web-${ACCOUNT}" ]] || { echo 'Cuenta distinta de T08' >&2; exit 1; }
NAME="${PROJECT}-api"
ROLE_NAME="${NAME}-role"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
# Entorno de empaquetado aislado: wheels Linux, no dependencias nativas macOS.
"$PYTHON" -m venv "$TMP/venv"
"$TMP/venv/bin/python" -m pip install --disable-pip-version-check --only-binary=:all: --platform manylinux_2_28_aarch64 --platform manylinux2014_aarch64 --implementation cp --python-version 3.12 --target "$TMP/package" -r api/requirements.txt
cp api/handler.py api/verify.py api/projects.py api/upload_tickets.py "$TMP/package/"
cp web/public/demo/pack.json "$TMP/package/pack.json"
"$PYTHON" -I - "$TMP" <<'PY'
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import sys
root=Path(sys.argv[1]); package=root/'package'
with ZipFile(root/'lambda.zip','w',ZIP_DEFLATED) as z:
    for p in sorted(package.rglob('*')):
        if p.is_file() and '__pycache__' not in p.parts: z.write(p,p.relative_to(package))
PY
aws bedrock get-inference-profile --inference-profile-identifier "$MODEL_ID" > "$TMP/model.json"
# Preserve unrelated environment variables, including future project/worker settings.
if ! aws lambda get-function-configuration --function-name "$NAME" > "$TMP/existing-function.json" 2> "$TMP/error"; then
  grep -q ResourceNotFoundException "$TMP/error" || { cat "$TMP/error" >&2; exit 1; }
  printf '%s' '{}' > "$TMP/existing-function.json"
fi
"$PYTHON" -I - "$TMP" "$CF_URL" "$MODEL_ID" <<'PY'
import json,sys
from pathlib import Path
root=Path(sys.argv[1]); profile=json.loads((root/'model.json').read_text())
resources=[profile['inferenceProfileArn']]+[m['modelArn'] for m in profile['models']]
(root/'trust.json').write_text(json.dumps({'Version':'2012-10-17','Statement':[{'Effect':'Allow','Principal':{'Service':'lambda.amazonaws.com'},'Action':'sts:AssumeRole'}]}))
(root/'policy.json').write_text(json.dumps({'Version':'2012-10-17','Statement':[{'Effect':'Allow','Action':'bedrock:InvokeModel','Resource':resources}]}))
env=json.loads((root/'existing-function.json').read_text()).get('Environment',{}).get('Variables',{})
env.update({'MODEL_ID':sys.argv[3],'CF_URL':sys.argv[2]})
(root/'env.json').write_text(json.dumps({'Variables':env}))
projects=bool(env.get('COGNITO_ISSUER'))
(root/'cors.json').write_text(json.dumps({'AllowOrigins':[sys.argv[2]],
    'AllowMethods':['GET','POST','PATCH','OPTIONS'] if projects else ['POST','OPTIONS'],
    'AllowHeaders':['content-type','authorization','idempotency-key'] if projects else ['content-type'],'MaxAge':300}))
PY
if aws iam get-role --role-name "$ROLE_NAME" > "$TMP/role.json" 2> "$TMP/error"; then
  ROLE_ARN=$("$PYTHON" -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["Role"]["Arn"])' "$TMP/role.json")
else
  grep -q NoSuchEntity "$TMP/error" || { cat "$TMP/error" >&2; exit 1; }
  ROLE_ARN=$(aws iam create-role --role-name "$ROLE_NAME" --assume-role-policy-document "file://$TMP/trust.json" --query Role.Arn --output text)
fi
aws iam attach-role-policy --role-name "$ROLE_NAME" --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name "${PROJECT}-bedrock" --policy-document "file://$TMP/policy.json"
FUNCTION_ARN=$("$PYTHON" -I -c 'import json,sys; print(json.load(open(sys.argv[1])).get("FunctionArn","None"))' "$TMP/existing-function.json")
if [[ "$FUNCTION_ARN" == None ]]; then
  # IAM puede tardar en propagar el trust; repetir solo ese error conocido.
  for attempt in 1 2 3 4 5 6; do
    if aws lambda create-function --function-name "$NAME" --runtime python3.12 --architectures arm64 --handler handler.handler --role "$ROLE_ARN" --timeout 29 --memory-size 512 --environment "file://$TMP/env.json" --zip-file "fileb://$TMP/lambda.zip" > "$TMP/function.json" 2> "$TMP/error"; then break; fi
    if ! grep -q 'cannot be assumed by Lambda' "$TMP/error" || [[ "$attempt" == 6 ]]; then cat "$TMP/error" >&2; exit 1; fi
    sleep 5
  done
  FUNCTION_ARN=$("$PYTHON" -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["FunctionArn"])' "$TMP/function.json")
  aws lambda wait function-active --function-name "$NAME"
else
  aws lambda update-function-code --function-name "$NAME" --architectures arm64 --zip-file "fileb://$TMP/lambda.zip" > /dev/null
  aws lambda wait function-updated --function-name "$NAME"
  aws lambda update-function-configuration --function-name "$NAME" --runtime python3.12 --handler handler.handler --role "$ROLE_ARN" --timeout 29 --memory-size 512 --environment "file://$TMP/env.json" > /dev/null
  aws lambda wait function-updated --function-name "$NAME"
fi
API_ID=${API_ID:-None}
if [[ "$API_ID" != None ]]; then
  aws apigatewayv2 get-api --api-id "$API_ID" > "$TMP/api.json"
  "$PYTHON" -I -c 'import json,sys; assert json.load(open(sys.argv[1]))["Name"] == sys.argv[2], "API distinta de outputs"' "$TMP/api.json" "$NAME"
fi
if [[ "$API_ID" == None ]]; then
  API_ID=$(aws apigatewayv2 create-api --name "$NAME" --protocol-type HTTP --target "$FUNCTION_ARN" --cors-configuration "file://$TMP/cors.json" --query ApiId --output text)
else
  aws apigatewayv2 update-api --api-id "$API_ID" --cors-configuration "file://$TMP/cors.json" > /dev/null
fi
aws apigatewayv2 update-stage --api-id "$API_ID" --stage-name '$default' --default-route-settings ThrottlingBurstLimit=10,ThrottlingRateLimit=5 > /dev/null
SID="${PROJECT}-gateway-${API_ID}"
# get-policy falla con ResourceNotFound si no existen permisos; otros errores se propagan.
if ! aws lambda get-policy --function-name "$NAME" > "$TMP/lambda-policy.json" 2> "$TMP/error"; then
  if ! grep -q ResourceNotFoundException "$TMP/error"; then cat "$TMP/error" >&2; exit 1; fi
  printf '%s' '{"Policy":"{\"Statement\":[]}"}' > "$TMP/lambda-policy.json"
fi
HAS_PERMISSION=$("$PYTHON" -I - "$TMP/lambda-policy.json" "$SID" <<'PY'
import json,sys
p=json.loads(json.load(open(sys.argv[1]))['Policy'])
print('yes' if any(s.get('Sid')==sys.argv[2] for s in p['Statement']) else 'no')
PY
)
if [[ "$HAS_PERMISSION" == no ]]; then
  aws lambda add-permission --function-name "$NAME" --statement-id "$SID" --action lambda:InvokeFunction --principal apigateway.amazonaws.com --source-account "$ACCOUNT" --source-arn "arn:aws:execute-api:${REGION}:${ACCOUNT}:${API_ID}/\$default/\$default" > /dev/null
fi
API_URL=$(aws apigatewayv2 get-api --api-id "$API_ID" --query ApiEndpoint --output text)
"$PYTHON" -I - "$API_ID" "$API_URL" "$FUNCTION_ARN" "$ROLE_ARN" <<'PY'
from pathlib import Path
import sys
keys=['API_ID','API_URL','FUNCTION_ARN','API_ROLE_ARN']; p=Path('infra/outputs.env')
lines=[s for s in p.read_text().splitlines() if not any(s.startswith('export '+k+'=') for k in keys)]
lines.extend(f'export {k}="{v}"' for k,v in zip(keys,sys.argv[1:])); p.write_text('\n'.join(lines)+'\n')
PY
printf 'API publicada: %s\n' "$API_URL"
