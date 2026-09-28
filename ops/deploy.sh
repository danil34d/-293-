#!/usr/bin/env bash
# ⛔ УСТАРЕЛ (28.09.2026). Не запускать.
# Скрипт делает `git reset --hard origin/main`, а origin/main на GitHub разошёлся
# с продом (squash-PR, на проде 146 коммитов не в GitHub). Запуск откатит прод
# на майскую версию. Деплой — только по правилам навыка prod-deploy-guard:
#   git push carwash:/home/carwash/Project <ветка>:<ветка>
#   ssh carwash 'cd /home/carwash/Project && git merge --ff-only <ветка> && DATA_SOURCE=postgres npm run build && sudo systemctl restart carwash-web'
echo "⛔ $(basename "$0") устарел и откатил бы прод на origin/main. Деплой — через prod-deploy-guard (см. комментарий в начале файла)." >&2
exit 1

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


