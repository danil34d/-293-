"use client";

import { useState } from 'react';
import { Star } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface SetActivePriceButtonProps {
  aggregatorId: string;
  priceListName: string;
  isActive: boolean;
}

export function SetActivePriceButton({ aggregatorId, priceListName, isActive }: SetActivePriceButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

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

  const handleClick = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/aggregators/${aggregatorId}/active-price`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activePriceListName: priceListName }),
      });
      if (res.ok) {
        router.refresh();
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        fontSize: '11px', color: '#6b7280', background: '#f3f4f6',
        padding: '2px 8px', borderRadius: '8px', border: '1px solid #d1d5db',
        cursor: loading ? 'wait' : 'pointer', fontWeight: 500
      }}
    >
      <Star className="h-3 w-3" />
      {loading ? '...' : 'Сделать активным'}
    </button>
  );
}
