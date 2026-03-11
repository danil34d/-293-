#!/usr/bin/env bash

set -euo pipefail

APP_ROOT="${CARWASH_APP_ROOT:-$PWD}"
NODE_HOME="${CARWASH_NODE_HOME:-$HOME/opt/node}"

export PATH="$NODE_HOME/bin:$PATH"

cd "$APP_ROOT"

if [[ -x scripts/linux-prepare.sh ]]; then
  bash scripts/linux-prepare.sh --with-ocr
else
  echo "scripts/linux-prepare.sh not found; using existing OCR environment" >&2
fi

"$APP_ROOT/.venv-ocr/bin/python" - <<'PY'
import importlib.util
from pathlib import Path

import cv2
import numpy
import onnxruntime as ort
import rapidocr

print("OCR_IMPORT_OK")
print(f"ORT_PROVIDERS={ort.get_available_providers()}")

try:
    import openvino
    print(f"OPENVINO_OK={getattr(openvino, '__version__', 'unknown')}")
except Exception as error:
    print(f"OPENVINO_MISSING={error}")

plate_reader_path = Path("scripts/ocr/plate_reader.py").resolve()
spec = importlib.util.spec_from_file_location("plate_reader", plate_reader_path)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)
reader, engine_type, engine_reason = module.build_reader()
print(f"OCR_ENGINE={engine_type.value}")
print(f"OCR_ENGINE_REASON={engine_reason}")
PY
