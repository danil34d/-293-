"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, RefreshCcw, ArrowRight, AlertTriangle, CheckCircle2, History } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { CheckItem, HazardPill, SafetyBar } from "@/components/admin";

interface BackfillCandidate {
  expenseId: string;
  date: string;
  category: string;
  description: string;
  quantity: number;
  unit: string;
  grams: number;
  skipReason?: string;
}

interface BackfillResponse {
  candidates: BackfillCandidate[];
  alreadyBackfilled: number;
  willCreate: number;
  skipped: number;
  applied: boolean;
}

/** Phase 16 / finding #35: backfill StockMovement.purchase из Expense. */
function BackfillPurchasesButton() {
  const { toast } = useToast();
  const router = useRouter();
  const [isOpen, setIsOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [data, setData] = React.useState<BackfillResponse | null>(null);
  const [check, setCheck] = React.useState(false);

  const fetchPreview = async () => {
    setIsLoading(true);
    setData(null);
    setCheck(false);
    try {
      const r = await fetch("/api/inventory/backfill-purchases");
      if (!r.ok) throw new Error(await r.text());
      const json: BackfillResponse = await r.json();
      setData(json);
      setIsOpen(true);
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message ?? "preview failed", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const apply = async () => {
    if (!check) return;
    setIsLoading(true);
    try {
      const r = await fetch("/api/inventory/backfill-purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: true }),
      });
      if (!r.ok) throw new Error(await r.text());
      const json: BackfillResponse = await r.json();
      toast({
        title: "Backfill применён",
        description: `Создано ${json.willCreate} StockMovement.purchase. Запустите «Проверить расхождение» → «Применить».`,
      });
      setIsOpen(false);
      router.refresh();
    } catch (err: any) {
      toast({ title: "Ошибка", description: err.message ?? "apply failed", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={fetchPreview} disabled={isLoading} className="gap-2">
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <History className="h-4 w-4" />}
        Backfill закупок химии (#35)
      </Button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Восстановление закупок химии из Expense
              {data && (
                <HazardPill level={data.willCreate > 0 ? "warn" : "safe"}>
                  {data.willCreate > 0 ? `${data.willCreate} к созданию` : "ничего нет"}
                </HazardPill>
              )}
            </DialogTitle>
            <DialogDescription>
              Сканирует все Expense с категорией «химия» и создаёт соответствующие
              StockMovement.purchase. Дедупликация по relatedEntityId — повторный
              запуск безопасен.
            </DialogDescription>
          </DialogHeader>

          {data && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="rounded p-2 bg-emerald-50 border border-emerald-200">
                  <div className="text-xs text-emerald-700 uppercase">К созданию</div>
                  <div className="text-2xl font-bold text-emerald-800">{data.willCreate}</div>
                </div>
                <div className="rounded p-2 bg-gray-50 border border-gray-200">
                  <div className="text-xs text-gray-600 uppercase">Уже</div>
                  <div className="text-2xl font-bold text-gray-700">{data.alreadyBackfilled}</div>
                </div>
                <div className="rounded p-2 bg-amber-50 border border-amber-200">
                  <div className="text-xs text-amber-700 uppercase">Пропущено</div>
                  <div className="text-2xl font-bold text-amber-800">{data.skipped}</div>
                </div>
              </div>

              <table className="w-full text-xs border rounded-lg overflow-hidden">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-2 py-1 text-left">Дата</th>
                    <th className="px-2 py-1 text-left">Категория · Описание</th>
                    <th className="px-2 py-1 text-right">Кол-во</th>
                    <th className="px-2 py-1 text-right">Граммов</th>
                    <th className="px-2 py-1 text-left">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {data.candidates.map((c) => (
                    <tr key={c.expenseId} className={c.skipReason ? "bg-gray-50/50" : "bg-emerald-50/30"}>
                      <td className="px-2 py-1 tabular-nums">{c.date.slice(0, 10)}</td>
                      <td className="px-2 py-1">
                        <div className="font-medium">{c.category}</div>
                        <div className="text-gray-500 text-[10px]">{c.description}</div>
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">{c.quantity} {c.unit}</td>
                      <td className="px-2 py-1 text-right tabular-nums font-bold">
                        {c.skipReason ? "—" : c.grams.toLocaleString("ru-RU")}
                      </td>
                      <td className="px-2 py-1 text-[10px]">
                        {c.skipReason ? (
                          <span className="text-amber-700">⊘ {c.skipReason}</span>
                        ) : (
                          <span className="text-emerald-700">✓ создать</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {data.candidates.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-2 py-4 text-center text-gray-500">
                        Не найдено Expense с категорией «химия»
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {data.willCreate > 0 && (
                <CheckItem
                  checked={check}
                  onCheck={setCheck}
                  icon="check"
                  title={`Готов создать ${data.willCreate} StockMovement.purchase`}
                  desc="Безопасно: relatedEntityId дедуплицирует, повторный запуск ничего не сделает. После apply прогоните «Проверить расхождение остатков» → «Применить»."
                  level="warn"
                />
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isLoading}>
              Закрыть
            </Button>
            {data && data.willCreate > 0 && (
              <Button onClick={apply} disabled={!check || isLoading} className="gap-2">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Применить backfill
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface RecomputeMaterial {
  id: string;
  name: string;
  currentStock: number;
  computedStock: number;
  delta: number;
  movementCount: number;
}

interface RecomputeResponse {
  materials: RecomputeMaterial[];
  applied: boolean;
  summary: {
    total: number;
    changed: number;
    totalDeltaAbs: number;
  };
}

/**
 * Phase 6.3 / UX-safety: секция «Пересчитать остатки склада» в /inventory.
 *
 * Использует endpoint `/api/inventory/recompute` (Phase 7):
 *  - GET → preview diff (без записи)
 *  - POST {apply:true} → применить пересчёт
 *
 * Закрывает арх-находку #7 (Inventory↔Expense drift) — даёт владельцу
 * инструмент для cleanup'а накопленного дрейфа между InventoryMaterial.currentStock
 * и SUM(StockMovement.amount).
 *
 * UI:
 *  1. Кнопка «Проверить расхождение» → preview diff с цветной таблицей
 *  2. Если diff != 0 → кнопка «Применить» под чек-листом (3 пункта)
 *  3. Apply пишет новые currentStock в БД
 */
export function RecomputeStockSection() {
  const { toast } = useToast();
  const router = useRouter();

  const [isOpen, setIsOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [data, setData] = React.useState<RecomputeResponse | null>(null);
  const [check1, setCheck1] = React.useState(false);
  const [check2, setCheck2] = React.useState(false);
  const [check3, setCheck3] = React.useState(false);

  const allChecked = check1 && check2 && check3;

  const fetchPreview = async () => {
    setIsLoading(true);
    setData(null);
    try {
      const r = await fetch("/api/inventory/recompute");
      if (!r.ok) throw new Error(await r.text());
      const json: RecomputeResponse = await r.json();
      setData(json);
      setIsOpen(true);
    } catch (err: any) {
      toast({
        title: "Ошибка",
        description: err.message ?? "Не удалось запросить пересчёт",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const applyRecompute = async () => {
    if (!allChecked) return;
    setIsLoading(true);
    try {
      const r = await fetch("/api/inventory/recompute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: true }),
      });
      if (!r.ok) throw new Error(await r.text());
      const json: RecomputeResponse = await r.json();
      toast({
        title: "Пересчёт применён",
        description: `${json.summary.changed} материалов обновлено (диапазон ±${json.summary.totalDeltaAbs}).`,
      });
      setIsOpen(false);
      setCheck1(false); setCheck2(false); setCheck3(false);
      router.refresh();
    } catch (err: any) {
      toast({
        title: "Ошибка применения",
        description: err.message ?? "Recompute apply failed",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const hasChanges = data && data.summary.changed > 0;

  return (
    <>
      <SafetyBar
        level={hasChanges ? "warn" : "info"}
        items={[
          { icon: "package", label: "Источник истины", value: "StockMovement" },
          { icon: "calculator", label: "Метод", value: "SUM(amount) per material" },
          { icon: "shield", label: "Безопасность", value: "preview без apply" },
        ]}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={fetchPreview}
          disabled={isLoading}
          className="gap-2"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          Проверить расхождение остатков
        </Button>
        <BackfillPurchasesButton />
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCcw className="h-5 w-5" />
              Пересчёт остатков склада
              {hasChanges ? (
                <HazardPill level="warn">{data.summary.changed} материалов с расхождением</HazardPill>
              ) : (
                <HazardPill level="safe">всё в порядке</HazardPill>
              )}
            </DialogTitle>
            <DialogDescription>
              Сравнение `currentStock` vs `SUM(StockMovement.amount)`. Если расхождение
              есть — это накопленный дрейф (например, не учтённые закупки).
            </DialogDescription>
          </DialogHeader>

          {data && (
            <div className="space-y-3">
              <table className="w-full text-sm border rounded-lg overflow-hidden">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">Материал</th>
                    <th className="px-3 py-2 text-right">currentStock</th>
                    <th className="px-3 py-2 text-right">→</th>
                    <th className="px-3 py-2 text-right">computedStock</th>
                    <th className="px-3 py-2 text-right">Δ</th>
                    <th className="px-3 py-2 text-right">движений</th>
                  </tr>
                </thead>
                <tbody>
                  {data.materials.map((m) => {
                    const isChanged = m.delta !== 0;
                    const deltaColor = m.delta > 0 ? "#15803d" : m.delta < 0 ? "#b91c1c" : "#64748b";
                    return (
                      <tr key={m.id} className={isChanged ? "bg-amber-50/50" : ""}>
                        <td className="px-3 py-2 font-medium">{m.name}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{m.currentStock.toLocaleString("ru-RU")}</td>
                        <td className="px-3 py-2 text-center text-gray-400">
                          {isChanged ? <ArrowRight className="h-3 w-3 inline" /> : "="}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-bold">
                          {m.computedStock.toLocaleString("ru-RU")}
                        </td>
                        <td
                          className="px-3 py-2 text-right tabular-nums font-bold"
                          style={{ color: deltaColor }}
                        >
                          {m.delta > 0 ? "+" : ""}{m.delta.toLocaleString("ru-RU")}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-500">{m.movementCount}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {!hasChanges && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-emerald-800 text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  Все остатки совпадают со StockMovement — пересчёт не требуется.
                </div>
              )}

              {hasChanges && (
                <>
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2 text-amber-900 text-sm">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                      Найдено расхождение для <b>{data.summary.changed}</b> материалов.
                      Применение перезапишет `currentStock` значениями из StockMovement.
                      Это <b>безопасно</b>, если StockMovement — источник истины (а это так).
                      <br />
                      Если delta &lt; 0 — расходы превышают закупки. Возможно, не все закупки
                      зафиксированы как Expense+StockMovement.purchase.
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t">
                    <CheckItem
                      checked={check1}
                      onCheck={setCheck1}
                      icon="database"
                      title="Понимаю что StockMovement — источник истины"
                      desc="currentStock — это denormalized cache. После apply он станет точно равен SUM."
                      level="info"
                    />
                    <CheckItem
                      checked={check2}
                      onCheck={setCheck2}
                      icon="alert-triangle"
                      title="Если delta отрицательная — проверил причину"
                      desc="Возможно, не все закупки зафиксированы (см. находку #35 в ТЕХ-ДОЛГ)."
                      level="warn"
                    />
                    <CheckItem
                      checked={check3}
                      onCheck={setCheck3}
                      icon="check"
                      title="Готов применить пересчёт"
                      desc="Создаст update в InventoryMaterial. StockMovement не трогает."
                      level="safe"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isLoading}>
              Закрыть
            </Button>
            {hasChanges && (
              <Button
                onClick={applyRecompute}
                disabled={!allChecked || isLoading}
                className="gap-2"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Применить пересчёт
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
