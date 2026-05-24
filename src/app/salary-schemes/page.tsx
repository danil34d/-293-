
export const dynamic = 'force-dynamic';

import "@/styles/salary-schemes.css";
import { AlertTriangle } from 'lucide-react';
import type { SalaryScheme, Aggregator, CounterAgent, Employee } from '@/types';
import {
  getSalarySchemesData,
  getAggregatorsData,
  getCounterAgentsData,
  getEmployeesData,
} from '@/lib/data';
import { SchemesTable } from './components/SchemesTable';


export default async function SalarySchemesPage() {
  let schemes: SalaryScheme[] = [];
  let aggregators: Aggregator[] = [];
  let counterAgents: CounterAgent[] = [];
  let employees: Employee[] = [];
  let fetchError: string | null = null;

  try {
    [schemes, aggregators, counterAgents, employees] = await Promise.all([
      getSalarySchemesData(),
      getAggregatorsData(),
      getCounterAgentsData(),
      getEmployeesData(),
    ]);
  } catch (error: any) {
    fetchError = error.message || "Не удалось загрузить данные.";
  }

  if (fetchError) {
    return (
      <div className="salary-schemes p-6">
        <div className="alert error">
          <AlertTriangle className="h-5 w-5" />
          <div>
            <div className="alert-title">Ошибка загрузки</div>
            <div className="alert-description">{fetchError}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="salary-schemes px-6 pb-12 max-w-[1200px]">
      <SchemesTable
        schemes={schemes}
        employees={employees}
        aggregators={aggregators}
        counterAgents={counterAgents}
      />
    </div>
  );
}
