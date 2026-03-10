[Unit]
Description=Carwash Health Check (USB)
After=network-online.target carwash-web.service carwash-bot.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/carwash-health-check.sh
