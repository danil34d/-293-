import React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ZorinMetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  variant?: 'default' | 'primary' | 'success' | 'danger' | 'warning' | 'info';
  onClick?: () => void;
  children?: React.ReactNode;
}

export function ZorinMetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = 'default',
  onClick,
  children
}: ZorinMetricCardProps) {
  const formatValue = (val: string | number) => {
    if (typeof val === 'number') {
      return val.toLocaleString('ru-RU');
    }
    return val;
  };

  return (
    <div
      className={cn(
        'zorin-metric-card',
        `zorin-metric-card.${variant}`,
        onClick && 'cursor-pointer'
      )}
      onClick={onClick}
    >
      <div className="zorin-metric-header">
        <h3 className="zorin-metric-title">{title}</h3>
        <div className="zorin-metric-icon">
          <Icon size={24} />
        </div>
      </div>

      <div className="zorin-metric-value">
        {formatValue(value)}
      </div>

      {subtitle && (
        <p className="zorin-metric-subtitle">{subtitle}</p>
      )}

      {children}
    </div>
  );
}