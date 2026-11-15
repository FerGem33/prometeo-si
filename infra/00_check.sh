#!/usr/bin/env bash
# Comprueba identidad de AWS, lista modelos/perfiles de Anthropic en Bedrock y hace una invocación de prueba.
# Uso: export AWS_PROFILE=prometeo && infra/00_check.sh [MODEL_ID]
set -euo pipefail
cd "$(dirname "$0")/.."
source infra/config.env
MODEL="${1:-$MODEL_ID}"

echo "== Identidad"
aws sts get-caller-identity --output table

echo "== Modelos de Anthropic en $REGION"
aws bedrock list-foundation-models --region "$REGION" --by-provider anthropic \
  --query 'modelSummaries[].[modelId,modelLifecycle.status]' --output table

echo "== Perfiles de inferencia de Anthropic"
aws bedrock list-inference-profiles --region "$REGION" \
  --query "inferenceProfileSummaries[?contains(inferenceProfileId, 'anthropic')].[inferenceProfileId,status]" --output table

if [ -z "$MODEL" ]; then
  echo "MODEL_ID vacío: elige un ID de las tablas de arriba, ponlo en infra/config.env y vuelve a correr." >&2
  exit 2
fi

echo "== Invocación de prueba con $MODEL"
aws bedrock-runtime converse --region "$REGION" --model-id "$MODEL" \
  --messages '[{"role":"user","content":[{"text":"Reply with the single word: ok"}]}]' \
  --inference-config '{"maxTokens":16}' \
  --query 'output.message.content[0].text' --output text
echo "00_check: OK ($MODEL)"
