'use client';

import * as React from 'react';
import { useFieldArray, Control } from 'react-hook-form';
import { Plus, Trash2, UserCircle2, Phone, Truck, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

/**
 * Phase 51b / V2-#4 split-pricing: CRUD-редактор водителей контрагента.
 *
 * Список водителей с inline add/edit/remove. Используется внутри CounterAgentForm
 * в табе «Автопарк» (логически близко к cars).
 *
 * Данные сохраняются в CounterAgent.drivers Json field через существующий
 * PUT /api/counter-agents/[id] — backend Phase 50a добавил поле в Prisma.
 *
 * Plates вводятся multi-line text (как cars выше), serialize → string[]
 * через normalizeLicensePlate в onSubmit родительской формы.
 */

interface Props {
  control: Control<any>;
}

export function DriversEditor({ control }: Props) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'drivers',
  });

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="font-headline text-lg flex items-center gap-2">
          <UserCircle2 className="w-5 h-5 text-violet-600" />
          Водители (для split-услуг)
        </CardTitle>
        <CardDescription>
          Список водителей контрагента, которые получают фикс-бонус при оформлении
          split-услуги (например «Мойка скотовоза»). Plates используются для авто-подстановки
          водителя в терминале при оформлении мойки.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {fields.length === 0 && (
          <div className="rounded-lg bg-violet-50 border border-violet-200 p-3 flex items-start gap-2">
            <Info className="w-4 h-4 text-violet-700 flex-shrink-0 mt-0.5" />
            <div className="text-[12px] text-violet-900 leading-snug">
              Водителей пока нет. Они нужны только если у контрагента есть услуги в прайс-листе
              со split-ценой (фикс мойщику + фикс водителю). Если split-услуг нет — оставьте пусто.
            </div>
          </div>
        )}

        {fields.map((field, idx) => (
          <div
            key={field.id}
            className="rounded-lg border border-slate-200 p-3 space-y-3 bg-slate-50/40"
          >
            <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-3 items-start">
              <div>
                <Label htmlFor={`drivers.${idx}.name`} className="text-[12px] font-semibold inline-flex items-center gap-1">
                  <UserCircle2 className="w-3 h-3" />
                  ФИО водителя
                </Label>
                <DriverNameInput control={control} idx={idx} />
              </div>
              <div>
                <Label htmlFor={`drivers.${idx}.phone`} className="text-[12px] font-semibold inline-flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  Телефон
                </Label>
                <DriverPhoneInput control={control} idx={idx} />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => remove(idx)}
                className="self-end text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                title="Удалить водителя"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
            <div>
              <Label htmlFor={`drivers.${idx}.plates`} className="text-[12px] font-semibold inline-flex items-center gap-1">
                <Truck className="w-3 h-3" />
                Закреплённые номера (по одному в строке)
              </Label>
              <DriverPlatesInput control={control} idx={idx} />
              <div className="text-[10px] text-slate-500 mt-1">
                Терминал авто-предложит этого водителя если введут совпадающий номер при оформлении split-услуги.
              </div>
            </div>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          onClick={() => append({ name: '', phone: '', plates: '' })}
          className="w-full border-dashed border-violet-300 text-violet-700 hover:bg-violet-50 hover:border-violet-400"
        >
          <Plus className="w-4 h-4 mr-1" />
          Добавить водителя
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Field input wrappers (используют register для type-safe) ───

function DriverNameInput({ control, idx }: { control: Control<any>; idx: number }) {
  return (
    <Input
      {...control.register(`drivers.${idx}.name`)}
      placeholder="Сидоров Пётр Анатольевич"
      autoComplete="off"
    />
  );
}

function DriverPhoneInput({ control, idx }: { control: Control<any>; idx: number }) {
  return (
    <Input
      {...control.register(`drivers.${idx}.phone`)}
      placeholder="+7 999 ..."
      autoComplete="off"
    />
  );
}

function DriverPlatesInput({ control, idx }: { control: Control<any>; idx: number }) {
  return (
    <Textarea
      {...control.register(`drivers.${idx}.plates`)}
      placeholder="К 905 ОЕ 50&#10;Н 218 МР 77"
      rows={2}
      className="font-mono text-[12px] resize-none"
    />
  );
}
