#!/usr/bin/env bash
# deploy-from-repo.sh — подтягивает код из GitHub в /srv/carwash/repo
# и выкатывает в /srv/carwash/app с сохранением данных и конфигов.
#
# Использование:
#   sudo bash /srv/carwash/repo/ops/linux/deploy-from-repo.sh
#
# Или из любого места:
#   sudo bash deploy-from-repo.sh
#
# Безопасность:
#   - data/, .env.local, telegram-bot/.env.local, node_modules — НЕ затираются
#   - перед деплоем делается бэкап текущего app
#   - если npm build упадёт — откатываемся на бэкап

set -euo pipefail

REPO_DIR="${CARWASH_REPO_DIR:-/srv/carwash/repo}"
APP_DIR="${CARWASH_APP_DIR:-/srv/carwash/app}"
BACKUP_DIR="/srv/carwash/backups/deploy"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_PATH="${BACKUP_DIR}/app-before-${TIMESTAMP}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn() { echo -e "${YELLOW}[deploy]${NC} $*"; }
fail() { echo -e "${RED}[deploy]${NC} $*" >&2; exit 1; }

# --- Проверки ---
[[ -d "$REPO_DIR/.git" ]] || fail "Git-репо не найден: $REPO_DIR"
[[ -d "$APP_DIR" ]]        || fail "App-папка не найдена: $APP_DIR"

# --- Шаг 1: git pull ---
log "Подтягиваю код из GitHub..."
cd "$REPO_DIR"
git fetch origin
LOCAL_HASH=$(git rev-parse HEAD)
REMOTE_HASH=$(git rev-parse origin/main)

if [[ "$LOCAL_HASH" == "$REMOTE_HASH" ]]; then
  warn "Локальный repo уже на последнем коммите: ${LOCAL_HASH:0:8}"
  warn "Продолжаю деплой (на случай если app отстаёт от repo)."
else
  log "Обновляю repo: ${LOCAL_HASH:0:8} → ${REMOTE_HASH:0:8}"
  git reset --hard origin/main
fi

DEPLOY_HASH=$(git rev-parse --short HEAD)
DEPLOY_MSG=$(git log -1 --pretty=format:'%s')
log "Деплою коммит: ${DEPLOY_HASH} — ${DEPLOY_MSG}"

# --- Шаг 2: бэкап текущего app ---
log "Бэкаплю текущий app → ${BACKUP_PATH}..."
mkdir -p "$BACKUP_DIR"
cp -a "$APP_DIR" "$BACKUP_PATH"

# --- Шаг 3: синхронизация кода ---
log "Синхронизирую код repo → app..."

# Список того, что НЕ трогаем в app
EXCLUDE_LIST=(
  "data/"
  ".env.local"
  "telegram-bot/.env.local"
  "telegram-bot/data/"
  "node_modules/"
  ".next/"
  ".git/"
  "backups/"
)

RSYNC_EXCLUDES=()
for item in "${EXCLUDE_LIST[@]}"; do
  RSYNC_EXCLUDES+=(--exclude "$item")
done

rsync -a --delete "${RSYNC_EXCLUDES[@]}" "${REPO_DIR}/" "${APP_DIR}/"

# --- Шаг 4: npm install (если package.json изменился) ---
cd "$APP_DIR"

REPO_PKG_HASH=$(md5sum "${REPO_DIR}/package.json" | cut -d' ' -f1)
if [[ -f ".deploy-pkg-hash" ]]; then
  OLD_PKG_HASH=$(cat .deploy-pkg-hash)
else
  OLD_PKG_HASH=""
fi

if [[ "$REPO_PKG_HASH" != "$OLD_PKG_HASH" ]]; then
  log "package.json изменился — запускаю npm install..."
  npm install --production 2>&1 | tail -5
  echo "$REPO_PKG_HASH" > .deploy-pkg-hash
else
  log "package.json не изменился — пропускаю npm install."
fi

# --- Шаг 5: build ---
log "Собираю проект..."
if ! npm run build 2>&1 | tail -20; then
  warn "BUILD FAILED! Откатываю на бэкап..."
  rm -rf "$APP_DIR"
  mv "$BACKUP_PATH" "$APP_DIR"
  fail "Деплой отменён. App восстановлен из бэкапа."
fi

# --- Шаг 6: перезапуск сервисов ---
log "Перезапускаю сервисы..."
systemctl restart carwash-web.service  2>/dev/null || warn "carwash-web не перезапущен"
systemctl restart carwash-bot.service  2>/dev/null || warn "carwash-bot не перезапущен"

# Ждём 3 секунды и проверяем
sleep 3
WEB_STATE=$(systemctl is-active carwash-web.service 2>/dev/null || echo "unknown")
BOT_STATE=$(systemctl is-active carwash-bot.service 2>/dev/null || echo "unknown")

if [[ "$WEB_STATE" == "active" && "$BOT_STATE" == "active" ]]; then
  log "Сервисы работают: web=${WEB_STATE}, bot=${BOT_STATE}"
else
  warn "Проверь сервисы вручную: web=${WEB_STATE}, bot=${BOT_STATE}"
fi

# --- Шаг 7: записываем версию ---
echo "${DEPLOY_HASH} ${TIMESTAMP} ${DEPLOY_MSG}" >> "${APP_DIR}/.deploy-history"

# --- Готово ---
log ""
log "Деплой завершён!"
log "  Коммит:  ${DEPLOY_HASH} — ${DEPLOY_MSG}"
log "  Бэкап:   ${BACKUP_PATH}"
log "  Web:     ${WEB_STATE}"
log "  Bot:     ${BOT_STATE}"
