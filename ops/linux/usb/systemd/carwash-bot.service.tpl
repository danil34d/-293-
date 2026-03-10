[Unit]
Description=Carwash Telegram Worker (USB)
After=network-online.target carwash-web.service
Wants=network-online.target carwash-web.service
Requires=carwash-web.service
ConditionPathExists=__CARWASH_APP_ROOT__/telegram-bot/worker.mjs

[Service]
Type=simple
User=__CARWASH_USER__
WorkingDirectory=__CARWASH_APP_ROOT__
EnvironmentFile=-/etc/default/carwash
Environment=PATH=__CARWASH_NODE_BIN_DIR__:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStartPre=/usr/local/bin/carwash-storage-ensure.sh --no-create
ExecStartPre=/bin/bash -lc 'for i in {1..60}; do curl -fsS http://127.0.0.1:3000/login >/dev/null && exit 0; sleep 2; done; exit 1'
ExecStart=__CARWASH_NODE_BIN_DIR__/npm run bot:telegram
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
