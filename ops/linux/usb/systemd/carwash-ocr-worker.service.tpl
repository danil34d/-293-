[Unit]
Description=Carwash OCR Worker (USB)
After=network-online.target carwash-provision.service
Wants=network-online.target carwash-provision.service
Requires=carwash-provision.service
ConditionPathExists=__CARWASH_APP_ROOT__/scripts/ocr/worker_server.py

[Service]
Type=simple
User=__CARWASH_USER__
WorkingDirectory=__CARWASH_APP_ROOT__
EnvironmentFile=-/etc/default/carwash
Environment=PATH=__CARWASH_NODE_BIN_DIR__:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStartPre=/usr/local/bin/carwash-storage-ensure.sh --no-create
ExecStart=/bin/bash -lc 'exec "${PLATE_READER_PYTHON:-__CARWASH_APP_ROOT__/.venv-ocr/bin/python}" "__CARWASH_APP_ROOT__/scripts/ocr/worker_server.py" --host "${PLATE_WORKER_HOST:-127.0.0.1}" --port "${PLATE_WORKER_PORT:-3101}"'
Restart=always
RestartSec=5
CPUQuota=150%
Nice=10

[Install]
WantedBy=multi-user.target
