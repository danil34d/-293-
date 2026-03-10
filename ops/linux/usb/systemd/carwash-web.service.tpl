[Unit]
Description=Carwash Next.js Web App (USB)
After=network-online.target carwash-provision.service
Wants=network-online.target carwash-provision.service
Requires=carwash-provision.service
ConditionPathExists=__CARWASH_APP_ROOT__/package.json
ConditionPathExists=__CARWASH_APP_ROOT__/node_modules

[Service]
Type=simple
User=__CARWASH_USER__
WorkingDirectory=__CARWASH_APP_ROOT__
EnvironmentFile=-/etc/default/carwash
Environment=PATH=__CARWASH_NODE_BIN_DIR__:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStartPre=/usr/local/bin/carwash-storage-ensure.sh --no-create
ExecStart=__CARWASH_APP_ROOT__/node_modules/.bin/next start -H 0.0.0.0 -p 3000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
