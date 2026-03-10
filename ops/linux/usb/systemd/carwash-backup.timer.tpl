[Unit]
Description=Daily Carwash Backup Timer (USB)

[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true
Unit=carwash-backup.service

[Install]
WantedBy=timers.target
