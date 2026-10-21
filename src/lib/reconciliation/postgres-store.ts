import type { LiveReconciliation } from './live-types';
import { validateLiveReconciliation } from './live-model';

export interface SqlConnection {
  query<T>(sql: string, values: unknown[]): Promise<T[]>;
}
export interface SqlDatabase extends SqlConnection {
  transaction<T>(work: (connection: SqlConnection) => Promise<T>): Promise<T>;
}
export class ReconciliationConflict extends Error {
  constructor() { super('Сверка изменена в другом окне. Загрузите последнюю версию; ваш ввод остаётся на экране.'); }
}

export function createPostgresReconciliationStore(db: SqlDatabase) {
  async function read(id: string): Promise<LiveReconciliation | null> {
    const rows = await db.query<{ document: unknown; revision: number }>(
      'SELECT "document", "revision" FROM "ReconciliationShift" WHERE "id" = $1', [id]);
    if (!rows.length) return null;
    const doc = validateLiveReconciliation(rows[0].document);
    if (doc.state.shiftId !== id || doc.state.revision !== rows[0].revision) throw new Error('Сохранённая версия сверки повреждена.');
    return doc;
  }

  async function write(document: LiveReconciliation, expectedRevision: number, actorId: string, action: string): Promise<LiveReconciliation> {
    const doc = validateLiveReconciliation(document);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || doc.state.revision !== expectedRevision + 1) {
      throw new Error('Неверная версия сохраняемой сверки.');
    }
    if (!actorId || actorId.length > 120 || !action || action.length > 80) throw new Error('Не указан автор или действие сверки.');
    const id = doc.state.shiftId;
    const payload = JSON.stringify(doc);
    if (Buffer.byteLength(payload) > 8 * 1024 * 1024) throw new Error('Сверка превышает допустимый размер.');
    return db.transaction(async tx => {
      // INSERT ... ON CONFLICT сериализует одновременное первое сохранение смены.
      if (expectedRevision === 0) {
        const created = await tx.query<{ id: string }>(
          'INSERT INTO "ReconciliationShift" ("id", "date", "period", "revision", "document", "updatedAt") VALUES ($1,$2,$3,$4,$5::jsonb,CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING RETURNING "id"',
          [id, doc.shift.date, doc.shift.period, doc.state.revision, payload]);
        if (!created.length) throw new ReconciliationConflict();
      } else {
        const updated = await tx.query<{ id: string }>(
          'UPDATE "ReconciliationShift" SET "revision"=$1, "document"=$2::jsonb, "updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$3 AND "revision"=$4 RETURNING "id"',
          [doc.state.revision, payload, id, expectedRevision]);
        if (!updated.length) throw new ReconciliationConflict();
      }
      await tx.query(
        'INSERT INTO "ReconciliationRevision" ("shiftId", "revision", "actorId", "action", "document") VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING "revision"',
        [id, doc.state.revision, actorId, action, payload]);
      return doc;
    });
  }

  async function history(id: string) {
    return db.query<{ revision: number; actorId: string; action: string; createdAt: Date }>(
      'SELECT "revision", "actorId", "action", "createdAt" FROM "ReconciliationRevision" WHERE "shiftId"=$1 ORDER BY "revision" DESC LIMIT 100', [id]);
  }

  async function list() {
    return db.query<{ id: string; date: string; period: string; revision: number; updatedAt: Date }>(
      'SELECT "id", "date", "period", "revision", "updatedAt" FROM "ReconciliationShift" ORDER BY "date" DESC, "period" DESC LIMIT 100', []);
  }
  async function readPaperImage(shiftId: string, id: string) {
    const rows = await db.query<{ mime: string; bytes: Uint8Array }>('SELECT "mime", "bytes" FROM "ReconciliationPaperImage" WHERE "id"=$1 AND "shiftId"=$2', [id, shiftId]);
    return rows[0] ?? null;
  }
  async function writePaperImage(document: LiveReconciliation, expectedRevision: number, actorId: string, mime: string, bytes: Uint8Array) {
    if (!document.paperImageId || !['image/jpeg', 'image/png', 'image/webp'].includes(mime) || bytes.length > 6 * 1024 * 1024) throw new Error('Некорректное фото журнала.');
    return db.transaction(async tx => {
      const nested = createPostgresReconciliationStore({ query: tx.query, transaction: work => work(tx) });
      const saved = await nested.write(document, expectedRevision, actorId, 'paper-image');
      await tx.query('INSERT INTO "ReconciliationPaperImage" ("id", "shiftId", "mime", "bytes") VALUES ($1,$2,$3,$4) RETURNING "id"', [document.paperImageId, document.state.shiftId, mime, Buffer.from(bytes)]);
      return saved;
    });
  }
  return { read, write, history, list, readPaperImage, writePaperImage };
}
