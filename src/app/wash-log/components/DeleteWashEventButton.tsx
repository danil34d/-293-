
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

interface DeleteWashEventButtonProps {
  eventId: string;
  vehicleNumber: string;
  eventDate: string;
}

export function DeleteWashEventButton({ eventId, vehicleNumber, eventDate }: DeleteWashEventButtonProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/wash-events/${eventId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Не удалось удалить запись: ${response.statusText}`);
      }
      
      toast({
        title: "Запись удалена",
        description: `Запись о мойке для машины ${vehicleNumber} от ${eventDate} успешно удалена.`,
        variant: "default",
      });
      
      router.refresh();
      setIsOpen(false);

    } catch (error: any) {
      console.error("Ошибка при удалении записи о мойке:", error);
      toast({
        title: "Ошибка удаления",
        description: error.message || "Не удалось удалить запись.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive transition-colors" aria-label={`Удалить запись`}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Вы уверены?</AlertDialogTitle>
          <AlertDialogDescription>
            Вы собираетесь безвозвратно удалить запись о мойке для машины <strong className="font-mono text-foreground">{vehicleNumber}</strong> от <strong className="text-foreground">{eventDate}</strong>.
            Это действие нельзя отменить.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Отмена</AlertDialogCancel>
          <Button onClick={handleDelete} disabled={isDeleting} variant="destructive">
            {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Продолжить
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
