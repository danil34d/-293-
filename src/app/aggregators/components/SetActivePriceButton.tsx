"use client";

import { useState } from 'react';
import { Star } from 'lucide-react';
import type { Aggregator } from '@/types';
import { SwitchPriceModal } from './SwitchPriceModal';

interface SetActivePriceButtonProps {
  aggregator: Aggregator;
  priceListName: string;
  isActive: boolean;
}

/**
 * Phase 27a: раньше один клик делал прямой PUT и сменял активный прайс
 * без предупреждения — все будущие мойки пойдут по новому прайсу
 * (V2 README #7 orange safety gap).
 *
 * Теперь: клик открывает SwitchPriceModal с warning + 2 CheckItem +
 * сравнение текущего vs целевого прайса.
 */
export function SetActivePriceButton({ aggregator, priceListName, isActive }: SetActivePriceButtonProps) {
  const [modalOpen, setModalOpen] = useState(false);

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
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
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

      <SwitchPriceModal
        aggregator={aggregator}
        targetPriceListName={modalOpen ? priceListName : null}
        open={modalOpen}
        onOpenChange={setModalOpen}
      />
    </>
  );
}
