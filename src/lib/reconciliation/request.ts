import { z } from 'zod';

export function isSameOrigin(origin: string | null, host: string | null, protocol: string): boolean {
  if (!origin || !host) return false;
  try {
    const source = new URL(origin);
    // Next может нормализовать 127.0.0.1 в localhost во внутреннем URL.
    // Host — адрес реального HTTP-запроса, браузер не позволяет странице подменять его.
    return source.origin === origin && source.host.toLowerCase() === host.toLowerCase() && source.protocol === protocol;
  } catch { return false; }
}

const fields = z.object({
  plate: z.string().max(40), paperRow: z.string().max(8), company: z.string().max(160),
  payment: z.string().max(80), washType: z.string().max(100), wash: z.string().max(200), price: z.string().max(40),
  employee1: z.string().max(120), employee2: z.string().max(120),
  additional: z.array(z.object({ name: z.string().max(160), price: z.string().max(40) }).strict()).max(12),
}).strict();
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const paperRow = z.object({
  row: z.string().min(1).max(8), time: z.string().max(5), plate: z.string().max(40),
  wash: z.string().max(200), price: z.string().max(40), employee1: z.string().max(120), employee2: z.string().max(120), note: z.string().max(1200).optional(),
}).strict();
export const reconciliationRequestSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), period: z.enum(['day', 'night']),
  expectedRevision: z.number().int().min(0).max(2147483645),
  command: z.discriminatedUnion('type', [
    z.object({ type: z.literal('refresh') }).strict(),
    z.object({ type: z.literal('save'), id, fields }).strict(),
    z.object({ type: z.literal('review'), id, status: z.enum(['pending', 'verified', 'question', 'explained']), reason: z.string().max(120), note: z.string().max(1200) }).strict(),
    z.object({ type: z.literal('add-paper'), id }).strict(),
    z.object({ type: z.literal('remove-paper'), id }).strict(),
    z.object({ type: z.literal('merge'), ids: z.array(id).min(2).max(1000) }).strict(),
    z.object({ type: z.literal('unmerge'), id }).strict(),
    z.object({ type: z.literal('set-paper'), rows: z.array(paperRow).max(1000), confirmed: z.boolean() }).strict(),
    z.object({ type: z.literal('finish-review') }).strict(),
    z.object({ type: z.literal('complete') }).strict(),
  ]),
}).strict();

export async function readReconciliationBody(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error('Ожидался JSON.');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Пустое действие.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1024 * 1024) { await reader.cancel(); throw new Error('Действие слишком большого размера.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const content = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { content.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(content)); } catch { throw new Error('Повреждённый JSON.'); }
}
