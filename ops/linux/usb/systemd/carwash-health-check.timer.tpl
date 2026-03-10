[Unit]
Description=Carwash Health Check Timer (USB)

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
Persistent=true
Unit=carwash-health-check.service

[Install]
WantedBy=timers.target
