"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ShieldAlert, RefreshCw, Package, Trash2, Database, AlertOctagon, Lock, Loader2,
} from "lucide-react";
import { CheckItem, HazardPill, SafetyBar } from "@/components/admin";

/**
 * Phase 30 / V2-#17 — Settings DANGER zone полная (4 уровня action).
 *
 * 1. 🟢 Очистить кеш отчётов        — safe, без phrase, POST /api/system/cache-clear
 * 2. 🟡 Сбросить журнал склада      — warn, phrase "СБРОС СКЛАДА", POST /api/inventory/reset-journal
 * 3. 🔴 Полный сброс данных          — critical, phrase "УДАЛИТЬ ВСЕ ДАННЫЕ", POST /api/reset-data
 * 4. 🔴 Полный сброс БД              — critical, phrase "УДАЛИТЬ ВСЁ", POST /api/system/db-wipe (501-stub)
 *
 * До Phase 30 был только ResetDataButton (#3). Теперь 4 уровня в одной зоне.
 */

type Level = 'safe' | 'warn' | 'critical';

interface DangerAction {
  id: string;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  level: Level;
  confirmPhrase: string | null;
  endpoint: string;
  /** Опционально — текст подтверждающей кнопки. */
  confirmBtnLabel?: string;
  /** Опционально — описание-эффекта в модале сверху. */
  modalImpact?: string;
}

const ACTIONS: DangerAction[] = [
  {
    id: 'cache-clear',
    label: 'Очистить кеш отчётов',
    desc: 'Удалит in-memory кеш data-loader/pg-adapter. Безопасно — пересчитается из БД при следующем обращении. Полезно после ручных SQL-правок.',
    icon: RefreshCw,
    level: 'safe',
    confirmPhrase: null,
    endpoint: '/api/system/cache-clear',
    confirmBtnLabel: 'Очистить кеш',
  },
  {
    id: 'inventory-reset',
    label: 'Сбросить журнал склада',
    desc: 'Удалит ВСЕ StockMovement и обнулит InventoryMaterial.currentStock. Используется когда журнал движений рассинхронился. После сброса — сделать Backfill через /inventory.',
    icon: Package,
    level: 'warn',
    confirmPhrase: 'СБРОС СКЛАДА',
    endpoint: '/api/inventory/reset-journal',
    confirmBtnLabel: 'Сбросить журнал',
    modalImpact: 'Все движения склада (закупки, расход, корректировки) будут УДАЛЕНЫ. Восстановить можно через backfill из Expense — кнопка в /inventory.',
  },
  {
    id: 'data-reset',
    label: 'Полный сброс данных',
    desc: 'Удалит ВСЕ WashEvent, Expense, EmployeeTransaction, ClientTransaction, StockMovement. Обнулит balance у Aggregator/CounterAgent. Останутся только справочники (сотрудники, схемы ЗП, прайсы, AppConfig).',
    icon: Trash2,
    level: 'critical',
    confirmPhrase: 'УДАЛИТЬ ВСЕ ДАННЫЕ',
    endpoint: '/api/reset-data',
    confirmBtnLabel: 'Да, очистить всё необратимо',
    modalImpact: 'Это БОМБА — удалится вся история работы. Откат только из бэкапа БД.',
  },
  {
    id: 'db-wipe',
    label: 'Полный сброс БД',
    desc: 'Удалит ВСЁ включая справочники: сотрудников, контрагентов, агрегаторов, схемы ЗП, прайсы. БД станет как при первом запуске.',
    icon: Database,
    level: 'critical',
    confirmPhrase: 'УДАЛИТЬ ВСЁ',
    endpoint: '/api/system/db-wipe',
    confirmBtnLabel: 'Запросить инструкцию',
    modalImpact: 'Endpoint вернёт 501 + инструкцию для ручного выполнения через ssh + pg_dump + DROP SCHEMA. Защита от случайного нажатия.',
  },
];

const LEVEL_COLORS: Record<Level, { bg: string; border: string; text: string; iconBg: string; iconText: string }> = {
  safe:     { bg: '#f0fdf4', border: '#86efac', text: '#15803d', iconBg: '#16a34a', iconText: '#fff' },
  warn:     { bg: '#fffbeb', border: '#fcd34d', text: '#92400e', iconBg: '#f59e0b', iconText: '#fff' },
  critical: { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c', iconBg: '#dc2626', iconText: '#fff' },
};

export function DangerZone() {
  const [active, setActive] = React.useState<DangerAction | null>(null);

  return (
    <div className="space-y-4">
      <SafetyBar
        level="critical"
        items={[
          { icon: 'shield-alert', label: 'Уровень', value: 'CRITICAL — irreversible' },
          { icon: 'database', label: 'Затронет таблиц', value: '5+ (WashEvent, EmployeeTransaction, …)' },
          { icon: 'lock', label: 'Защита', value: 'phrase + 2 checks + server validation' },
        ]}
      />

      <h2 className="text-xl font-semibold text-red-600 flex items-center gap-2">
        <ShieldAlert className="h-5 w-5" />
        Опасная зона
      </h2>
      <p className="text-sm text-muted-foreground">
        4 уровня разрушительных операций. Каждое действие выше 🟢 требует ввода фразы + чек-листа.
        Server-side проверки логируются в journalctl (audit-trail).
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {ACTIONS.map(a => (
          <DangerActionCard key={a.id} action={a} onClick={() => setActive(a)} />
        ))}
      </div>

      <DangerConfirmModal
        action={active}
        onClose={() => setActive(null)}
      />
    </div>
  );
}

function DangerActionCard({ action, onClick }: { action: DangerAction; onClick: () => void }) {
  const c = LEVEL_COLORS[action.level];
  const Icon = action.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl border-2 p-4 text-left transition-all hover:shadow-md"
      style={{ background: c.bg, borderColor: c.border }}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: c.iconBg, color: c.iconText }}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-bold mb-1" style={{ color: c.text }}>{action.label}</div>
          <div className="text-[11px] text-slate-700 leading-snug">{action.desc}</div>
          <div className="mt-2">
            <HazardPill level={action.level}>
              {action.level === 'safe' ? 'без фразы' : (action.confirmPhrase ?? 'phrase required')}
            </HazardPill>
          </div>
        </div>
      </div>
    </button>
  );
}

function DangerConfirmModal({ action, onClose }: { action: DangerAction | null; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [phrase, setPhrase] = React.useState('');
  const [ack1, setAck1] = React.useState(false);
  const [ack2, setAck2] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (action) {
      setPhrase('');
      setAck1(false);
      setAck2(false);
    }
  }, [action?.id]);

  if (!action) return null;

  const needsPhrase = !!action.confirmPhrase;
  const phraseOk = !needsPhrase || phrase.trim() === action.confirmPhrase;
  const acksOk = action.level === 'safe' ? true : (ack1 && ack2);
  const canSubmit = phraseOk && acksOk && !submitting;
  const c = LEVEL_COLORS[action.level];

  async function handleConfirm() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const r = await fetch(action.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(needsPhrase ? { confirmPhrase: action.confirmPhrase } : {}),
      });
      const data = await r.json().catch(() => ({}));
      // db-wipe stub returns 501 with instructions — treat as semi-success
      if (action.id === 'db-wipe' && r.status === 501) {
        toast({
          title: 'Инструкция получена',
          description: 'См. шаги в server logs или используй ssh carwash. Endpoint умышленно не выполняет операцию.',
        });
        onClose();
        return;
      }
      if (!r.ok) throw new Error(data.error || `${action.label} failed (${r.status})`);
      toast({
        title: `${action.label} ✅`,
        description: data.message || data.hint || 'Выполнено',
      });
      onClose();
      router.refresh();
    } catch (e: any) {
      toast({ title: 'Ошибка', description: e.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }

  const Icon = action.icon;

  return (
    <Dialog open={!!action} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: c.iconBg, color: c.iconText }}>
              <Icon className="w-5 h-5" />
            </div>
            {action.label}
            <HazardPill level={action.level} className="ml-auto" />
          </DialogTitle>
          <DialogDescription>{action.desc}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {action.modalImpact && (
            <div className="rounded-lg border-2 p-3 text-[12px]"
              style={{ background: c.bg, borderColor: c.border, color: c.text }}>
              <div className="flex items-start gap-2">
                <AlertOctagon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div className="leading-snug">{action.modalImpact}</div>
              </div>
            </div>
          )}

          {action.level !== 'safe' && (
            <>
              <div className="space-y-2 pt-1">
                <CheckItem
                  checked={ack1}
                  onCheck={setAck1}
                  level={action.level === 'critical' ? 'critical' : 'warn'}
                  icon="database"
                  title="Бэкап БД сделан и проверен"
                  desc="Минимум pg_dump в безопасное место. Без бэкапа этого делать нельзя."
                />
                <CheckItem
                  checked={ack2}
                  onCheck={setAck2}
                  level={action.level === 'critical' ? 'critical' : 'warn'}
                  icon="check"
                  title="Я понимаю что действие необратимо"
                  desc="Откатить можно только восстановлением из бэкапа."
                />
              </div>

              {needsPhrase && (
                <div className="rounded-xl border-2 p-3"
                  style={{ background: c.bg, borderColor: c.border }}>
                  <label className="flex items-center gap-2 text-[12px] font-semibold mb-1.5"
                    style={{ color: c.text }}>
                    <Lock className="w-3.5 h-3.5" />
                    Введите фразу для подтверждения:
                    <code className="bg-white px-1.5 py-0.5 rounded text-[12px] border"
                      style={{ borderColor: c.border, color: c.text }}>{action.confirmPhrase}</code>
                  </label>
                  <Input
                    value={phrase}
                    onChange={(e) => setPhrase(e.target.value)}
                    placeholder={action.confirmPhrase ?? ''}
                    autoComplete="off"
                    disabled={!acksOk}
                    className={
                      phrase && !phraseOk ? 'border-rose-500 bg-rose-50' :
                      phraseOk && phrase ? 'border-emerald-500 bg-emerald-50' : ''
                    }
                  />
                  {!acksOk && (
                    <p className="text-[11px] text-amber-700 mt-1.5">
                      Сначала отметьте 2 чек-листа — поле ввода активируется.
                    </p>
                  )}
                  {acksOk && phrase && !phraseOk && (
                    <p className="text-[11px] text-rose-700 mt-1.5">
                      Фраза не совпадает. Введите точно как написано.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Отмена
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!canSubmit}
            style={{ background: action.level === 'safe' ? '#10b981' : action.level === 'warn' ? '#f59e0b' : '#dc2626', color: '#fff' }}
            className="hover:opacity-90"
          >
            {submitting ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Icon className="w-4 h-4 mr-1.5" />}
            {action.confirmBtnLabel ?? 'Выполнить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
