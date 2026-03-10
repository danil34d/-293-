[Unit]
Description=Carwash storage discovery and mount
After=local-fs.target
Before=carwash-provision.service carwash-web.service carwash-bot.service

[Service]
Type=oneshot
EnvironmentFile=-/etc/default/carwash
ExecStart=/usr/local/bin/carwash-storage-ensure.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
