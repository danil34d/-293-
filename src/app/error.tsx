'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Auto-reload on ChunkLoadError (happens after deploy when cached chunks are stale)
    if (
      error.name === 'ChunkLoadError' ||
      error.message?.includes('Loading chunk') ||
      error.message?.includes('Failed to fetch')
    ) {
      window.location.reload();
      return;
    }
    console.error('App error:', error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-8">
      <AlertTriangle className="h-12 w-12 text-orange-500" />
      <h2 className="text-xl font-semibold text-gray-800">Что-то пошло не так</h2>
      <p className="text-sm text-muted-foreground text-center max-w-md">
        Произошла ошибка при загрузке страницы. Попробуйте обновить.
      </p>
      <div className="flex gap-3">
        <Button onClick={reset} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Попробовать снова
        </Button>
        <Button onClick={() => window.location.reload()}>
          Перезагрузить страницу
        </Button>
      </div>
    </div>
  );
}
