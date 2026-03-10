
"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Trash2, Loader2 } from 'lucide-react';

interface DeleteConfirmationButtonProps {
  apiPath: string;
  entityId: string;
  entityName: string;
  description: React.ReactNode;
  toastTitle: string;
  toastDescription: string;
  onSuccess?: () => void;
  trigger?: React.ReactNode;
  method?: 'DELETE' | 'PATCH' | 'POST' | 'PUT';
  requestBody?: unknown;
  confirmLabel?: string;
  errorTitle?: string;
}

export function DeleteConfirmationButton({
  apiPath,
  entityId,
  entityName,
  description,
  toastTitle,
  toastDescription,
  onSuccess,
  trigger,
  method = 'DELETE',
  requestBody,
  confirmLabel = 'Продолжить',
  errorTitle = 'Ошибка удаления',
}: DeleteConfirmationButtonProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const url = entityId ? `${apiPath}/${entityId}` : apiPath;

      const response = await fetch(url, {
        method,
        headers: requestBody ? { 'Content-Type': 'application/json' } : undefined,
        body: requestBody ? JSON.stringify(requestBody) : undefined,
      });

      if (!response.ok) {
        let errorData: { error?: string } = {};
        try {
          errorData = await response.json();
        } catch {
          errorData = {};
        }
        throw new Error(errorData.error || `Не удалось выполнить операцию.`);
      }

      toast({
        title: toastTitle,
        description: toastDescription,
        variant: "default",
      });

      if (onSuccess) {
        await onSuccess();
      } else {
        router.refresh();
      }
      setIsOpen(false);

    } catch (error: any) {
      console.error(`Ошибка при выполнении операции:`, error);
      toast({
        title: errorTitle,
        description: error.message || `Не удалось выполнить операцию.`,
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        {trigger || (
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive transition-colors" aria-label={`Удалить ${entityName}`}>
                <Trash2 className="h-4 w-4" />
            </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Вы уверены?</AlertDialogTitle>
          <AlertDialogDescription>
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Отмена</AlertDialogCancel>
          <Button onClick={handleDelete} disabled={isDeleting} variant="destructive">
            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
