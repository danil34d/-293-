"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Trash2, Loader2, AlertTriangle } from 'lucide-react';

export function ResetDataButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const handleReset = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/reset-data', {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Не удалось очистить данные');
      }

      toast({
        title: 'Данные очищены',
        description: 'Все финансовые данные успешно удалены. Сотрудники, контрагенты и агрегаторы сохранены.',
      });

      setIsOpen(false);
      router.refresh();
    } catch (error: any) {
      toast({
        title: 'Ошибка',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-red-600 flex items-center gap-2">
        <AlertTriangle className="h-5 w-5" />
        Опасная зона
      </h2>
      <p className="text-sm text-muted-foreground">
        Очистка всех финансовых данных. Это действие нельзя отменить.
      </p>

      <div className="p-4 border border-red-200 rounded-lg bg-red-50">
        <h3 className="font-medium mb-2">Будут удалены:</h3>
        <ul className="list-disc pl-5 text-sm space-y-1 text-muted-foreground">
          <li>Все записи о мойках (журнал моек)</li>
          <li>Все транзакции сотрудников (выплаты, премии, долги)</li>
          <li>Все расходы</li>
          <li>Транзакции клиентов</li>
          <li>Балансы агрегаторов и контрагентов (обнулятся)</li>
        </ul>

        <h3 className="font-medium mt-4 mb-2">Останутся:</h3>
        <ul className="list-disc pl-5 text-sm space-y-1 text-muted-foreground">
          <li>Сотрудники</li>
          <li>Контрагенты (без балансов)</li>
          <li>Агрегаторы (без балансов)</li>
          <li>Схемы зарплат</li>
          <li>Прайс-листы</li>
        </ul>
      </div>

      <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" className="gap-2">
            <Trash2 className="h-4 w-4" />
            Очистить все финансовые данные
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600">Вы уверены?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие <strong>нельзя отменить</strong>. Все записи о мойках, транзакции и финансовые данные будут безвозвратно удалены.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Отмена</AlertDialogCancel>
            <Button onClick={handleReset} disabled={isLoading} variant="destructive">
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Да, очистить всё
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
