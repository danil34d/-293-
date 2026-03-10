import React from 'react';
import { Clock, Car } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

interface WashEvent {
  id: string;
  vehicleNumber: string;
  paymentMethod: string;
  sourceName?: string;
  totalAmount: number;
  timestamp: string;
}

interface ZorinRecentActivityProps {
  washEvents: WashEvent[];
  periodDescription: string;
}

const paymentMethodTranslations: Record<string, string> = {
  cash: 'Наличные',
  card: 'Карта',
  transfer: 'Перевод',
  aggregator: 'Агрегатор',
  counterAgentContract: 'Контрагент',
};

export function ZorinRecentActivity({ washEvents, periodDescription }: ZorinRecentActivityProps) {
  if (washEvents.length === 0) {
    return (
      <div className="zorin-activity-card">
        <div className="zorin-activity-header">
          <div className="zorin-activity-icon">
            <Clock size={20} />
          </div>
          <h2 className="zorin-activity-title">
            Последние мойки ({periodDescription})
          </h2>
        </div>

        <div className="zorin-empty-state">
          <div className="zorin-empty-state-icon">
            <Car size={32} />
          </div>
          <p className="zorin-empty-state-text">Нет зарегистрированных моек</p>
          <p className="zorin-empty-state-subtext">за выбранный период</p>
        </div>
      </div>
    );
  }

  return (
    <div className="zorin-activity-card">
      <div className="zorin-activity-header">
        <div className="zorin-activity-icon">
          <Clock size={20} />
        </div>
        <h2 className="zorin-activity-title">
          Последние мойки ({periodDescription})
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="zorin-activity-table">
          <tbody>
            {washEvents.map((event) => (
              <tr key={event.id} className="zorin-activity-row">
                <td className="zorin-activity-cell vehicle">
                  <div className="flex items-center gap-2">
                    <Car size={16} className="text-blue-500" />
                    {event.vehicleNumber}
                  </div>
                </td>
                <td className="zorin-activity-cell">
                  {paymentMethodTranslations[event.paymentMethod] ||
                   event.sourceName ||
                   'Неизвестно'}
                </td>
                <td className="zorin-activity-cell amount">
                  {event.totalAmount.toLocaleString('ru-RU')} руб.
                </td>
                <td className="zorin-activity-cell date">
                  {format(new Date(event.timestamp), 'dd MMM, HH:mm', {
                    locale: ru
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}