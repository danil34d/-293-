#!/usr/bin/env bash

set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/carwash}"
COMPOSE_CMD="${COMPOSE_CMD:-docker compose}"

echo ">>> Switching to repo directory: ${REPO_DIR}"
cd "${REPO_DIR}"

echo ">>> Fetching latest code..."
git fetch --all --prune
git reset --hard origin/main

echo ">>> Building and restarting containers..."
${COMPOSE_CMD} build
${COMPOSE_CMD} up -d

echo ">>> Deployment finished."


