
export const dynamic = 'force-dynamic';

import "@/styles/reports.css";
import { BrainCircuit } from 'lucide-react';
import { AIReportGenerator } from './components/AIReportGenerator';

export default async function AIReportsPage() {
  return (
    <div className="reports">
      <div className="page-header-section">
        <div className="page-header-content">
          <div className="page-title-section">
            <h1>AI-Аналитика</h1>
            <p>Создавайте информативные отчеты об операциях вашей автомойки с помощью искусственного интеллекта.</p>
          </div>
        </div>
      </div>
      <AIReportGenerator />
    </div>
  );
}
