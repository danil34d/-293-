[Unit]
Description=Carwash Firewall Configuration (USB)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/carwash-configure-firewall.sh
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
