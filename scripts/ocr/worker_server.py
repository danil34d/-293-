#!/usr/bin/env python3
"""
Long-running OCR worker for local Linux usage.

The worker keeps RapidOCR loaded in memory and exposes a tiny localhost HTTP API:

  GET  /health
  POST /recognize   {"imageBase64": "..."}
"""

import argparse
import base64
import contextlib
import io
import json
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Lock

from plate_reader import (
    get_cached_reader,
    get_cached_engine_info,
    recognize_plate_from_bytes,
)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


REQUEST_LOCK = Lock()
MAX_BODY_BYTES = 15 * 1024 * 1024


def clean_base64_payload(value):
    raw = (value or "").strip()
    if raw.startswith("data:") and "," in raw:
        raw = raw.split(",", 1)[1]
    return raw


def load_image_bytes(image_base64):
    clean = clean_base64_payload(image_base64)
    if not clean:
        raise ValueError("imageBase64 is required")
    try:
        return base64.b64decode(clean, validate=False)
    except Exception as error:
        raise ValueError(f"invalid imageBase64: {error}") from error


class OcrWorkerHandler(BaseHTTPRequestHandler):
    server_version = "CarwashOCRWorker/1.0"

    def log_message(self, format, *args):
        sys.stderr.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), format % args))

    def write_json(self, payload, status=200):
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self):
        if self.path != "/health":
            self.write_json({"ok": False, "error": "not_found"}, status=404)
            return

        engine, engine_reason = get_cached_engine_info()
        self.write_json(
            {
                "ok": True,
                "engine": engine,
                "engineReason": engine_reason,
            }
        )

    def do_POST(self):
        if self.path != "/recognize":
            self.write_json({"ok": False, "error": "not_found"}, status=404)
            return

        content_length = int(self.headers.get("Content-Length", "0") or "0")
        if content_length <= 0:
            self.write_json({"success": False, "error": "request body is empty"}, status=400)
            return
        if content_length > MAX_BODY_BYTES:
            self.write_json({"success": False, "error": "request body is too large"}, status=413)
            return

        try:
            raw_body = self.rfile.read(content_length)
            payload = json.loads(raw_body.decode("utf-8"))
            image_bytes = load_image_bytes(payload.get("imageBase64"))
        except ValueError as error:
            self.write_json({"success": False, "error": str(error)}, status=400)
            return
        except Exception as error:
            self.write_json({"success": False, "error": f"invalid json body: {error}"}, status=400)
            return

        started_at = time.time()
        stderr_buffer = io.StringIO()

        try:
            with REQUEST_LOCK, contextlib.redirect_stderr(stderr_buffer):
                reader_bundle = get_cached_reader(log_loading=False)
                engine, engine_reason = reader_bundle[1].value, reader_bundle[2]
                plate_number = recognize_plate_from_bytes(
                    image_bytes,
                    reader_bundle=reader_bundle,
                    log_loading=False,
                )

            stderr_output = stderr_buffer.getvalue().strip() or None
            elapsed_ms = round((time.time() - started_at) * 1000)

            if plate_number:
                self.write_json(
                    {
                        "success": True,
                        "plateNumber": plate_number,
                        "rawOutput": plate_number,
                        "stderr": stderr_output,
                        "engine": engine,
                        "engineReason": engine_reason,
                        "elapsedMs": elapsed_ms,
                    }
                )
                return

            self.write_json(
                {
                    "success": False,
                    "error": "Plate not recognized",
                    "rawOutput": "",
                    "stderr": stderr_output,
                    "engine": engine,
                    "engineReason": engine_reason,
                    "elapsedMs": elapsed_ms,
                }
            )
        except Exception as error:
            self.write_json(
                {
                    "success": False,
                    "error": str(error) or "worker_error",
                    "stderr": stderr_buffer.getvalue().strip() or None,
                },
                status=500,
            )


def main():
    parser = argparse.ArgumentParser(description="Run the carwash OCR worker.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=3101)
    parser.add_argument("--max-body-bytes", type=int, default=15 * 1024 * 1024)
    args = parser.parse_args()

    global MAX_BODY_BYTES
    MAX_BODY_BYTES = args.max_body_bytes

    started_at = time.time()
    reader_bundle = get_cached_reader(log_loading=True)
    engine, engine_reason = reader_bundle[1].value, reader_bundle[2]
    print(
        f"OCR worker ready on http://{args.host}:{args.port} "
        f"using {engine} ({engine_reason}) in {time.time() - started_at:.1f}s",
        file=sys.stderr,
    )

    server = HTTPServer((args.host, args.port), OcrWorkerHandler)
    server.serve_forever()


if __name__ == "__main__":
    main()
