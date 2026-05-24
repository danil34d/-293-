# `@/lib/crypto` — Secret Encryption-at-Rest

Phase 61 / АРХ-5. Шифрует AI API ключ (и потенциально другие секреты) перед записью в SQLite.

## Зачем

Раньше (Phase 19) ключ `glm_api_key` в `data/ai-assistant.db` хранился plain text. Утечка файла БД = утечка ключа. Phase 19 решил проблему через ENV-приоритет (`process.env.GLM_API_KEY`), но если владелец вводит ключ через UI — он всё ещё plain.

Этот модуль добавляет AES-256-GCM шифрование значения **перед** записью и расшифровку при чтении.

## API

```ts
import { encryptSecret, decryptSecret, isEncrypted, isEncryptionAvailable }
  from '@/lib/crypto/secret-encryption';

const stored = encryptSecret('sk-proxy-abc...');  // → 'enc:v1:<iv>:<ct>:<tag>'
const plain  = decryptSecret(stored);             // → 'sk-proxy-abc...'

isEncrypted('plain-value');           // → false
isEncrypted('enc:v1:...');            // → true
isEncryptionAvailable();              // → true если master key задан и валиден
```

Все три читающие функции **idempotent и null-safe**:
- `null` / `undefined` / `''` возвращаются как есть
- `encryptSecret('enc:v1:...')` (уже зашифровано) → не шифрует повторно
- `decryptSecret('plain text')` → возвращает as-is (backward compat)

## Master key

Установите переменную окружения **до** старта приложения:

```bash
# Сгенерировать (одноразово):
openssl rand -hex 32
# → 9f3c1e8b4a7d2c6f1e8b4a7d2c6f1e8b4a7d2c6f1e8b4a7d2c6f1e8b4a7d2c6f

# Положить в .env / systemd EnvironmentFile:
AI_KEY_ENCRYPTION_SECRET=9f3c1e8b4a7d2c6f1e8b4a7d2c6f1e8b4a7d2c6f1e8b4a7d2c6f1e8b4a7d2c6f
```

Поддерживается hex (64 символа) или base64 (~44 символа). Любой другой формат → warning в консоль + шифрование отключается.

## Что будет без master key?

- **Dev (нет ключа):** `encryptSecret` возвращает plain text (один warning в консоль при первом вызове). Старые plain-значения в БД продолжают работать. Это намеренное поведение — dev-окружение не должно ломаться из-за отсутствия секретов.
- **Prod (нет ключа, старые plain значения в БД):** работает как было — Phase 19 ENV-приоритет покрывает «правильный» путь, БД-fallback всё ещё plain (warning в UI).
- **Prod (нет ключа, но значение в БД уже зашифровано, потому что когда-то был):** `decryptSecret` бросит **критический Error**. Это правильное поведение: молча возвращать байты-в-base64 как «ключ» — катастрофа.

## Format details

```
enc:v1:<iv-base64>:<ciphertext-base64>:<authTag-base64>
```

- `enc:v1:` — version prefix, позволит выпустить v2 (новый алгоритм / key rotation) с graceful migration.
- IV — 12 байт, рандомный per-encryption (GCM требует уникальный IV для каждого вызова с одним ключом).
- AuthTag — 16 байт, гарантирует integrity. Любая модификация ciphertext/IV → `decryptSecret` бросит exception.
- Алгоритм: `aes-256-gcm` через `node:crypto` (без внешних зависимостей).

## Migration: plain → encrypted

После того как `AI_KEY_ENCRYPTION_SECRET` выставлен и сервис рестартнут:

```bash
# POST: перешифровать существующие значения в SQLite settings таблице
curl -X POST http://192.168.1.150:3000/api/admin/encrypt-secrets \
  -H 'Cookie: employee_auth_sim=...'   # требуется admin-сессия
```

Endpoint находит все `settings.value` с известными «секретными» ключами (`glm_api_key`),
проверяет `isEncrypted` (skip если уже зашифровано), вызывает `encryptSecret`, пишет обратно.

Отчёт endpoint'а: `{ encrypted: N, skipped: M, errors: [...] }`.

Безопасно вызывать многократно — idempotent.

## Что НЕ делать

- Не коммитить `AI_KEY_ENCRYPTION_SECRET` в репозиторий. `.env.example` содержит placeholder.
- Не менять master key пока в БД есть зашифрованные значения — расшифровать их станет невозможно (потребуется отдельная миграция через старый ключ → plain → новый ключ).
- Не использовать `encryptSecret` для значений, которые читаются БЕЗ участия Node.js (e.g. напрямую из SQL по сети) — расшифровать сможет только этот код.
