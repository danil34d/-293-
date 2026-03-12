#!/usr/bin/env markdown
# USB Linux Layer

This directory contains the USB-first Linux tooling for the carwash project.

Target shape:

- Ubuntu boots from the removable USB device.
- The heavy runtime and persistent project data live on an internal disk
  partition labeled `CARWASH_DATA`.
- The local machine opens the app in Firefox automatically.
- The same app is reachable from other machines over the LAN on port `3000`.

Main entrypoints:

- `build-seed-archive.sh`
  - builds the repo seed archive copied onto the USB OS image
- `install-usb-platform.sh`
  - configures a booted Ubuntu system as the reusable USB OS layer
- `storage-ensure.sh`
  - finds or creates the internal `CARWASH_DATA` partition and mounts it
- `provision-firstboot.sh`
  - unpacks the seed archive, installs runtime dependencies, builds the app,
    sets up OCR, and starts services
- `install-runtime-services.sh`
  - installs USB-specific systemd services, `/etc/default/carwash`, XDG autostart,
    and the Xfce kiosk/session policy
- `create-removable-rootfs.sh`
  - creates the actual bootable USB Linux rootfs onto a target disk from a
    Linux host

Recommended flow:

1. Build `dist/usb/carwash-usb-seed.tar.gz`.
2. Create the USB rootfs onto the removable drive.
3. Boot the new machine from USB.
4. Let the first-boot provisioning move the heavy runtime onto
   `LABEL=CARWASH_DATA`.
