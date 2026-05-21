"use client";

import { useFieldArray, useWatch, type Control } from "react-hook-form";
import { FormField, FormControl, FormLabel, FormItem, FormMessage } from "@/components/ui/form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ListPlus, Trash2, GitFork, ChevronDown, ChevronUp, ArrowRight,
  X as XIcon,
} from "lucide-react";
import React from "react";

export const priceListItemSchema = z.object({
  serviceName: z.string().min(1, "Название услуги не может быть пустым."),
  price: z.coerce.number().min(0, "Цена должна быть положительным числом или нулем."),
  chemicalConsumption: z.coerce.number().min(0, "Расход должен быть положительным числом или нулем.").optional(),
  /**
   * Phase 51e / V2-#4: опциональная split-схема.
   * Если присутствует — UI показывает фиолетовый бейдж 🔀 «сплит» рядом с услугой.
   */
  split: z.object({
    driverBonus: z.coerce.number().min(0, "Бонус водителю не может быть отрицательным"),
    employeePct: z.coerce.number().min(0).max(100, "Процент мойщику от 0 до 100"),
  }).optional().nullable(),
});

interface PriceListEditorProps<T> {
  control: Control<T | any>;
  fieldArrayName: string;
  emptyListMessage?: string;
  buttonText?: string;
  /**
   * Phase 51e: разрешить ли пользователю включать split на услугах в этом editor.
   * По умолчанию true для priceList/additionalPriceList контрагента;
   * false для розничного прайса (split — это B2B-фича).
   */
  allowSplit?: boolean;
}

export function PriceListEditor<T>({
    control,
    fieldArrayName,
    emptyListMessage = "Прайс-лист пуст.",
    buttonText = "Добавить услугу",
    allowSplit = true,
}: PriceListEditorProps<T>) {

  const { fields, append, remove } = useFieldArray({
    control,
    name: fieldArrayName,
  });

  const [expandedSplit, setExpandedSplit] = React.useState<number | null>(null);

  return (
    <div className="space-y-4">
      {fields.length === 0 && (
        <p className="text-sm text-muted-foreground mb-3 italic">
          {emptyListMessage}
        </p>
      )}
      {fields.map((field, index) => (
        <div
          key={field.id}
          className="p-4 border rounded-lg space-y-3 relative bg-background shadow-sm"
        >
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <FormField
              control={control}
              name={`${fieldArrayName}.${index}.serviceName`}
              render={({ field: serviceNameField }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel className="flex items-center gap-2">
                    <span>Название услуги №{index + 1}</span>
                    {allowSplit && (
                      <SplitBadge
                        control={control}
                        fieldArrayName={fieldArrayName}
                        index={index}
                        isExpanded={expandedSplit === index}
                        onToggle={() => setExpandedSplit(expandedSplit === index ? null : index)}
                      />
                    )}
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="например, Мойка тягача Евро (спец.)" {...serviceNameField} className="text-base" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name={`${fieldArrayName}.${index}.price`}
              render={({ field: priceField }) => (
                <FormItem>
                  <FormLabel>Цена (руб.)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="например, 500" {...priceField} className="text-base" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name={`${fieldArrayName}.${index}.chemicalConsumption`}
              render={({ field: chemicalField }) => (
                <FormItem>
                  <FormLabel>Расход химии (гр.)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="300" {...chemicalField} className="text-base" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Phase 51e: inline SplitEditor если expanded */}
          {allowSplit && expandedSplit === index && (
            <SplitEditor
              control={control}
              fieldArrayName={fieldArrayName}
              index={index}
              onClose={() => setExpandedSplit(null)}
            />
          )}

          {fields.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 text-muted-foreground hover:text-destructive"
              onClick={() => remove(index)}
              aria-label="Удалить услугу из прайс-листа"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => append({ serviceName: "", price: 0, chemicalConsumption: 0 })}
        className="mt-2"
      >
        <ListPlus className="mr-2 h-4 w-4" /> {buttonText}
      </Button>
    </div>
  );
}

// ─── Phase 51e components ───

/**
 * Фиолетовый бэйдж 🔀 «сплит» рядом с услугой если у неё установлен split.
 * Клик раскрывает SplitEditor. Если split нет — кнопка «+ Сплит» в pale-violet.
 */
function SplitBadge({
  control, fieldArrayName, index, isExpanded, onToggle,
}: {
  control: Control<any>;
  fieldArrayName: string;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const split = useWatch({
    control,
    name: `${fieldArrayName}.${index}.split`,
  });
  const hasSplit = !!(split && (Number(split.driverBonus) > 0 || Number(split.employeePct) > 0));

  if (!hasSplit) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-slate-50 text-slate-500 hover:bg-violet-50 hover:text-violet-700 border border-slate-200 transition-colors"
        title="Включить split-схему (для специальных договоров)"
      >
        <GitFork className="w-2.5 h-2.5" />
        + сплит
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors"
      title="Split-схема активна"
    >
      <GitFork className="w-2.5 h-2.5" />
      сплит
      {isExpanded ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
    </button>
  );
}

/**
 * Inline split-редактор с money-flow визуализацией.
 * Поля: driverBonus (фикс водителю), employeePct (% мойщику от остатка).
 * Renders 4-block flow: Контрагент платит → Водителю → Мойщику + Прибыль мойке.
 */
function SplitEditor({
  control, fieldArrayName, index, onClose,
}: {
  control: Control<any>;
  fieldArrayName: string;
  index: number;
  onClose: () => void;
}) {
  const price = useWatch({ control, name: `${fieldArrayName}.${index}.price` });
  const split = useWatch({ control, name: `${fieldArrayName}.${index}.split` });

  const total = Number(price) || 0;
  const driverBonus = Number(split?.driverBonus) || 0;
  const employeePct = Number(split?.employeePct) || 0;
  const remainder = Math.max(0, total - driverBonus);
  const employee = Math.round((remainder * employeePct) / 100);
  const house = remainder - employee;

  // Handler чтобы очистить split (вернуть к обычной услуге)
  function handleRemoveSplit() {
    // Очищаем через react-hook-form
    // Используем setValue через context (доступен в form context wrapper)
    // Простой путь: обнулить значения — пользователь визуально увидит «нет split»
    const event = new Event('input', { bubbles: true });
    const inputs = document.querySelectorAll<HTMLInputElement>(
      `[name="${fieldArrayName}.${index}.split.driverBonus"], [name="${fieldArrayName}.${index}.split.employeePct"]`
    );
    inputs.forEach((inp) => {
      inp.value = '0';
      inp.dispatchEvent(event);
    });
    onClose();
  }

  return (
    <div className="rounded-lg bg-gradient-to-br from-violet-50/50 to-blue-50/30 border-2 border-violet-200 p-4 mt-3 space-y-3">
      <div className="flex items-center gap-2">
        <GitFork className="w-4 h-4 text-violet-700" />
        <span className="text-[13px] font-bold text-violet-900">Схема разделения дохода</span>
        <span className="text-[10px] text-violet-600 ml-2">для специальных договоров (например, мойка скотовозов)</span>
        <button
          type="button"
          onClick={handleRemoveSplit}
          className="ml-auto text-[10px] font-bold uppercase tracking-wider text-rose-600 hover:text-rose-700 inline-flex items-center gap-1"
          title="Убрать split (вернуть обычной услугой)"
        >
          <XIcon className="w-3 h-3" />
          убрать сплит
        </button>
      </div>

      {/* Money-flow visualization (4 blocks) */}
      <div className="rounded-lg bg-white border border-violet-100 p-3">
        <div className="text-[10px] uppercase tracking-wider font-bold text-violet-700 mb-2">Поток денег</div>
        <div className="flex items-center gap-2 text-[12px] flex-wrap">
          {/* Total */}
          <div className="rounded-lg bg-violet-50 border-2 border-violet-300 p-2.5 text-center min-w-[110px]">
            <div className="text-[9px] uppercase tracking-wider font-bold text-violet-700">Контрагент платит</div>
            <div className="text-[20px] font-extrabold text-violet-900 tabular-nums mt-0.5">
              {total.toLocaleString('ru-RU')} ₽
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-violet-700 flex-shrink-0" />
          {/* Driver */}
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-center min-w-[100px]">
            <div className="text-[9px] uppercase tracking-wider font-bold text-amber-700">Водителю</div>
            <div className="text-[14px] font-extrabold text-amber-900 tabular-nums mt-0.5">
              −{driverBonus.toLocaleString('ru-RU')} ₽
            </div>
            <div className="text-[9px] text-amber-700 mt-0.5">мотивация (фикс)</div>
          </div>
          <ArrowRight className="w-4 h-4 text-violet-700 flex-shrink-0" />
          {/* Split */}
          <div className="flex-1 grid grid-cols-2 gap-2 min-w-[220px]">
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-2.5 text-center">
              <div className="text-[9px] uppercase tracking-wider font-bold text-blue-700">Мойщику · {employeePct}%</div>
              <div className="text-[14px] font-extrabold text-blue-900 tabular-nums mt-0.5">
                {employee.toLocaleString('ru-RU')} ₽
              </div>
              <div className="text-[9px] text-blue-700">ЗП</div>
            </div>
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-center">
              <div className="text-[9px] uppercase tracking-wider font-bold text-emerald-700">
                Мойке · {Math.max(0, 100 - employeePct)}%
              </div>
              <div className="text-[14px] font-extrabold text-emerald-900 tabular-nums mt-0.5">
                {house.toLocaleString('ru-RU')} ₽
              </div>
              <div className="text-[9px] text-emerald-700">прибыль</div>
            </div>
          </div>
        </div>
      </div>

      {/* Editable params */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <FormField
          control={control}
          name={`${fieldArrayName}.${index}.split.driverBonus`}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-amber-800 text-[11px] uppercase tracking-wider font-bold">
                Водителю (фикс, ₽)
              </FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="2000"
                  {...field}
                  value={field.value ?? 0}
                  className="bg-amber-50/40 border-amber-200 focus-visible:ring-amber-400"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={`${fieldArrayName}.${index}.split.employeePct`}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-blue-800 text-[11px] uppercase tracking-wider font-bold">
                Мойщику от остатка (%)
              </FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="50"
                  {...field}
                  value={field.value ?? 0}
                  className="bg-blue-50/40 border-blue-200 focus-visible:ring-blue-400"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="rounded bg-violet-100/50 border border-violet-200 p-2 text-[11px] text-violet-900 leading-snug">
        <b>Backend handshake:</b> чтобы split полностью работал — заведите в схеме зарплаты
        строку «{fieldArrayName.includes('priceList') ? '<название услуги>' : 'эта услуга'}» с
        <code className="bg-white px-1 rounded mx-0.5">rate</code> = {employee.toLocaleString('ru-RU')}₽ и
        <code className="bg-white px-1 rounded mx-0.5">splitDriverBonus</code> = {driverBonus.toLocaleString('ru-RU')}₽.
        Backend читает SalaryScheme для создания DriverKickback (Phase 50).
      </div>
    </div>
  );
}
