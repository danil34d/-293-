# Linux Ops

This directory contains the Linux-side deployment artifacts that were used to bring up the current Ubuntu VM.

Current VM defaults:

- app root: `/home/danil/apps/carwash-app`
- local Node.js: `/home/danil/opt/node`
- web port: `3000`
- web systemd unit: `carwash-web.service`
- bot systemd unit: `carwash-bot.service`

Typical flow on the Ubuntu VM:

```bash
bash ops/linux/bootstrap.sh
tar -xf /home/danil/apps/carwash-vm-deploy.tar -C /home/danil/apps/carwash-app
bash ops/linux/deploy-run.sh
bash ops/linux/install-services.sh
```

Useful checks:

```bash
bash ops/linux/build-only.sh
bash ops/linux/bot-smoke.sh
bash ops/linux/ocr-smoke.sh
sudo systemctl status carwash-ocr-worker.service carwash-web.service carwash-bot.service --no-pager
```

From the Windows host, stable access to the VM is provided by:

- `START-VM-ACCESS.ps1`
- `STOP-VM-ACCESS.ps1`

After `START-VM-ACCESS.ps1`:

- web: `http://127.0.0.1:13000/login`
- ssh: `ssh -p 12222 -i "%USERPROFILE%\\.ssh\\carwash_vm_ed25519" danil@127.0.0.1`
