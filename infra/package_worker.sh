#!/usr/bin/env bash
# Package only: no AWS calls or deployment. Output stays outside Git.
set -euo pipefail
cd "$(dirname "$0")/.."
[[ $# == 1 && "$1" == /*.zip ]] || { echo 'Uso: bash infra/package_worker.sh /tmp/nuevo-worker.zip' >&2; exit 2; }
OUTPUT=$1
[[ ! -e "$OUTPUT" ]] || { echo 'La salida ya existe; elegir otra ruta' >&2; exit 2; }
PYTHON=${PYTHON:-python3.12}
"$PYTHON" -c 'import sys; assert sys.version_info[:2] == (3,12), "Se requiere Python 3.12"'
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
"$PYTHON" -m venv "$TMP/venv"
"$TMP/venv/bin/python" -m pip install --disable-pip-version-check --only-binary=:all: \
  --platform manylinux_2_28_aarch64 --platform manylinux2014_aarch64 \
  --implementation cp --python-version 3.12 --target "$TMP/package" -r api/requirements-worker.txt
cp api/ingest_worker.py api/ingest_propose.py "$TMP/package/"
cp pipeline/ingest.py "$TMP/package/ingest_core.py"
"$PYTHON" -I - "$TMP/package" "$OUTPUT" <<'PY'
import ast, sys
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root, output = Path(sys.argv[1]), Path(sys.argv[2])
for name in ('ingest_worker.py', 'ingest_propose.py', 'ingest_core.py'):
    ast.parse((root/name).read_text())
with ZipFile(output, 'x', ZIP_DEFLATED) as archive:
    for path in sorted(root.rglob('*')):
        if path.is_file() and '__pycache__' not in path.parts:
            archive.write(path, path.relative_to(root))
print('Paquete Linux arm64/Python 3.12 generado:', output)
PY
