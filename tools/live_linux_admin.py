#!/usr/bin/env python3
import argparse
import os
import stat
import sys

import paramiko

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def connect(host: str, user: str, password: str) -> paramiko.SSHClient:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, username=user, password=password, timeout=20)
    return client


def run_command(client: paramiko.SSHClient, command: str) -> int:
    stdin, stdout, stderr = client.exec_command(command, get_pty=True)
    out = stdout.read().decode("utf-8", "ignore")
    err = stderr.read().decode("utf-8", "ignore")
    sys.stdout.write(out)
    if err.strip():
        sys.stderr.write(err)
    return stdout.channel.recv_exit_status()


def upload_file(client: paramiko.SSHClient, local_path: str, remote_path: str, mode: int | None) -> None:
    sftp = client.open_sftp()
    try:
        sftp.put(local_path, remote_path)
        if mode is not None:
            sftp.chmod(remote_path, mode)
    finally:
        sftp.close()


def parse_mode(value: str | None) -> int | None:
    if value is None:
        return None
    return int(value, 8)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run commands or upload files to the live Linux box.")
    parser.add_argument("--host", required=True)
    parser.add_argument("--user", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--run", help="Remote shell command to execute")
    parser.add_argument("--upload", nargs=2, metavar=("LOCAL", "REMOTE"), help="Upload one file")
    parser.add_argument("--mode", help="Optional octal chmod applied after upload, for example 0755")
    args = parser.parse_args()

    if not args.run and not args.upload:
        parser.error("use --run and/or --upload")

    client = connect(args.host, args.user, args.password)
    try:
        if args.upload:
            local_path, remote_path = args.upload
            upload_file(client, local_path, remote_path, parse_mode(args.mode))
        if args.run:
            return run_command(client, args.run)
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
