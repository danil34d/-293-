export async function readPaperImage(request: Request): Promise<{ mime: string; bytes: Uint8Array }> {
  const mime = request.headers.get('content-type')?.split(';')[0] || '';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw new Error('Выберите фото JPG, PNG или WebP.');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Фото не выбрано.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > 6 * 1024 * 1024) { await reader.cancel(); throw new Error('Фото больше 6 МБ. Выберите уменьшенную копию.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const starts = (values: number[], from = 0) => values.every((value, i) => bytes[i + from] === value);
  const valid = size >= 12 && (mime === 'image/jpeg' ? starts([255, 216, 255]) : mime === 'image/png' ? starts([137, 80, 78, 71, 13, 10, 26, 10]) : starts([82, 73, 70, 70]) && starts([87, 69, 66, 80], 8));
  if (!valid) throw new Error('Файл не соответствует выбранному формату фото.');
  return { mime, bytes };
}
