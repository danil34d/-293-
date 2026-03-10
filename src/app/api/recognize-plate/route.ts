import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server-auth';
import { recognizePlateFromBuffer, saveOcrFailedPhoto } from '@/services/plate-recognition-service';

export async function POST(request: NextRequest) {
  const auth = requireAuth();
  if (auth instanceof NextResponse) return auth;

  let imageBuffer: Buffer | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get('image') as File | null;
    const base64Image = formData.get('base64') as string | null;

    if (!file && !base64Image) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    if (file) {
      const bytes = await file.arrayBuffer();
      imageBuffer = Buffer.from(bytes);
    } else {
      const base64Data = String(base64Image || '').replace(/^data:image\/\w+;base64,/, '');
      imageBuffer = Buffer.from(base64Data, 'base64');
    }

    // Проверяем что буфер не пустой
    if (!imageBuffer || imageBuffer.length < 100) {
      return NextResponse.json({
        success: false,
        error: 'Пустое или повреждённое изображение',
      }, { status: 400 });
    }

    const result = await recognizePlateFromBuffer(imageBuffer);

    if (result.success) {
      return NextResponse.json({
        success: true,
        plateNumber: result.plateNumber,
        rawOutput: result.rawOutput,
      });
    }

    return NextResponse.json({
      success: false,
      error: result.error || 'Номер не распознан',
      rawOutput: result.rawOutput,
      stderr: result.stderr,
      failedFilename: result.failedFilename,
    });
  } catch (error: any) {
    console.error('Error recognizing plate:', error);

    // Сохраняем фото даже при непредвиденной ошибке
    let failedFilename: string | undefined;
    if (imageBuffer && imageBuffer.length > 100) {
      try {
        failedFilename = (await saveOcrFailedPhoto(
          imageBuffer,
          `error: ${error?.message || 'unexpected_error'}`
        )) || undefined;
      } catch {
        // не критично
      }
    }

    return NextResponse.json({
      success: false,
      error: error?.message || 'Ошибка распознавания',
      failedFilename,
    }, { status: 500 });
  }
}
