#!/usr/bin/env bash
# Falla si el motor contiene vocabulario del dominio. El motor debe servir para cualquier corpus.
set -euo pipefail
cd "$(dirname "$0")/.."
WORDS='flame|fire|oxygen|habitat|psi|moon|lunar|combust|nasa'
if grep -rniE "$WORDS" web/src/engine/ --include='*.ts' --exclude='*.test.ts'; then
  echo "check_agnostic: el motor contiene vocabulario de dominio (ver líneas arriba)" >&2
  exit 1
fi
echo "check_agnostic: OK"
