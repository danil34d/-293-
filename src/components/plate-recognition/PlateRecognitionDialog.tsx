"use client";

import { useState, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Camera, Upload, X, Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from '@/hooks/use-toast';

interface PlateRecognitionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPlateRecognized: (plateNumber: string, imageBase64?: string) => void;
  onRecognitionFailed?: (context: { imageBase64?: string; failedFilename?: string; error?: string }) => void;
}

type RecognitionMode = 'camera' | 'upload' | null;
const OCR_REQUEST_TIMEOUT_MS = 65000;

export function PlateRecognitionDialog({
  open,
  onOpenChange,
  onPlateRecognized,
  onRecognitionFailed
}: PlateRecognitionDialogProps) {
  const [mode, setMode] = useState<RecognitionMode>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lastImageBase64, setLastImageBase64] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { toast } = useToast();

  const readFileAsDataUrl = useCallback((file: File) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.readAsDataURL(file);
    });
  }, []);

  // Запуск камеры
  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' } // Задняя камера на мобильных
      });

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        setStream(mediaStream);
      }
    } catch (err: any) {
      console.error('Camera error:', err);
      setCameraError(
        'Доступ к камере необходим. Чтобы использовать эту функцию, разрешите доступ к камере в настройках вашего браузера.'
      );
    }
  }, []);

  // Остановка камеры
  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [stream]);

  // Обработка выбора режима
  const handleModeSelect = useCallback((selectedMode: RecognitionMode) => {
    setMode(selectedMode);
    setError(null);

    if (selectedMode === 'camera') {
      startCamera();
    } else if (selectedMode === 'upload') {
      fileInputRef.current?.click();
    }
  }, [startCamera]);

  // Сделать фото с камеры
  const capturePhoto = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas context not available');

      ctx.drawImage(video, 0, 0);

      // Конвертируем в base64 с максимальным качеством
      const base64Image = canvas.toDataURL('image/jpeg', 0.95);
      setLastImageBase64(base64Image);

      // Отправляем на распознавание
      await recognizePlate(base64Image);
    } catch (err: any) {
      console.error('Capture error:', err);
      setError('Ошибка при съемке фото: ' + err.message);
    }
  }, []);

  // Обработка загрузки файла
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const base64Image = await readFileAsDataUrl(file);
      setLastImageBase64(base64Image);

      const formData = new FormData();
      formData.append('image', file);

      await recognizePlateFromFormData(formData, base64Image);
    } catch (err: any) {
      console.error('Upload error:', err);
      setError('Ошибка при загрузке файла: ' + err.message);
    } finally {
      // Сбрасываем input для повторной загрузки того же файла
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [readFileAsDataUrl]);

  // Распознавание номера (base64)
  const recognizePlate = async (base64Image: string) => {
    const formData = new FormData();
    formData.append('base64', base64Image);
    await recognizePlateFromFormData(formData, base64Image);
  };

  // Общая функция распознавания
  const recognizePlateFromFormData = async (formData: FormData, imageBase64?: string) => {
    setIsLoading(true);
    setError(null);
    setMode(null); // Сбрасываем режим чтобы показать loading

    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), OCR_REQUEST_TIMEOUT_MS);
      const response = await fetch('/api/recognize-plate', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);

      const data = await response.json();
      const currentImageBase64 = imageBase64 || lastImageBase64 || undefined;

      if (data.success && data.plateNumber) {
        toast({
          title: "Номер распознан",
          description: `Найден номер: ${data.plateNumber}`,
        });

        onPlateRecognized(data.plateNumber, currentImageBase64);
        handleClose();
      } else {
        setError(data.error || 'Номер не распознан. Попробуйте другое изображение.');
        onRecognitionFailed?.({
          imageBase64: currentImageBase64,
          failedFilename: typeof data.failedFilename === 'string' ? data.failedFilename : undefined,
          error: typeof data.error === 'string' ? data.error : undefined,
        });
      }
    } catch (err: any) {
      console.error('Recognition error:', err);
      const currentImageBase64 = imageBase64 || lastImageBase64 || undefined;
      onRecognitionFailed?.({
        imageBase64: currentImageBase64,
        error: err?.message,
      });
      if (err?.name === 'AbortError') {
        setError('OCR превысил лимит времени. Попробуйте другое фото.');
        return;
      }
      setError('Ошибка при распознавании: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Закрытие диалога
  const handleClose = useCallback(() => {
    stopCamera();
    setMode(null);
    setError(null);
    setCameraError(null);
    setLastImageBase64(null);
    onOpenChange(false);
  }, [stopCamera, onOpenChange]);

  // Сброс режима
  const resetMode = useCallback(() => {
    stopCamera();
    setMode(null);
    setError(null);
    setCameraError(null);
  }, [stopCamera]);

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Распознать номер</DialogTitle>
            <DialogDescription>
              {isLoading
                ? "Пожалуйста, подождите..."
                : "Наведите камеру на номерной знак автомобиля и нажмите \"Сфотографировать\"."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Loading state */}
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
                <p className="text-lg font-medium">Распознаём номер...</p>
                <p className="text-muted-foreground text-sm mt-2">Первый запуск может занять до 30 секунд (загрузка моделей)</p>
              </div>
            ) : !mode ? (
              <div className="grid grid-cols-2 gap-4">
                <Button
                  onClick={() => handleModeSelect('camera')}
                  className="h-24 flex-col gap-2"
                  variant="outline"
                >
                  <Camera className="h-8 w-8" />
                  <span>Использовать камеру</span>
                </Button>
                <Button
                  onClick={() => handleModeSelect('upload')}
                  className="h-24 flex-col gap-2"
                  variant="outline"
                >
                  <Upload className="h-8 w-8" />
                  <span>Загрузить файл</span>
                </Button>
              </div>
            ) : null}

            {mode === 'camera' && (
              <div className="space-y-4">
                <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                  {cameraError ? (
                    <div className="absolute inset-0 flex items-center justify-center p-4">
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-sm">
                          {cameraError}
                        </AlertDescription>
                      </Alert>
                    </div>
                  ) : (
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>

                <canvas ref={canvasRef} className="hidden" />

                <div className="flex gap-2">
                  <Button
                    onClick={capturePhoto}
                    disabled={isLoading || !!cameraError}
                    className="flex-1"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Распознаем...
                      </>
                    ) : (
                      <>
                        <Camera className="mr-2 h-4 w-4" />
                        Сфотографировать и распознать
                      </>
                    )}
                  </Button>
                  <Button onClick={resetMode} variant="outline">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileUpload}
      />
    </>
  );
}
