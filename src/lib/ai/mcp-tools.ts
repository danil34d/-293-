/**
 * MCP Tools for AI Assistant
 * These tools allow the GLM AI to access car wash data and perform analytics
 */

import type { GLMToolDefinition } from '@/types/ai-assistant';
import {
  getWashEventsData,
  getEmployeesData,
  getAggregatorsData,
  getCounterAgentsData,
  getExpensesData,
  getSalarySchemesData,
  getRetailPriceConfig,
  getInventory,
  getStockMovementsData,
  getEmployeeCanistersData,
} from '@/lib/data';
import { generateCustomDOCX } from './docx-generator';
import { generateExcelTable } from './excel-generator';

/**
 * MCP Tool Definitions for GLM
 */
export const mcpTools: GLMToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'get_wash_events',
      description: 'Получить события мойки (wash events) за указанный период. Возвращает информацию о мойках автомобилей, выручке, оплатах.',
      parameters: {
        type: 'object',
        properties: {
          start_date: {
            type: 'string',
            description: 'Начальная дата в формате YYYY-MM-DD (опционально, по умолчанию - последние 30 дней)',
          },
          end_date: {
            type: 'string',
            description: 'Конечная дата в формате YYYY-MM-DD (опционально, по умолчанию - сегодня)',
          },
          employee_id: {
            type: 'string',
            description: 'ID сотрудника для фильтрации (опционально)',
          },
          limit: {
            type: 'number',
            description: 'Максимальное количество записей (по умолчанию 100)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_employees',
      description: 'Получить список сотрудников автомойки с их данными (ФИО, должность, зарплатная схема, контакты)',
      parameters: {
        type: 'object',
        properties: {
          include_dismissed: {
            type: 'boolean',
            description: 'Включать ли уволенных сотрудников (по умолчанию false)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'calculate_revenue_stats',
      description: 'Рассчитать статистику выручки за указанный период (общая выручка, средний чек, количество моек, топ сотрудников)',
      parameters: {
        type: 'object',
        properties: {
          start_date: {
            type: 'string',
            description: 'Начальная дата в формате YYYY-MM-DD',
          },
          end_date: {
            type: 'string',
            description: 'Конечная дата в формате YYYY-MM-DD',
          },
          group_by: {
            type: 'string',
            enum: ['day', 'week', 'month'],
            description: 'Группировка данных по дням, неделям или месяцам',
          },
        },
        required: ['start_date', 'end_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_employee_performance',
      description: 'Получить показатели эффективности сотрудников (количество моек, выручка, средний чек)',
      parameters: {
        type: 'object',
        properties: {
          start_date: {
            type: 'string',
            description: 'Начальная дата в формате YYYY-MM-DD',
          },
          end_date: {
            type: 'string',
            description: 'Конечная дата в формате YYYY-MM-DD',
          },
          employee_id: {
            type: 'string',
            description: 'ID конкретного сотрудника (опционально)',
          },
        },
        required: ['start_date', 'end_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_expenses_summary',
      description: 'Получить сводку по расходам автомойки (категории, суммы, динамика)',
      parameters: {
        type: 'object',
        properties: {
          start_date: {
            type: 'string',
            description: 'Начальная дата в формате YYYY-MM-DD',
          },
          end_date: {
            type: 'string',
            description: 'Конечная дата в формате YYYY-MM-DD',
          },
          category: {
            type: 'string',
            description: 'Категория расходов для фильтрации (опционально)',
          },
        },
        required: ['start_date', 'end_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_inventory_status',
      description: 'Получить текущий статус склада (материалы, количество, уровень запасов)',
      parameters: {
        type: 'object',
        properties: {
          low_stock_only: {
            type: 'boolean',
            description: 'Показать только материалы с низким уровнем запасов',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compare_periods',
      description: 'Сравнить показатели между двумя периодами (выручка, количество моек, средний чек)',
      parameters: {
        type: 'object',
        properties: {
          period1_start: {
            type: 'string',
            description: 'Начало первого периода (YYYY-MM-DD)',
          },
          period1_end: {
            type: 'string',
            description: 'Конец первого периода (YYYY-MM-DD)',
          },
          period2_start: {
            type: 'string',
            description: 'Начало второго периода (YYYY-MM-DD)',
          },
          period2_end: {
            type: 'string',
            description: 'Конец второго периода (YYYY-MM-DD)',
          },
        },
        required: ['period1_start', 'period1_end', 'period2_start', 'period2_end'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_word_document',
      description: 'Создать Word документ (DOCX) с указанным содержимым. Используй для экспорта отчётов, анализов, результатов запросов в формат DOCX. Поддерживает Markdown форматирование (жирный, курсив, заголовки, списки).',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Заголовок документа',
          },
          content: {
            type: 'string',
            description: 'Содержимое документа в формате Markdown',
          },
          filename: {
            type: 'string',
            description: 'Имя файла без расширения (опционально, по умолчанию генерируется автоматически)',
          },
        },
        required: ['title', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_excel_table',
      description: 'Создать Excel таблицу (XLSX) с данными. Используй для экспорта табличных данных, отчётов, статистики. Автоматически форматирует таблицу с заголовками, цветами, границами.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Заголовок таблицы/отчёта',
          },
          headers: {
            type: 'array',
            items: { type: 'string' },
            description: 'Массив заголовков колонок, например: ["Сотрудник", "Выручка", "Моек"]',
          },
          rows: {
            type: 'array',
            items: {
              type: 'array',
              items: {},
            },
            description: 'Массив массивов с данными, например: [["Иван", 50000, 25], ["Пётр", 45000, 22]]',
          },
          filename: {
            type: 'string',
            description: 'Имя файла без расширения (опционально)',
          },
        },
        required: ['title', 'headers', 'rows'],
      },
    },
  },
];

/**
 * Helper function to parse dates
 */
function parseDate(dateStr: string | undefined, defaultValue: Date): Date {
  if (!dateStr) return defaultValue;
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? defaultValue : parsed;
}

/**
 * Filter events by date range
 */
function filterEventsByDate(events: any[], startDate: Date, endDate: Date) {
  return events.filter(event => {
    const eventDate = new Date(event.timestamp);
    return eventDate >= startDate && eventDate <= endDate;
  });
}

/**
 * MCP Tool Executor
 * Executes the requested tool and returns the result
 */
export async function executeMCPTool(toolName: string, parameters: any): Promise<any> {
  console.log(`[MCP] Executing tool: ${toolName}`, parameters);

  try {
    switch (toolName) {
      case 'get_wash_events': {
        const washEvents = await getWashEventsData();
        const endDate = parseDate(parameters.end_date, new Date());
        const startDate = parseDate(parameters.start_date, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

        let filtered = filterEventsByDate(washEvents, startDate, endDate);

        if (parameters.employee_id) {
          filtered = filtered.filter(e => e.employeeId === parameters.employee_id);
        }

        const limit = parameters.limit || 100;
        const limited = filtered.slice(-limit);

        return {
          success: true,
          data: limited,
          total: filtered.length,
          showing: limited.length,
        };
      }

      case 'get_employees': {
        const employees = await getEmployeesData();
        const includeDismissed = parameters.include_dismissed || false;

        const filtered = includeDismissed
          ? employees
          : employees.filter(e => !(e as any).isDismissed);

        return {
          success: true,
          data: filtered,
          total: filtered.length,
        };
      }

      case 'calculate_revenue_stats': {
        const washEvents = await getWashEventsData();
        const startDate = parseDate(parameters.start_date, new Date());
        const endDate = parseDate(parameters.end_date, new Date());

        const filtered = filterEventsByDate(washEvents, startDate, endDate);

        const totalRevenue = filtered.reduce((sum, e) => sum + (e.paidWithCash || 0) + (e.paidWithCard || 0) + (e.paidWithTransfer || 0), 0);
        const totalWashes = filtered.length;
        const averageCheck = totalWashes > 0 ? totalRevenue / totalWashes : 0;

        // Group by employee
        const byEmployee: Record<string, { revenue: number; washes: number; name: string }> = {};
        for (const event of filtered) {
          const empId = event.employeeId || 'unknown';
          if (!byEmployee[empId]) {
            byEmployee[empId] = { revenue: 0, washes: 0, name: event.employeeName || 'Unknown' };
          }
          byEmployee[empId].revenue += (event.paidWithCash || 0) + (event.paidWithCard || 0) + (event.paidWithTransfer || 0);
          byEmployee[empId].washes++;
        }

        const topEmployees = Object.entries(byEmployee)
          .map(([id, data]) => ({ id, ...data, avgCheck: data.washes > 0 ? data.revenue / data.washes : 0 }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 10);

        // Group by time period if requested
        let grouped: any[] = [];
        if (parameters.group_by) {
          const groupMap = new Map<string, { revenue: number; washes: number; date: string }>();

          for (const event of filtered) {
            const eventDate = new Date(event.timestamp);
            let key: string;

            if (parameters.group_by === 'day') {
              key = eventDate.toISOString().split('T')[0];
            } else if (parameters.group_by === 'week') {
              const weekStart = new Date(eventDate);
              weekStart.setDate(eventDate.getDate() - eventDate.getDay());
              key = weekStart.toISOString().split('T')[0];
            } else {
              key = `${eventDate.getFullYear()}-${String(eventDate.getMonth() + 1).padStart(2, '0')}`;
            }

            if (!groupMap.has(key)) {
              groupMap.set(key, { revenue: 0, washes: 0, date: key });
            }
            const group = groupMap.get(key)!;
            group.revenue += (event.paidWithCash || 0) + (event.paidWithCard || 0) + (event.paidWithTransfer || 0);
            group.washes++;
          }

          grouped = Array.from(groupMap.values()).sort((a, b) => a.date.localeCompare(b.date));
        }

        return {
          success: true,
          data: {
            totalRevenue,
            totalWashes,
            averageCheck,
            topEmployees,
            grouped: grouped.length > 0 ? grouped : undefined,
          },
        };
      }

      case 'get_employee_performance': {
        const washEvents = await getWashEventsData();
        const employees = await getEmployeesData();
        const startDate = parseDate(parameters.start_date, new Date());
        const endDate = parseDate(parameters.end_date, new Date());

        let filtered = filterEventsByDate(washEvents, startDate, endDate);

        if (parameters.employee_id) {
          filtered = filtered.filter(e => e.employeeId === parameters.employee_id);
        }

        const performance: Record<string, { name: string; washes: number; revenue: number; cash: number; card: number; transfer: number }> = {};

        for (const event of filtered) {
          const empId = event.employeeId || 'unknown';
          if (!performance[empId]) {
            const emp = employees.find(e => e.id === empId);
            performance[empId] = {
              name: emp?.fullName || 'Unknown',
              washes: 0,
              revenue: 0,
              cash: 0,
              card: 0,
              transfer: 0,
            };
          }

          performance[empId].washes++;
          performance[empId].cash += event.paidWithCash || 0;
          performance[empId].card += event.paidWithCard || 0;
          performance[empId].transfer += event.paidWithTransfer || 0;
          performance[empId].revenue += (event.paidWithCash || 0) + (event.paidWithCard || 0) + (event.paidWithTransfer || 0);
        }

        const result = Object.entries(performance).map(([id, data]) => ({
          employeeId: id,
          ...data,
          averageCheck: data.washes > 0 ? data.revenue / data.washes : 0,
        }));

        return {
          success: true,
          data: result,
        };
      }

      case 'get_expenses_summary': {
        const expenses = await getExpensesData();
        const startDate = parseDate(parameters.start_date, new Date());
        const endDate = parseDate(parameters.end_date, new Date());

        let filtered = expenses.filter(expense => {
          const expenseDate = new Date(expense.date);
          return expenseDate >= startDate && expenseDate <= endDate;
        });

        if (parameters.category) {
          filtered = filtered.filter(e => e.category === parameters.category);
        }

        const totalExpenses = filtered.reduce((sum, e) => sum + e.amount, 0);

        const byCategory: Record<string, number> = {};
        for (const expense of filtered) {
          byCategory[expense.category] = (byCategory[expense.category] || 0) + expense.amount;
        }

        return {
          success: true,
          data: {
            totalExpenses,
            count: filtered.length,
            byCategory,
            expenses: filtered,
          },
        };
      }

      case 'get_inventory_status': {
        const inventory = await getInventory();

        if (!inventory || !inventory.materials) {
          return { success: true, data: { materials: [] } };
        }

        let materials = inventory.materials;

        if (parameters.low_stock_only) {
          materials = materials.filter(m =>
            m.currentStock <= (m.minStock || 0)
          );
        }

        return {
          success: true,
          data: {
            materials: materials.map(m => ({
              id: m.id,
              name: m.name,
              unit: m.unit,
              currentStock: m.currentStock,
              minStock: m.minStock,
              isLowStock: m.currentStock <= (m.minStock || 0),
            })),
          },
        };
      }

      case 'compare_periods': {
        const washEvents = await getWashEventsData();

        const period1Start = parseDate(parameters.period1_start, new Date());
        const period1End = parseDate(parameters.period1_end, new Date());
        const period2Start = parseDate(parameters.period2_start, new Date());
        const period2End = parseDate(parameters.period2_end, new Date());

        const period1Events = filterEventsByDate(washEvents, period1Start, period1End);
        const period2Events = filterEventsByDate(washEvents, period2Start, period2End);

        const calculateStats = (events: any[]) => {
          const revenue = events.reduce((sum, e) => sum + (e.paidWithCash || 0) + (e.paidWithCard || 0) + (e.paidWithTransfer || 0), 0);
          const washes = events.length;
          const avgCheck = washes > 0 ? revenue / washes : 0;
          return { revenue, washes, avgCheck };
        };

        const period1Stats = calculateStats(period1Events);
        const period2Stats = calculateStats(period2Events);

        const revenueChange = period1Stats.revenue > 0
          ? ((period2Stats.revenue - period1Stats.revenue) / period1Stats.revenue) * 100
          : 0;
        const washesChange = period1Stats.washes > 0
          ? ((period2Stats.washes - period1Stats.washes) / period1Stats.washes) * 100
          : 0;
        const avgCheckChange = period1Stats.avgCheck > 0
          ? ((period2Stats.avgCheck - period1Stats.avgCheck) / period1Stats.avgCheck) * 100
          : 0;

        return {
          success: true,
          data: {
            period1: {
              start: parameters.period1_start,
              end: parameters.period1_end,
              ...period1Stats,
            },
            period2: {
              start: parameters.period2_start,
              end: parameters.period2_end,
              ...period2Stats,
            },
            changes: {
              revenueChange: `${revenueChange.toFixed(1)}%`,
              washesChange: `${washesChange.toFixed(1)}%`,
              avgCheckChange: `${avgCheckChange.toFixed(1)}%`,
            },
          },
        };
      }

      case 'generate_word_document': {
        const { title, content, filename } = parameters;

        if (!title || !content) {
          return {
            success: false,
            error: 'Title and content are required',
          };
        }

        const filePath = await generateCustomDOCX({
          title,
          content,
          filename,
        });

        return {
          success: true,
          data: {
            message: 'Word документ успешно создан!',
            downloadUrl: filePath,
            filename: filePath.split('/').pop(),
          },
        };
      }

      case 'generate_excel_table': {
        const { title, headers, rows, filename } = parameters;

        if (!title || !headers || !rows) {
          return {
            success: false,
            error: 'Title, headers, and rows are required',
          };
        }

        if (!Array.isArray(headers) || !Array.isArray(rows)) {
          return {
            success: false,
            error: 'Headers and rows must be arrays',
          };
        }

        const filePath = await generateExcelTable({
          title,
          headers,
          rows,
          filename,
        });

        return {
          success: true,
          data: {
            message: 'Excel таблица успешно создана!',
            downloadUrl: filePath,
            filename: filePath.split('/').pop(),
          },
        };
      }

      default:
        return {
          success: false,
          error: `Unknown tool: ${toolName}`,
        };
    }
  } catch (error: any) {
    console.error(`[MCP] Error executing tool ${toolName}:`, error);
    return {
      success: false,
      error: error.message,
    };
  }
}
