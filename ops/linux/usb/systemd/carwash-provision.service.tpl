[Unit]
Description=Carwash first-boot provisioning
After=network-online.target carwash-storage-check.service
Wants=network-online.target
Requires=carwash-storage-check.service
Before=carwash-web.service carwash-bot.service

[Service]
Type=oneshot
EnvironmentFile=-/etc/default/carwash
ExecStart=/usr/local/bin/carwash-firstboot-provision.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
