#!/usr/bin/env bash

set -euo pipefail

APP_ROOT="${CARWASH_APP_ROOT:-$HOME/apps/carwash-app}"
NODE_HOME="${CARWASH_NODE_HOME:-$HOME/opt/node}"

export PATH="$NODE_HOME/bin:$PATH"

cd "$APP_ROOT"

bash scripts/linux-prepare.sh --with-ocr
"$APP_ROOT/.venv-ocr/bin/python" - <<'PY'
import cv2
import easyocr
import numpy
print("OCR_IMPORT_OK")
PY
