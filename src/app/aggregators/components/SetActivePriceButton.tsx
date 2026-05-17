"use client";

import { Star } from 'lucide-react';
import type { Aggregator } from '@/types';

interface SetActivePriceButtonProps {
  aggregator: Aggregator;
  priceListName: string;
  isActive: boolean;
  /** Phase 27a: callback в parent (AggregatorsSearch держит state модала
   *  чтобы он не unmount-ился вместе с popover prайс-листов). */
  onRequestSwitch?: (aggregator: Aggregator, targetPriceListName: string) => void;
}

/**
 * Phase 27a: раньше один клик делал прямой PUT и сменял активный прайс
 * без предупреждения — все будущие мойки пойдут по новому прайсу
 * (V2 README #7 orange safety gap).
 *
 * Теперь: клик вызывает onRequestSwitch — AggregatorsSearch открывает
 * SwitchPriceModal с warning + 2 CheckItem + сравнение текущего vs
 * целевого прайса. Модал живёт в parent чтобы не закрывался когда popover
 * прайс-листов сворачивается.
 */
export function SetActivePriceButton({ aggregator, priceListName, isActive, onRequestSwitch }: SetActivePriceButtonProps) {
  if (isActive) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        fontSize: '11px', color: '#ca8a04', background: '#fef9c3',
        padding: '2px 8px', borderRadius: '8px', fontWeight: 600
      }}>
        <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
        Активен
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onRequestSwitch?.(aggregator, priceListName)}
      title="Открыть подтверждение смены прайса"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        fontSize: '11px', color: '#6b7280', background: '#f3f4f6',
        padding: '2px 8px', borderRadius: '8px', border: '1px solid #d1d5db',
        cursor: 'pointer', fontWeight: 500,
      }}
    >
      <Star className="h-3 w-3" />
      Сделать активным
    </button>
  );
}
