import type { WashComment } from '@/types';

/**
 * Сохраняет комментарии водителя к мойке. Вызывается из CommentDialog в браузере.
 *
 * 🔥 ФИКС 2026-09-28: раньше это был server action ('use server'), который
 * сам ходил на `${NEXT_PUBLIC_APP_URL || 'http://localhost:9002'}/api/wash-events/…`
 * без куки входа — middleware отвечал 401, и комментарий не сохранялся.
 * Теперь запрос идёт из браузера с куками пользователя, а права проверяет
 * PUT /api/wash-events/[id].
 */
export async function handleCommentUpdate(eventId: string, newComments: WashComment[]): Promise<void> {
  const url = `/api/wash-events/${encodeURIComponent(eventId)}`;

  const fetchRes = await fetch(url, { cache: 'no-store' });
  if (!fetchRes.ok) throw new Error('Не удалось загрузить мойку перед сохранением комментария.');
  const eventToUpdate = await fetchRes.json();

  const updateRes = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...eventToUpdate, driverComments: newComments }),
  });
  if (!updateRes.ok) throw new Error('Не удалось сохранить комментарий.');
}
