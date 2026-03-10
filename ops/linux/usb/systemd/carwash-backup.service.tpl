[Unit]
Description=Carwash Backup (USB)
After=network-online.target carwash-storage-check.service
Wants=network-online.target carwash-storage-check.service
RequiresMountsFor=__CARWASH_MOUNT_POINT__

[Service]
Type=oneshot
ExecStartPre=/bin/bash -lc 'mountpoint -q "__CARWASH_MOUNT_POINT__"'
ExecStart=/usr/local/bin/carwash-backup-create.sh
