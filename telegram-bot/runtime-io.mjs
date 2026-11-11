import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

// Читатель получает либо прежний целый JSON, либо новый целый документ.
export async function writeJsonAtomic(filePath, serialized, io = fs) {
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  try {
    await io.writeFile(temporary, serialized, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await io.rename(temporary, filePath);
  } finally {
    await io.unlink(temporary).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

export function createJsonPersister(writer = writeJsonAtomic) {
  let queue = Promise.resolve();
  return (entries) => {
    // Фиксируем данные до ожидания: поздние изменения не меняют прежнее сохранение.
    const snapshot = entries.map(([file, value]) => [file, JSON.stringify(value, null, 2)]);
    const next = queue.then(async () => {
      for (const [file, serialized] of snapshot) await writer(file, serialized);
    });
    queue = next.catch(() => {});
    return next;
  };
}

export function dateKey(timeZone, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = (name) => parts.find((item) => item.type === name).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function telegramTimeoutMs(method, pollingSeconds) {
  return method === 'getUpdates' ? (pollingSeconds + 15) * 1000 : 15000;
}
