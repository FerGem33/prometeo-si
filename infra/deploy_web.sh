#!/usr/bin/env bash
# Publica únicamente en el bucket T08 de esta cuenta.
set -euo pipefail
cd "$(dirname "$0")/.."
export AWS_PROFILE=prometeo AWS_PAGER=""
source infra/config.env
# Endpoint regional oficial; evita resolución virtual del bucket en redes con DNS intervenido.
export AWS_ENDPOINT_URL_S3="https://s3.${REGION}.amazonaws.com"
source infra/outputs.env
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
[[ "$WEB_BUCKET" == "${PROJECT}-web-${ACCOUNT}" ]] || { echo 'Bucket no pertenece al despliegue esperado' >&2; exit 1; }
ORIGIN=$(aws cloudfront get-distribution --id "$CF_ID" --query 'Distribution.DistributionConfig.Origins.Items[0].DomainName' --output text)
[[ "$ORIGIN" == "${WEB_BUCKET}.s3.${REGION}.amazonaws.com" ]] || { echo 'Distribución y bucket no coinciden' >&2; exit 1; }
export VITE_API_URL="${API_URL:-}"
npm --prefix web run build
# Sin borrado remoto automático: AGENTS exige confirmación antes de borrar recursos.
aws s3 sync web/dist "s3://${WEB_BUCKET}" --only-show-errors
aws cloudfront create-invalidation --distribution-id "$CF_ID" --paths '/*'
printf 'Publicado: %s (esperar propagación de CloudFront)\n' "$CF_URL"
