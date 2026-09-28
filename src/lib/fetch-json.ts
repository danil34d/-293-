/**
 * GET к нашему API из клиентского компонента. Бросает ошибку с текстом сервера,
 * чтобы компонент показал её так же, как раньше показывал ошибку server action.
 */
export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    let message = `Ошибка ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // тело не JSON — оставляем код ответа
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}
