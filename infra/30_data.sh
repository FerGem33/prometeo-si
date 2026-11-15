#!/usr/bin/env bash
# T31: recursos de datos del bloque C (idempotente). Crea lo que falta y nunca borra ni reemplaza.
#   - DynamoDB  ${PROJECT}-data          una tabla, claves PK/SK (docs/CONTRATOS_FASE2.md §5.9), bajo demanda
#   - S3        ${PROJECT}-corpus-<cuenta> privado, cifrado, CORS solo para PUT desde CF_URL
#   - SQS       ${PROJECT}-ingest (+ -dlq) cola de procesamiento con DLQ tras 3 intentos
#   - Cognito   ${PROJECT}-users          user pool con correo y cliente público (SPA, sin secreto)
# Escribe solo IDs, ARNs y URLs en infra/outputs.env. No toca la Lambda ni su rol: los permisos se agregan en T33/T34.
# Uso: export AWS_PROFILE=prometeo && bash infra/30_data.sh
set -euo pipefail
cd "$(dirname "$0")/.."
export AWS_PROFILE=${AWS_PROFILE:-prometeo} AWS_PAGER=""
source infra/config.env
source infra/outputs.env
: "${CF_URL:?Primero desplegar la web (infra/10_web.sh)}"
PYTHON=${PYTHON:-python3}
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
[[ "${WEB_BUCKET:-}" == "${PROJECT}-web-${ACCOUNT}" ]] || { echo 'Cuenta distinta de la del despliegue web' >&2; exit 1; }
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
none() { [[ -z "$1" || "$1" == None || "$1" == null ]]; }

# ---------------------------------------------------------------- DynamoDB
TABLE="${PROJECT}-data"
if aws dynamodb describe-table --table-name "$TABLE" > /dev/null 2> "$TMP/error"; then
  echo "DynamoDB $TABLE: ya existe"
else
  grep -q ResourceNotFoundException "$TMP/error" || { cat "$TMP/error" >&2; exit 1; }
  aws dynamodb create-table --table-name "$TABLE" --billing-mode PAY_PER_REQUEST \
    --attribute-definitions AttributeName=PK,AttributeType=S AttributeName=SK,AttributeType=S \
    --key-schema AttributeName=PK,KeyType=HASH AttributeName=SK,KeyType=RANGE \
    --tags Key=project,Value="$PROJECT" > /dev/null
  aws dynamodb wait table-exists --table-name "$TABLE"
  echo "DynamoDB $TABLE: creada"
fi
TABLE_ARN=$(aws dynamodb describe-table --table-name "$TABLE" --query Table.TableArn --output text)

# ---------------------------------------------------------------- S3 (corpus privado)
BUCKET="${PROJECT}-corpus-${ACCOUNT}"
if aws s3api head-bucket --bucket "$BUCKET" 2> /dev/null; then
  echo "S3 $BUCKET: ya existe"
else
  aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" > /dev/null
  echo "S3 $BUCKET: creado"
fi
# Configuración idempotente: se reaplica en cada corrida.
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-ownership-controls --bucket "$BUCKET" --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]'
aws s3api put-bucket-encryption --bucket "$BUCKET" \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
"$PYTHON" -I - "$TMP" "$CF_URL" <<'PY'
import json, sys
from pathlib import Path
root, origin = Path(sys.argv[1]), sys.argv[2]
# El navegador sube directo a S3 con URL prefirmada (PUT). Las lecturas se abren en otra pestaña y no necesitan CORS.
(root / "cors.json").write_text(json.dumps({"CORSRules": [{"AllowedOrigins": [origin], "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type", "if-none-match", "x-amz-checksum-sha256", "x-amz-server-side-encryption"], "MaxAgeSeconds": 300}]}))
(root / "lifecycle.json").write_text(json.dumps({"Rules": [{"ID": "abort-incomplete-uploads", "Status": "Enabled",
    "Filter": {"Prefix": ""}, "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 1}}]}))
PY
aws s3api put-bucket-cors --bucket "$BUCKET" --cors-configuration "file://$TMP/cors.json"
aws s3api put-bucket-lifecycle-configuration --bucket "$BUCKET" --lifecycle-configuration "file://$TMP/lifecycle.json" > /dev/null

# ---------------------------------------------------------------- SQS (cola de procesamiento + DLQ)
queue_url() { aws sqs get-queue-url --queue-name "$1" --query QueueUrl --output text 2> /dev/null || true; }
DLQ="${PROJECT}-ingest-dlq"
DLQ_URL=$(queue_url "$DLQ")
if none "$DLQ_URL"; then
  DLQ_URL=$(aws sqs create-queue --queue-name "$DLQ" \
    --attributes MessageRetentionPeriod=1209600,SqsManagedSseEnabled=true --query QueueUrl --output text)
  echo "SQS $DLQ: creada"
else
  echo "SQS $DLQ: ya existe"
fi
DLQ_ARN=$(aws sqs get-queue-attributes --queue-url "$DLQ_URL" --attribute-names QueueArn --query Attributes.QueueArn --output text)

QUEUE="${PROJECT}-ingest"
# Visibilidad 960 s: permite timeout de worker <=160 s con margen de 6x.
# T34 prepara timeout 120 s; comprobar valor real antes de asociar consumidor.
"$PYTHON" -I - "$TMP" "$DLQ_ARN" <<'PY'
import json, sys
from pathlib import Path
attrs = {"VisibilityTimeout": "960", "MessageRetentionPeriod": "345600", "SqsManagedSseEnabled": "true",
         "RedrivePolicy": json.dumps({"deadLetterTargetArn": sys.argv[2], "maxReceiveCount": "3"})}
Path(sys.argv[1], "queue.json").write_text(json.dumps(attrs))
PY
QUEUE_URL=$(queue_url "$QUEUE")
if none "$QUEUE_URL"; then
  QUEUE_URL=$(aws sqs create-queue --queue-name "$QUEUE" --attributes "file://$TMP/queue.json" --query QueueUrl --output text)
  echo "SQS $QUEUE: creada"
else
  aws sqs set-queue-attributes --queue-url "$QUEUE_URL" --attributes "file://$TMP/queue.json"
  echo "SQS $QUEUE: ya existe (atributos reaplicados)"
fi
QUEUE_ARN=$(aws sqs get-queue-attributes --queue-url "$QUEUE_URL" --attribute-names QueueArn --query Attributes.QueueArn --output text)

# ---------------------------------------------------------------- Cognito
POOL="${PROJECT}-users"
POOL_ID=$(aws cognito-idp list-user-pools --max-results 60 --query "UserPools[?Name=='${POOL}'].Id | [0]" --output text)
if none "$POOL_ID"; then
  POOL_ID=$(aws cognito-idp create-user-pool --pool-name "$POOL" \
    --username-attributes email --auto-verified-attributes email \
    --policies 'PasswordPolicy={MinimumLength=10,RequireUppercase=false,RequireLowercase=true,RequireNumbers=true,RequireSymbols=false}' \
    --account-recovery-setting 'RecoveryMechanisms=[{Priority=1,Name=verified_email}]' \
    --admin-create-user-config AllowAdminCreateUserOnly=false \
    --user-pool-tags project="$PROJECT" \
    --query UserPool.Id --output text)
  echo "Cognito $POOL: creado"
else
  echo "Cognito $POOL: ya existe"
fi
CLIENT="${PROJECT}-web"
CLIENT_ID=$(aws cognito-idp list-user-pool-clients --user-pool-id "$POOL_ID" --max-results 60 \
  --query "UserPoolClients[?ClientName=='${CLIENT}'].ClientId | [0]" --output text)
if none "$CLIENT_ID"; then
  # Cliente público: la SPA no puede guardar un secreto. SRP para iniciar sesión, refresh para mantenerla.
  CLIENT_ID=$(aws cognito-idp create-user-pool-client --user-pool-id "$POOL_ID" --client-name "$CLIENT" --no-generate-secret \
    --explicit-auth-flows ALLOW_USER_SRP_AUTH ALLOW_REFRESH_TOKEN_AUTH \
    --prevent-user-existence-errors ENABLED \
    --access-token-validity 60 --id-token-validity 60 --refresh-token-validity 30 \
    --token-validity-units AccessToken=minutes,IdToken=minutes,RefreshToken=days \
    --query UserPoolClient.ClientId --output text)
  echo "Cognito cliente $CLIENT: creado"
else
  echo "Cognito cliente $CLIENT: ya existe"
fi
POOL_ARN=$(aws cognito-idp describe-user-pool --user-pool-id "$POOL_ID" --query UserPool.Arn --output text)

# ---------------------------------------------------------------- salidas (sin secretos)
"$PYTHON" -I - "$TABLE" "$TABLE_ARN" "$BUCKET" "$QUEUE_URL" "$QUEUE_ARN" "$DLQ_URL" "$DLQ_ARN" "$POOL_ID" "$POOL_ARN" "$CLIENT_ID" <<'PY'
import sys
from pathlib import Path
keys = ["DATA_TABLE", "DATA_TABLE_ARN", "CORPUS_BUCKET", "INGEST_QUEUE_URL", "INGEST_QUEUE_ARN", "INGEST_DLQ_URL",
        "INGEST_DLQ_ARN", "USER_POOL_ID", "USER_POOL_ARN", "USER_POOL_CLIENT_ID"]
p = Path("infra/outputs.env")
lines = [s for s in p.read_text().splitlines() if not any(s.startswith("export " + k + "=") for k in keys)]
lines.extend(f'export {k}="{v}"' for k, v in zip(keys, sys.argv[1:]))
p.write_text("\n".join(lines) + "\n")
PY
echo "30_data: OK. Salidas en infra/outputs.env (ninguna es un secreto; el cliente de Cognito es público)."
