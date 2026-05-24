/**
 * Phase 61 / АРХ-5: Encryption-at-rest для AI API ключа (и других секретов в SQLite).
 *
 * Алгоритм: AES-256-GCM (authenticated encryption, встроен в node:crypto).
 *
 * Master key:
 *   - читается из env `AI_KEY_ENCRYPTION_SECRET`
 *   - формат: 32 байта в hex (64 hex-символа) ИЛИ base64 (44 символа с padding)
 *   - сгенерировать: `openssl rand -hex 32`
 *   - если env пустой → encrypt/decrypt работают в pass-through режиме (warning в консоль)
 *     это позволяет dev-окружению работать без ключа и сохраняет обратную совместимость
 *
 * Stored value format:
 *   `enc:v1:<iv-base64>:<ciphertext-base64>:<authTag-base64>`
 *
 *   - префикс `enc:v1:` позволяет detect шифрования (для backward compat со старыми plain
 *     значениями) и future-versioning (v2 — смена алгоритма / ротация ключей).
 *   - IV (12 байт) — рандомный per-encryption (GCM требует уникальный IV)
 *   - authTag (16 байт) — гарантирует integrity (любая модификация → exception при decrypt)
 *
 * Backward compatibility:
 *   - значения БЕЗ префикса `enc:v1:` → считаются plain text, возвращаются as-is
 *   - encryptSecret(plain) без master key → возвращает plain (warning в логи)
 *   - decryptSecret(stored) без master key → если stored зашифрован, exception;
 *     если plain — возвращается as-is.
 *
 * Migration path:
 *   1. set env AI_KEY_ENCRYPTION_SECRET (32 hex bytes)
 *   2. restart server
 *   3. POST /api/admin/encrypt-secrets → перешифрует все plain glm_api_key/ai_base_url/ai_model
 *   4. UI badge в /ai-assistant покажет «Encrypted at rest»
 */

import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256-bit
const IV_LENGTH = 12;  // GCM standard
const AUTH_TAG_LENGTH = 16;
const ENC_PREFIX = 'enc:v1:';

// One-time warning flag (не спамим консоль при каждом вызове)
let _warnedMissingKey = false;

/**
 * Парсит master key из env. Возвращает Buffer (32 байта) или null если не задан/невалиден.
 *
 * Поддерживает форматы:
 *   - hex: 64 hex-символа
 *   - base64: ~44 символа (32 байта)
 */
function getMasterKey(): Buffer | null {
  const raw = process.env.AI_KEY_ENCRYPTION_SECRET;
  if (!raw || raw.trim() === '') {
    return null;
  }

  const trimmed = raw.trim();

  // Try hex
  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length === KEY_LENGTH * 2) {
    return Buffer.from(trimmed, 'hex');
  }

  // Try base64
  try {
    const buf = Buffer.from(trimmed, 'base64');
    if (buf.length === KEY_LENGTH) {
      return buf;
    }
  } catch {
    // fall through
  }

  // Invalid format — warn once and behave as no-key
  if (!_warnedMissingKey) {
    console.warn(
      `[secret-encryption] AI_KEY_ENCRYPTION_SECRET имеет невалидный формат. ` +
      `Ожидается 32 байта в hex (64 hex-символа) или base64. ` +
      `Шифрование отключено, секреты сохраняются plain text.`
    );
    _warnedMissingKey = true;
  }
  return null;
}

/**
 * Detect, является ли значение уже зашифрованным.
 *
 * Не парсит — только проверяет префикс. Дешёвая операция.
 */
export function isEncrypted(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

/**
 * Зашифровать plain text → enc:v1:<iv>:<ciphertext>:<authTag>.
 *
 * Поведение:
 *   - null/undefined/'' → возвращается как есть (нечего шифровать)
 *   - значение УЖЕ зашифровано (есть префикс) → возвращается as-is (idempotent)
 *   - master key не задан → возвращается plain (warning в консоль)
 *   - иначе → AES-256-GCM шифрование
 */
export function encryptSecret(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined || plain === '') {
    return plain ?? null;
  }

  // Idempotent: не шифруем дважды
  if (isEncrypted(plain)) {
    return plain;
  }

  const masterKey = getMasterKey();
  if (!masterKey) {
    if (!_warnedMissingKey) {
      console.warn(
        `[secret-encryption] AI_KEY_ENCRYPTION_SECRET не задан. ` +
        `Секрет сохраняется plain text. ` +
        `Для production выпуска сгенерируйте ключ: openssl rand -hex 32`
      );
      _warnedMissingKey = true;
    }
    return plain;
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, masterKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${ENC_PREFIX}${iv.toString('base64')}:${ciphertext.toString('base64')}:${authTag.toString('base64')}`;
}

/**
 * Расшифровать enc:v1:... → plain text.
 *
 * Поведение:
 *   - null/undefined/'' → возвращается as-is
 *   - значение БЕЗ префикса (plain) → возвращается as-is (backward compat)
 *   - значение зашифровано, но master key не задан → бросает Error
 *     (это критическая ошибка конфигурации: ключ зашифрован, расшифровать нечем)
 *   - формат битый или authTag не сошёлся → бросает Error
 */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (stored === null || stored === undefined || stored === '') {
    return stored ?? null;
  }

  if (!isEncrypted(stored)) {
    // Plain text — backward compat
    return stored;
  }

  const masterKey = getMasterKey();
  if (!masterKey) {
    throw new Error(
      '[secret-encryption] Значение зашифровано (enc:v1:), но AI_KEY_ENCRYPTION_SECRET не задан. ' +
      'Установите env-переменную с master key (32 байта в hex/base64) и рестартните сервис.'
    );
  }

  const parts = stored.slice(ENC_PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error(`[secret-encryption] Невалидный формат зашифрованного значения (ожидается 3 части, найдено ${parts.length})`);
  }

  const [ivB64, ciphertextB64, authTagB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');

  if (iv.length !== IV_LENGTH) {
    throw new Error(`[secret-encryption] Невалидная длина IV (${iv.length}, ожидается ${IV_LENGTH})`);
  }
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(`[secret-encryption] Невалидная длина authTag (${authTag.length}, ожидается ${AUTH_TAG_LENGTH})`);
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, masterKey, iv);
  decipher.setAuthTag(authTag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString('utf8');
}

/**
 * Утилита для UI/диагностики: можно ли реально шифровать (master key валиден)?
 *
 * Не раскрывает сам ключ — только boolean.
 */
export function isEncryptionAvailable(): boolean {
  return getMasterKey() !== null;
}
