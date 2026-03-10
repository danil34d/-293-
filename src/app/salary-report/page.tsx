
export const dynamic = 'force-dynamic';

import "@/styles/salary-report.css";
import { AlertTriangle, Loader2 } from 'lucide-react';
import { SalaryReportClient } from './components/SalaryReportClient';
import { Suspense } from 'react';

export default async function SalaryReportPage() {
    return (
        <div className="salary-report">
            {/* Page Header */}
            <div className="page-header-section">
                <div className="page-header-content">
                    <div className="page-title-section">
                        <h1>Отчет по зарплате</h1>
                        <p>Анализ начисленной зарплаты и управление выплатами для сотрудников.</p>
                    </div>
                </div>
            </div>

            <Suspense fallback={
                <div className="loading-container">
                    <Loader2 className="loading-spinner" />
                    <p className="loading-text">Загрузка данных...</p>
                </div>
            }>
                <SalaryReportClient />
            </Suspense>
        </div>
    );
}
