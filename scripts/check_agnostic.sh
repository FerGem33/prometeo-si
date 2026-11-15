#!/usr/bin/env bash
# Falla si el motor o la capa GenUI contienen vocabulario del dominio. Deben servir para cualquier corpus.
set -euo pipefail
cd "$(dirname "$0")/.."
WORDS='flame|fire|oxygen|habitat|psi|moon|lunar|combust|nasa'
DIRS=(web/src/engine/ web/src/genui/ web/src/components/genui/)
FOUND=0
for d in "${DIRS[@]}"; do
  [ -d "$d" ] || continue
  if grep -rniE "$WORDS" "$d" --include='*.ts' --include='*.tsx' --exclude='*.test.ts' --exclude='*.test.tsx'; then
    FOUND=1
  fi
done
if [ "$FOUND" -ne 0 ]; then
  echo "check_agnostic: contiene vocabulario de dominio (ver líneas arriba)" >&2
  exit 1
fi
echo "check_agnostic: OK"
