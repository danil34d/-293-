import crypto from 'crypto';

const SALT_LENGTH = 16;
const KEY_LENGTH = 64;
const SCRYPT_OPTIONS: crypto.ScryptOptions = { N: 16384, r: 8, p: 1 };

/**
 * Хеширует пароль через scrypt (встроен в Node.js, не нужен bcrypt).
 * Формат: salt:hash (оба в hex)
 */
export async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(SALT_LENGTH).toString('hex');
    crypto.scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

/**
 * Проверяет пароль против хеша.
 * Поддерживает как хешированные (salt:hash), так и plain-text пароли (обратная совместимость).
 */
export async function verifyPassword(password: string, storedValue: string): Promise<boolean> {
  // Если storedValue содержит ":" и достаточно длинный — это хеш
  if (storedValue.includes(':') && storedValue.length > 40) {
    return new Promise((resolve, reject) => {
      const [salt, hash] = storedValue.split(':');
      if (!salt || !hash) { resolve(false); return; }
      crypto.scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS, (err, derivedKey) => {
        if (err) reject(err);
        else {
          const hashBuf = Buffer.from(hash, 'hex');
          if (hashBuf.length !== derivedKey.length) { resolve(false); return; }
          resolve(crypto.timingSafeEqual(hashBuf, derivedKey));
        }
      });
    });
  }

  // Обратная совместимость: пароль хранится в открытом виде
  // Timing-safe сравнение даже для plain-text
  const a = Buffer.from(password);
  const b = Buffer.from(storedValue);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Проверяет, является ли значение хешем (а не plain-text паролем).
 */
export function isPasswordHashed(value: string): boolean {
  return value.includes(':') && value.length > 40;
}
