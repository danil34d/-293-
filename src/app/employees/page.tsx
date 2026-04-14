
export const dynamic = 'force-dynamic';

import "@/styles/employees.css";
import Link from 'next/link';
import { PlusCircle, Edit, UserCog, Check, XIcon, Wallet, WalletCards, AlertTriangle } from 'lucide-react';
import type { Employee, SalaryScheme } from '@/types';
import { ROLE_LABELS } from '@/types';
import { DeleteConfirmationButton } from '@/components/common/DeleteConfirmationButton';
import { getEmployeesData, getSalarySchemesData } from '@/lib/data-loader';


export default async function EmployeesPage() {
  let employees: Employee[] = [];
  let salarySchemes: SalaryScheme[] = [];
  let fetchError: string | null = null;

  try {
    [employees, salarySchemes] = await Promise.all([
        getEmployeesData(),
        getSalarySchemesData()
    ]);
  } catch (error: any) {
    fetchError = error.message || "Не удалось загрузить список сотрудников.";
  }

  const schemeMap = new Map(salarySchemes.map(scheme => [scheme.id, scheme.name]));

  return (
    <div className="employees">
      {/* Page Header */}
      <div className="page-header-section">
        <div className="page-header-content">
          <div className="page-title-section">
            <h1>Сотрудники</h1>
            <p>Управляйте информацией о ваших сотрудниках и их доступом.</p>
          </div>
          <Link href="/employees/new" className="add-employee-btn">
            <PlusCircle className="h-4 w-4" />
            Добавить сотрудника
          </Link>
        </div>
      </div>

      {/* Error Alert */}
      {fetchError && (
        <div className="alert error">
          <AlertTriangle className="h-5 w-5" />
          <div>
            <div className="alert-title">Ошибка загрузки</div>
            <div className="alert-description">{fetchError}</div>
          </div>
        </div>
      )}

      {/* Employees Table */}
      <div className="employees-table-card">
        <div className="overflow-x-auto">
          <table className="employees-table">
            <thead>
              <tr className="employees-table-header">
                <th>ФИО</th>
                <th>Роль</th>
                <th>Логин</th>
                <th>Telegram ID</th>
                <th>Схема зарплаты</th>
                <th>Телефон</th>
                <th>Платежные реквизиты</th>
                <th className="text-center">Есть машина</th>
                <th className="text-right w-[120px]">Действия</th>
              </tr>
            </thead>
            <tbody>
              {!fetchError && employees.map((employee) => (
                <tr key={employee.id} className="employees-table-row">
                  <td className="employees-table-cell">
                    <div className="employee-name">{employee.fullName}</div>
                  </td>
                  <td className="employees-table-cell">
                    <div className="employee-username">{ROLE_LABELS[employee.role || 'employee'] || 'Сотрудник'}</div>
                  </td>
                  <td className="employees-table-cell">
                    <div className="employee-username">{employee.username || '-'}</div>
                  </td>
                  <td className="employees-table-cell">
                    <div className="employee-username">{employee.telegramChatId || '-'}</div>
                  </td>
                  <td className="employees-table-cell">
                    {employee.salarySchemeId ? (
                      <div className="salary-scheme-badge">
                        <Wallet className="h-3 w-3" />
                        {schemeMap.get(employee.salarySchemeId) || 'Неизвестная схема'}
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="employees-table-cell">{employee.phone}</td>
                  <td className="employees-table-cell">
                    <div className="payment-details">{employee.paymentDetails}</div>
                  </td>
                  <td className="employees-table-cell text-center">
                    <div className={`has-car-badge ${employee.hasCar ? 'yes' : 'no'}`}>
                      {employee.hasCar ? <Check className="h-4 w-4" /> : <XIcon className="h-4 w-4" />}
                    </div>
                  </td>
                  <td className="employees-table-cell text-right">
                    <div className="action-buttons">
                      <Link href={`/employees/${employee.id}/finance`} className="action-btn" aria-label={`Финансы ${employee.fullName}`}>
                        <WalletCards className="h-4 w-4" />
                      </Link>
                      <Link href={`/employees/${employee.id}/edit`} className="action-btn" aria-label={`Редактировать ${employee.fullName}`}>
                        <Edit className="h-4 w-4" />
                      </Link>
                      <DeleteConfirmationButton
                        apiPath="/api/employees"
                        entityId={employee.id}
                        entityName={employee.fullName}
                        toastTitle="Сотрудник удален"
                        toastDescription={`Сотрудник "${employee.fullName}" успешно удален.`}
                        description={
                          <>
                            Вы собираетесь безвозвратно удалить сотрудника <strong>{employee.fullName}</strong>.
                            Это действие нельзя отменить.
                          </>
                        }
                        trigger={
                          <button className="action-btn danger" aria-label={`Удалить ${employee.fullName}`}>
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        }
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {!fetchError && employees.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-state">
                      <div className="empty-icon">
                        <UserCog className="h-12 w-12" />
                      </div>
                      <div className="empty-title">Сотрудники не найдены</div>
                      <div className="empty-subtitle">Добавьте своего первого сотрудника</div>
                      <Link href="/employees/new" className="empty-action-btn">
                        <PlusCircle className="h-4 w-4 mr-2" />
                        Добавить сотрудника
                      </Link>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
