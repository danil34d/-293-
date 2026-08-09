/**
 * Разбор и показ времени камерных сессий.
 *
 * Вынесено в общий модуль 09.08.2026. Причина: в тот день нашлось, что плашка
 * «Камеры зафиксировали» не передавала распознанный номер в форму, потому что
 * строила ссылку своей копией кода и разъехалась с тремя другими точками входа.
 * Разбор времени копировать не будем.
 *
 * Ловушка формата: камера отдаёт start как `2026-08-09_10-47-02`, а end уже как
 * `2026-08-09T14:49:34`. `new Date()` первый формат не понимает и молча даёт
 * Invalid Date — отсюда когда-то бралось «просрочена (Infinityм)».
 */

/** Понимает и `2026-08-09_10-47-02`, и ISO. Иначе null (а не Invalid Date). */
export function parseCameraTime(value: string | undefined | null): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[_T](\d{2})[-:](\d{2})(?:[-:](\d{2}))?/.exec(value);
  if (m) {
    const d = new Date(
      Number(m[1]), Number(m[2]) - 1, Number(m[3]),
      Number(m[4]), Number(m[5]), Number(m[6] || 0),
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Минут назад. Неизвестное время → NaN: сравнение с ним всегда false,
 *  поэтому «время неизвестно» не притворяется просрочкой. */
export function minutesAgo(value: string | undefined | null): number {
  const d = parseCameraTime(value);
  if (!d) return Number.NaN;
  return Math.floor((Date.now() - d.getTime()) / 60000);
}

export function formatHHmm(value: string | undefined | null): string {
  const d = parseCameraTime(value);
  if (!d) return '—';
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

/** «18 мин» / «5 ч 3 мин» / «—». */
export function formatMinutes(total: number): string {
  if (!Number.isFinite(total) || total < 0) return '—';
  if (total < 60) return `${total} мин`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

/** «сегодня в 10:47» / «вчера в 23:12» / «7 августа в 10:47». */
export function formatCameraMoment(value: string | undefined | null): string {
  const d = parseCameraTime(value);
  if (!d) return '—';
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return `сегодня в ${time}`;
  const yesterday = new Date(today.getTime() - 86400000);
  if (sameDay(d, yesterday)) return `вчера в ${time}`;
  return `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} в ${time}`;
}
