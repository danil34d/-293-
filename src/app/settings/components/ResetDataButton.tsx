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
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Trash2, Loader2, AlertTriangle, ShieldAlert, Lock } from 'lucide-react';
import { CheckItem, HazardPill, SafetyBar } from '@/components/admin';

// Phase 24b / V2-#1: phrase upgraded ОЧИСТИТЬ → УДАЛИТЬ ВСЕ ДАННЫЕ (V2-стандарт).
// Server-side проверка в /api/reset-data теперь требует этот же phrase в body
// — даже curl-обход блокируется.
const MAGIC_WORD = 'УДАЛИТЬ ВСЕ ДАННЫЕ';

/**
 * Phase 6.3 / UX-safety: ResetDataButton переделан с просто confirm-modal
 * на DangerGate-style с magic word + 4 чек-листами.
 * Phase 24b / V2-#1: phrase обновлён + добавлена server-side валидация
 * (раньше curl POST обходил защиту, теперь body должен содержать confirmPhrase).
 *
 * `/api/reset-data` — это БОМБА: удаляет ВСЕ WashEvent, EmployeeTransaction,
 * ClientTransaction, Expense, обнуляет balance. Никакой undo. До этого один
 * клик "Да, очистить всё" = всё пропало.
 *
 * Теперь чтобы запустить:
 *  1. Открыть модал (Trash2 button)
 *  2. Отметить 4 чек-листа (есть бэкап? период закрыт? сотрудники warned?)
 *  3. Ввести MAGIC_WORD точно как написано
 *  4. Нажать Submit (disabled пока 1-3 не выполнены)
 *  5. Клиент шлёт confirmPhrase в body → server тоже валидирует
 */
export function ResetDataButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [magicInput, setMagicInput] = useState('');
  const [check1, setCheck1] = useState(false);
  const [check2, setCheck2] = useState(false);
  const [check3, setCheck3] = useState(false);
  const [check4, setCheck4] = useState(false);

  const { toast } = useToast();
  const router = useRouter();

  const allChecked = check1 && check2 && check3 && check4;
  const magicValid = magicInput.trim() === MAGIC_WORD;
  const canSubmit = allChecked && magicValid;

  const resetState = () => {
    setMagicInput('');
    setCheck1(false);
    setCheck2(false);
    setCheck3(false);
    setCheck4(false);
  };

  const handleReset = async () => {
    if (!canSubmit) return;
    setIsLoading(true);
    try {
      const response = await fetch('/api/reset-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmPhrase: MAGIC_WORD }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Не удалось очистить данные');
      }
      toast({
        title: 'Данные очищены',
        description: 'Все финансовые данные удалены. Сотрудники и контрагенты сохранены.',
      });
      setIsOpen(false);
      resetState();
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
      <SafetyBar
        level="critical"
        items={[
          { icon: 'shield-alert', label: 'Уровень', value: 'CRITICAL — irreversible' },
          { icon: 'database', label: 'Затронет таблиц', value: '5+ (WashEvent, EmployeeTransaction, …)' },
          { icon: 'lock', label: 'Защита', value: 'magic word + 4 checks' },
        ]}
      />

      <h2 className="text-xl font-semibold text-red-600 flex items-center gap-2">
        <ShieldAlert className="h-5 w-5" />
        Опасная зона
      </h2>
      <p className="text-sm text-muted-foreground">
        Очистка всех финансовых данных. Откатить это действие невозможно — только из бэкапа.
      </p>

      <div className="p-4 border-2 border-red-300 rounded-lg bg-red-50">
        <h3 className="font-medium mb-2 text-red-900 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> Будут безвозвратно удалены:
        </h3>
        <ul className="list-disc pl-5 text-sm space-y-1 text-red-900">
          <li>Все записи о мойках (журнал моек)</li>
          <li>Все транзакции сотрудников (выплаты, премии, долги)</li>
          <li>Все расходы</li>
          <li>Транзакции клиентов</li>
          <li>Балансы агрегаторов и контрагентов (обнулятся)</li>
        </ul>
        <h3 className="font-medium mt-3 mb-2 text-emerald-800">Останутся:</h3>
        <ul className="list-disc pl-5 text-sm space-y-1 text-emerald-800">
          <li>Сотрудники (включая архивных)</li>
          <li>Контрагенты и агрегаторы (без балансов)</li>
          <li>Схемы зарплат</li>
          <li>Прайс-листы и AppConfig</li>
        </ul>
      </div>

      <AlertDialog open={isOpen} onOpenChange={(o) => { setIsOpen(o); if (!o) resetState(); }}>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" className="gap-2">
            <Trash2 className="h-4 w-4" />
            Очистить все финансовые данные
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-700 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" />
              Подтверждение очистки финансовых данных
              <HazardPill level="critical">CRITICAL</HazardPill>
            </AlertDialogTitle>
            <AlertDialogDescription>
              Чтобы продолжить, отметьте 4 пункта и введите слово{' '}
              <code className="bg-red-100 px-1.5 py-0.5 rounded font-mono text-red-800">
                {MAGIC_WORD}
              </code>
              {' '}в поле ниже.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <CheckItem
              checked={check1}
              onCheck={setCheck1}
              icon="database"
              title="Свежий бэкап БД сделан и проверен"
              desc="Минимум pg_dump за последний час. Без бэкапа этого делать нельзя."
              level="critical"
            />
            <CheckItem
              checked={check2}
              onCheck={setCheck2}
              icon="calendar"
              title="Текущий период ZP закрыт или неактуален"
              desc="Если есть незакрытый период — сотрудники потеряют выплаты."
              level="warn"
            />
            <CheckItem
              checked={check3}
              onCheck={setCheck3}
              icon="users"
              title="Сотрудники предупреждены"
              desc="История моек/смен/долгов сейчас исчезнет — для них это видимо в отчётах."
              level="warn"
            />
            <CheckItem
              checked={check4}
              onCheck={setCheck4}
              icon="check"
              title="Понимаю что откат возможен только из бэкапа"
              desc="DELETE необратим. Только восстановление из pg_dump."
              level="critical"
            />
          </div>

          <div className="space-y-2 pt-2 border-t">
            <label className="text-sm font-medium text-red-700 flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Введите слово <code className="bg-red-100 px-1.5 py-0.5 rounded font-mono">{MAGIC_WORD}</code> для подтверждения:
            </label>
            <Input
              value={magicInput}
              onChange={(e) => setMagicInput(e.target.value)}
              placeholder={MAGIC_WORD}
              className={
                magicInput && !magicValid
                  ? 'border-red-500 bg-red-50'
                  : magicValid
                  ? 'border-emerald-500 bg-emerald-50'
                  : ''
              }
              autoComplete="off"
              autoFocus={false}
              disabled={!allChecked}
            />
            {!allChecked && (
              <p className="text-[11px] text-amber-700">
                Сначала отметьте 4 чек-листа — поле ввода активируется.
              </p>
            )}
            {allChecked && magicInput && !magicValid && (
              <p className="text-[11px] text-red-700">
                Не совпадает с {MAGIC_WORD}. Введите точно как написано.
              </p>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Отмена</AlertDialogCancel>
            <Button
              onClick={handleReset}
              disabled={!canSubmit || isLoading}
              variant="destructive"
              className="gap-2"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Да, очистить всё необратимо
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
