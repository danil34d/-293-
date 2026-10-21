import type { DemoState } from './demo-model';

// Только учебная смена. Ключ не используется для рабочих моек и учётных записей.
export const DEMO_STORAGE_KEY = 'zorin:p06:reconciliation-demo:v1';
export interface DemoStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface DemoStorageLocks {
  request<T>(name: string, callback: () => T | Promise<T>): Promise<T>;
}

/** Проверка ревизии и запись выполняются под одной блокировкой во всех вкладках. */
export async function withDemoStorageLock<T>(
  locks: DemoStorageLocks | null | undefined,
  action: () => T | Promise<T>,
  key: string = DEMO_STORAGE_KEY,
): Promise<T> {
  if (!locks || typeof locks.request !== 'function') {
    throw new Error('Браузер не поддерживает безопасную блокировку сохранения между вкладками. Запись отключена: откройте прототип в актуальном браузере по localhost или HTTPS.');
  }
  return locks.request<T>(key, action);
}

export function loadDemo(storage: DemoStorage, validate: (value: unknown) => DemoState, key: string = DEMO_STORAGE_KEY): DemoState | null {
  const raw = storage.getItem(key);
  if (raw === null) return null;
  try {
    return validate(JSON.parse(raw));
  } catch {
    throw new Error('Сохранённая тестовая смена повреждена или имеет другую версию. Она не перезаписана. Можно скачать копию и начать заново.');
  }
}

/** Вызывать внутри withDemoStorageLock, чтобы проверка ревизии и запись были неделимы. */
export function persistDemo(
  storage: DemoStorage,
  next: DemoState,
  expectedRevision: number,
  validate: (value: unknown) => DemoState,
  key: string = DEMO_STORAGE_KEY,
): void {
  const current = loadDemo(storage, validate, key);
  if ((current?.revision ?? 0) !== expectedRevision) {
    throw new Error('Смена изменена в другом окне. Загрузите сохранённую версию перед следующей записью.');
  }
  const payload = JSON.stringify(validate(next));
  storage.setItem(key, payload);
  if (storage.getItem(key) !== payload) {
    throw new Error('Не удалось подтвердить сохранение. Введённые поля остаются на экране.');
  }
}
