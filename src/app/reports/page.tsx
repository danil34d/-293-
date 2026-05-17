export const dynamic = 'force-dynamic';

import "@/styles/reports.css";
import { AlertTriangle } from 'lucide-react';
import { getReportsData } from '@/lib/data';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AIReportGenerator } from './components/AIReportGenerator';
import { ReportsListClient } from './components/ReportsListClient';

async function fetchData() {
  try {
    const reports = await getReportsData();
    return { reports, error: null };
  } catch (e: any) {
    console.error('Failed to fetch reports page data:', e);
    return {
      error: e.message || 'Не удалось загрузить данные.',
      reports: [],
    };
  }
}

export default async function AIReportsPage() {
  const { reports, error } = await fetchData();

  if (error) {
    return (
      <div className="reports">
        <div className="page-header-section">
          <div className="page-header-content">
            <div className="page-title-section">
              <h1>AI-Аналитика</h1>
              <p>Ошибка загрузки данных.</p>
            </div>
          </div>
        </div>
        <div className="alert error">
          <AlertTriangle className="h-5 w-5" />
          <div>
            <div className="alert-title">Ошибка Загрузки</div>
            <div className="alert-description">{error}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="reports">
      <div className="page-header-section">
        <div className="page-header-content">
          <div className="page-title-section">
            <h1>AI-Аналитика</h1>
            <p>Сохранённые отчёты с persistence + быстрая генерация preview без сохранения.</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="saved" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="saved">📊 Сохранённые отчёты (БД)</TabsTrigger>
          <TabsTrigger value="quick">⚡ Быстрый AI (preview)</TabsTrigger>
        </TabsList>

        <TabsContent value="saved">
          <ReportsListClient initialReports={reports} />
        </TabsContent>

        <TabsContent value="quick">
          <AIReportGenerator />
        </TabsContent>
      </Tabs>
    </div>
  );
}
