import { createHash } from 'node:crypto';
import type { CameraObservation, CameraSnapshot, ShiftKey } from './live-types';
import { shiftBounds, validateShift } from './shift';

function optionalString(value: unknown, limit = 500): string {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > limit) throw new Error('Камера вернула неверное текстовое поле.');
  return value;
}

/** В отличие от старой очереди, ошибка API никогда не превращается в пустой список. */
export function parseCameraSnapshot(payload: unknown, shift: ShiftKey, retrievedAt: string): CameraSnapshot {
  const { start, end } = shiftBounds(shift);
  if (!Number.isFinite(Date.parse(retrievedAt))) throw new Error('Некорректное время загрузки.');
  if (!Array.isArray(payload) || payload.length > 5000) throw new Error('Камера вернула неверный список заездов.');
  const observations: CameraObservation[] = [];
  const seen = new Set<string>();
  for (const item of payload) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Камера вернула повреждённую запись.');
    const row = item as Record<string, unknown>;
    if (row.box !== 1 && row.box !== 2) throw new Error('В записи камеры указан неизвестный бокс.');
    const dirName = optionalString(row.dir_name, 200);
    // Имя каталога — действующий контракт dashboard; время meta.json бывает локализованным.
    if (!dirName || /[\\/\x00-\x1f:]/.test(dirName) || dirName === '.' || dirName === '..') throw new Error('Некорректное имя записи камеры.');
    const match = /^(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})_/.exec(dirName);
    if (!match || Number(match[2]) > 23 || Number(match[3]) > 59) throw new Error('Нельзя определить время записи камеры.');
    validateShift({ date: match[1], period: 'day' });
    const startedAt = `${match[1]}T${match[2]}:${match[3]}:00+03:00`;
    const time = Date.parse(startedAt);
    if (time < start || time >= end) continue;
    const id = `cam${row.box}_${createHash('sha256').update(`${row.box}\0${dirName}`).digest('hex')}`;
    if (seen.has(id)) throw new Error('API камеры вернул повторную запись одного бокса и каталога.');
    seen.add(id);
    const negative = row.is_negative === true;
    const dismissed = row.is_dismissed === true;
    const mergedInto = optionalString(row.merged_into, 200) || null;
    const labels = [negative ? 'Камера пометила как ложное срабатывание' : 'Заезд камеры'];
    if (dismissed) labels.push('исключён из очереди оформления');
    if (mergedInto) labels.push('фрагмент группы камер');
    observations.push({
      evidence: { id, time: `${match[2]}:${match[3]}`, box: row.box, ocrPlate: optionalString(row.plate_number, 40), label: labels.join(' · ') },
      dirName, startedAt, endedAt: optionalString(row.end, 80) || null,
      correctedPlate: optionalString(row.corrected_plate, 40),
      mergeGroup: optionalString(row.merge_group_id, 200) || null, mergedInto,
      hasThumbnail: row.has_thumbnail === true, hasVideo: row.has_grid === true,
      isNegative: negative, isDismissed: dismissed,
    });
  }
  if (observations.length > 1000) throw new Error('В смене слишком много фрагментов; требуется отдельный разбор.');
  observations.sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.evidence.id.localeCompare(b.evidence.id));
  return { retrievedAt, observations, completeness: 'unknown' };
}

export async function fetchReconciliationCameraSnapshot(
  baseUrl: string, shift: ShiftKey, request: typeof fetch = fetch,
): Promise<CameraSnapshot> {
  const { end } = shiftBounds(shift);
  const base = new URL(baseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('Некорректный адрес камер.');
  const url = new URL('/api/sessions/range', base);
  url.searchParams.set('from_date', shift.date);
  url.searchParams.set('to_date', new Date(end - 1 + 3 * 60 * 60 * 1000).toISOString().slice(0, 10));
  url.searchParams.set('grouped', '0');
  let response: Response;
  try { response = await request(url, { cache: 'no-store', signal: AbortSignal.timeout(12000), redirect: 'error' }); }
  catch { throw new Error('Камеры недоступны. Показана последняя сохранённая загрузка; полнота смены неизвестна.'); }
  if (!response.ok) throw new Error(`Камеры вернули ошибку ${response.status}. Сохранённые записи не удалены.`);
  const text = await response.text();
  if (text.length > 8 * 1024 * 1024) throw new Error('Ответ камер слишком большой.');
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('Камеры вернули повреждённый ответ.'); }
  return parseCameraSnapshot(data, shift, new Date().toISOString());
}
