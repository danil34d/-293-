
import "@/styles/settings.css";
import Link from 'next/link';
import { RetailPriceListForm } from './components/RetailPriceListForm';
import { DangerZone } from './components/DangerZone';
import { getWashEventsData, getEmployeesData } from '@/lib/data';
import type { WashEvent, Employee } from '@/types';
import { AlertTriangle, ScanLine, ChevronRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

async function fetchData() {
    try {
        const [washEvents, employees]: [WashEvent[], Employee[]] = await Promise.all([
            getWashEventsData(),
            getEmployeesData(),
        ]);
        return { washEvents, employees, error: null };
    } catch (e: any) {
        console.error("Failed to fetch data for settings page:", e);
        return { washEvents: [], employees: [], error: e.message || "Не удалось загрузить данные для анализа услуг." };
    }
}


export default async function SettingsPage() {
  const { washEvents, employees, error } = await fetchData();

  return (
    <div className="settings">
      <div className="page-header-section">
        <div className="page-header-content">
          <div className="page-title-section">
            <h1>Настройки 'Наличка'</h1>
            <p>Управляйте розничным прайс-листом для клиентов, оплачивающих наличными или картой.</p>
          </div>
        </div>
      </div>

      {error && (
         <div className="alert error">
          <AlertTriangle className="h-5 w-5" />
          <div>
            <div className="alert-title">Ошибка Загрузки</div>
            <div className="alert-description">{error}</div>
          </div>
        </div>
      )}

      <div className="price-list-form-card">
        <RetailPriceListForm allWashEvents={washEvents} allEmployees={employees} />
      </div>

      <div className="price-list-form-card" style={{ marginTop: '2rem' }}>
        <DangerZone />
      </div>

      {/* OCR Section */}
      <div style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px', color: '#374151' }}>
          Распознавание номеров (OCR)
        </h2>
        <Link
          href="/settings/ocr"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 20px', background: '#fff', border: '1px solid #e5e7eb',
            borderRadius: '10px', textDecoration: 'none', color: '#111827',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)', transition: 'box-shadow 0.15s',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '38px', height: '38px', borderRadius: '8px',
              background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <ScanLine size={20} style={{ color: '#3b82f6' }} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '14px' }}>Неудачные фото OCR</div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                Фото, которые не удалось распознать — для переобучения модели
              </div>
            </div>
          </div>
          <ChevronRight size={16} style={{ color: '#9ca3af' }} />
        </Link>
      </div>
    </div>
  );
}
