[Unit]
Description=Carwash OCR Worker
After=network.target
ConditionPathExists=__CARWASH_APP_ROOT__/scripts/ocr/worker_server.py

[Service]
Type=simple
User=__CARWASH_USER__
WorkingDirectory=__CARWASH_APP_ROOT__
Environment=PATH=__CARWASH_NODE_BIN_DIR__:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=PLATE_WORKER_HOST=127.0.0.1
Environment=PLATE_WORKER_PORT=3101
Environment=PLATE_READER_PYTHON=__CARWASH_APP_ROOT__/.venv-ocr/bin/python
ExecStart=/bin/bash -lc 'exec "${PLATE_READER_PYTHON}" "__CARWASH_APP_ROOT__/scripts/ocr/worker_server.py" --host "${PLATE_WORKER_HOST}" --port "${PLATE_WORKER_PORT}"'
Restart=always
RestartSec=5
CPUQuota=150%
Nice=10

[Install]
WantedBy=multi-user.target
