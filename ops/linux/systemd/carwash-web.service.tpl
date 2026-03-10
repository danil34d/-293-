[Unit]
Description=Carwash Next.js Web App
After=network.target

[Service]
Type=simple
User=__CARWASH_USER__
WorkingDirectory=__CARWASH_APP_ROOT__
Environment=PATH=__CARWASH_NODE_BIN_DIR__:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=NODE_ENV=production
ExecStart=__CARWASH_APP_ROOT__/node_modules/.bin/next start -H 0.0.0.0 -p 3000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
