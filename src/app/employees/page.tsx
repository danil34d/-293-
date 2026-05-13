
export const dynamic = 'force-dynamic';

import "@/styles/employees.css";
import { AlertTriangle } from 'lucide-react';
import type { Employee, SalaryScheme } from '@/types';
import { getEmployeesData, getSalarySchemesData } from '@/lib/data';
import { EmployeesTable } from './components/EmployeesTable';


export default async function EmployeesPage() {
  let employees: Employee[] = [];
  let salarySchemes: SalaryScheme[] = [];
  let fetchError: string | null = null;

  try {
    const [allEmployees, schemes] = await Promise.all([
        getEmployeesData(),
        getSalarySchemesData()
    ]);
    // Phase 6.2: НЕ фильтруем kiosk на server-стороне — client-component сам решит
    // по `role` через role-фильтр. Архивных также включаем — UI покажет через фильтр.
    employees = allEmployees;
    salarySchemes = schemes;
  } catch (error: any) {
    fetchError = error.message || "Не удалось загрузить список сотрудников.";
  }

  if (fetchError) {
    return (
      <div className="employees p-6">
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
    <div className="employees px-6 pb-12 max-w-[1400px]">
      <EmployeesTable employees={employees} salarySchemes={salarySchemes} />
    </div>
  );
}
