
'use server';
/**
 * @fileoverview Defines a Genkit flow for generating a performance report.
 *
 * Phase 23 (улучшено): данные передаются AI не сырыми массивами, а pre-aggregated
 * summary (KPI + breakdown по сотрудникам/клиентам/услугам/категориям расходов).
 * Это даёт AI намного больше insight'ов при том же контексте. Также добавлен
 * сравнительный период (same-length period перед periodStart) для динамики.
 */
import 'dotenv/config';
import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import {
  getWashEventsData,
  getEmployeesData,
  getExpensesData,
  getAggregatorsData,
  getCounterAgentsData,
} from '@/lib/data';

// Schemas — internal only ('use server' files can only export async functions).
const performanceReportInputSchema = z.object({
  startDate: z.string().describe('The start date for the report period in ISO format.'),
  endDate: z.string().describe('The end date for the report period in ISO format.'),
  question: z.string().describe('The user\'s question about the report.'),
});
export type PerformanceReportInput = z.infer<typeof performanceReportInputSchema>;

const performanceReportOutputSchema = z.object({
  reportMarkdown: z.string().describe('The generated performance report in Markdown format.'),
});
export type PerformanceReportOutput = z.infer<typeof performanceReportOutputSchema>;

interface AggregatedReport {
  period: { from: string; to: string; days: number };
  prevPeriod: { from: string; to: string };
  kpi: {
    revenue: number;
    washes: number;
    avgCheck: number;
    expenses: number;
    profit: number;
    cashAcquiringFee: number;
  };
  prevKpi: {
    revenue: number;
    washes: number;
    avgCheck: number;
    expenses: number;
    profit: number;
  };
  // Δ change vs previous period (percent)
  deltas: {
    revenuePct: number | null;
    washesPct: number | null;
    avgCheckPct: number | null;
    expensesPct: number | null;
    profitPct: number | null;
  };
  daily: Array<{
    date: string;       // ISO date YYYY-MM-DD
    weekday: string;    // "Пн", "Вт"...
    revenue: number;
    washes: number;
  }>;
  byPaymentMethod: Record<string, { count: number; revenue: number }>;
  byClientType: {
    retail: { count: number; revenue: number };
    aggregator: { count: number; revenue: number };
    counterAgent: { count: number; revenue: number };
  };
  byAggregator: Array<{ name: string; washes: number; revenue: number }>;
  byCounterAgent: Array<{ name: string; washes: number; revenue: number }>;
  topServices: Array<{ name: string; count: number; revenue: number }>;
  topEmployees: Array<{ name: string; washes: number; shareRevenue: number }>; // share = доля выручки (учёт shared washes)
  expensesByCategory: Array<{ category: string; amount: number; count: number }>;
  unusualExpenses: Array<{ date: string; category: string; amount: number; description: string }>;
}

const WEEKDAYS_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

async function buildReportContext(periodStart: Date, periodEnd: Date): Promise<AggregatedReport> {
  const days = Math.max(1, Math.round((periodEnd.getTime() - periodStart.getTime()) / 86400000) + 1);
  const prevEnd = new Date(periodStart.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86400000);

  const [allWashEvents, allEmployees, allExpenses, allAggregators, allCounterAgents] = await Promise.all([
    getWashEventsData(),
    getEmployeesData(),
    getExpensesData(),
    getAggregatorsData(),
    getCounterAgentsData(),
  ]);

  const empMap = new Map(allEmployees.map(e => [e.id, e.fullName]));
  const aggMap = new Map(allAggregators.map(a => [a.id, a.name]));
  const ctaMap = new Map(allCounterAgents.map(c => [c.id, c.name]));

  // Filter wash events for current period (completed only — exclude dismissed)
  const inPeriod = (ts: string, s: Date, e: Date) => {
    const d = new Date(ts);
    return d >= s && d <= e;
  };
  const isCompleted = (w: any) => !w.status || w.status === 'completed' || w.status === 'restored';

  const currWashes = allWashEvents.filter(w => inPeriod(w.timestamp, periodStart, periodEnd) && isCompleted(w));
  const prevWashes = allWashEvents.filter(w => inPeriod(w.timestamp, prevStart, prevEnd) && isCompleted(w));
  const currExpenses = allExpenses.filter(e => inPeriod(e.date, periodStart, periodEnd));
  const prevExpenses = allExpenses.filter(e => inPeriod(e.date, prevStart, prevEnd));

  // KPI
  const sumRevenue = (arr: any[]) => arr.reduce((s, w) => s + (w.totalAmount || 0), 0);
  const sumExpenses = (arr: any[]) => arr.reduce((s, e) => s + (e.amount || 0), 0);
  const sumFee = (arr: any[]) => arr.reduce((s, w) => s + (w.acquiringFee || 0), 0);

  const currRevenue = sumRevenue(currWashes);
  const prevRevenue = sumRevenue(prevWashes);
  const currExp = sumExpenses(currExpenses);
  const prevExp = sumExpenses(prevExpenses);

  const kpi = {
    revenue: currRevenue,
    washes: currWashes.length,
    avgCheck: currWashes.length > 0 ? currRevenue / currWashes.length : 0,
    expenses: currExp,
    profit: currRevenue - currExp,
    cashAcquiringFee: sumFee(currWashes),
  };
  const prevKpi = {
    revenue: prevRevenue,
    washes: prevWashes.length,
    avgCheck: prevWashes.length > 0 ? prevRevenue / prevWashes.length : 0,
    expenses: prevExp,
    profit: prevRevenue - prevExp,
  };
  const pct = (curr: number, prev: number) =>
    prev === 0 ? null : Math.round(((curr - prev) / prev) * 1000) / 10;
  const deltas = {
    revenuePct: pct(kpi.revenue, prevKpi.revenue),
    washesPct: pct(kpi.washes, prevKpi.washes),
    avgCheckPct: pct(kpi.avgCheck, prevKpi.avgCheck),
    expensesPct: pct(kpi.expenses, prevKpi.expenses),
    profitPct: pct(kpi.profit, prevKpi.profit),
  };

  // Daily breakdown
  const dailyMap = new Map<string, { revenue: number; washes: number }>();
  for (const w of currWashes) {
    const d = new Date(w.timestamp);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const v = dailyMap.get(key) ?? { revenue: 0, washes: 0 };
    v.revenue += w.totalAmount || 0;
    v.washes += 1;
    dailyMap.set(key, v);
  }
  const daily = Array.from(dailyMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({
      date,
      weekday: WEEKDAYS_RU[new Date(date).getDay()],
      revenue: Math.round(v.revenue),
      washes: v.washes,
    }));

  // By payment method
  const byPaymentMethod: Record<string, { count: number; revenue: number }> = {};
  for (const w of currWashes) {
    const pm = w.paymentMethod || 'unknown';
    if (!byPaymentMethod[pm]) byPaymentMethod[pm] = { count: 0, revenue: 0 };
    byPaymentMethod[pm].count += 1;
    byPaymentMethod[pm].revenue += w.totalAmount || 0;
  }

  // By client type (retail / aggregator / counterAgent)
  const byClientType = {
    retail: { count: 0, revenue: 0 },
    aggregator: { count: 0, revenue: 0 },
    counterAgent: { count: 0, revenue: 0 },
  };
  for (const w of currWashes) {
    const amt = w.totalAmount || 0;
    if (w.counterAgentId) {
      byClientType.counterAgent.count += 1;
      byClientType.counterAgent.revenue += amt;
    } else if (w.aggregatorId) {
      byClientType.aggregator.count += 1;
      byClientType.aggregator.revenue += amt;
    } else {
      byClientType.retail.count += 1;
      byClientType.retail.revenue += amt;
    }
  }

  // By aggregator (top by revenue)
  const aggregatorMap = new Map<string, { name: string; washes: number; revenue: number }>();
  for (const w of currWashes) {
    if (!w.aggregatorId) continue;
    const name = aggMap.get(w.aggregatorId) ?? w.aggregatorId;
    const v = aggregatorMap.get(name) ?? { name, washes: 0, revenue: 0 };
    v.washes += 1;
    v.revenue += w.totalAmount || 0;
    aggregatorMap.set(name, v);
  }
  const byAggregator = Array.from(aggregatorMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // By counterAgent
  const ctaAccMap = new Map<string, { name: string; washes: number; revenue: number }>();
  for (const w of currWashes) {
    if (!w.counterAgentId) continue;
    const name = ctaMap.get(w.counterAgentId) ?? w.counterAgentId;
    const v = ctaAccMap.get(name) ?? { name, washes: 0, revenue: 0 };
    v.washes += 1;
    v.revenue += w.totalAmount || 0;
    ctaAccMap.set(name, v);
  }
  const byCounterAgent = Array.from(ctaAccMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Top services (по name из services.main + services.additional)
  const serviceMap = new Map<string, { count: number; revenue: number }>();
  for (const w of currWashes) {
    const services = (w as any).services;
    if (!services) continue;
    const all = [...(services.main ?? []), ...(services.additional ?? [])];
    for (const s of all) {
      const name = s?.serviceName ?? s?.name ?? 'Без названия';
      const price = s?.price ?? 0;
      const v = serviceMap.get(name) ?? { count: 0, revenue: 0 };
      v.count += 1;
      v.revenue += price;
      serviceMap.set(name, v);
    }
  }
  const topServices = Array.from(serviceMap.entries())
    .map(([name, v]) => ({ name, count: v.count, revenue: v.revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Top employees — учёт shared washes (1 мойка / N сотрудников = доля каждому)
  const empAcc = new Map<string, { name: string; washes: number; shareRevenue: number }>();
  for (const w of currWashes) {
    const eids = (w as any).employeeIds ?? [];
    if (eids.length === 0) continue;
    const share = (w.totalAmount || 0) / eids.length;
    for (const eid of eids) {
      const name = empMap.get(eid) ?? eid;
      const v = empAcc.get(eid) ?? { name, washes: 0, shareRevenue: 0 };
      v.washes += 1;
      v.shareRevenue += share;
      empAcc.set(eid, v);
    }
  }
  const topEmployees = Array.from(empAcc.values())
    .sort((a, b) => b.shareRevenue - a.shareRevenue)
    .slice(0, 10)
    .map(v => ({ name: v.name, washes: v.washes, shareRevenue: Math.round(v.shareRevenue) }));

  // Expenses by category
  const expCatMap = new Map<string, { amount: number; count: number }>();
  for (const e of currExpenses) {
    const v = expCatMap.get(e.category) ?? { amount: 0, count: 0 };
    v.amount += e.amount || 0;
    v.count += 1;
    expCatMap.set(e.category, v);
  }
  const expensesByCategory = Array.from(expCatMap.entries())
    .map(([category, v]) => ({ category, amount: Math.round(v.amount), count: v.count }))
    .sort((a, b) => b.amount - a.amount);

  // Unusual expenses (top 3 by amount, > 5% of total)
  const total = currExp || 1;
  const unusualExpenses = currExpenses
    .filter(e => (e.amount || 0) / total > 0.05)
    .sort((a, b) => (b.amount || 0) - (a.amount || 0))
    .slice(0, 5)
    .map(e => ({
      date: new Date(e.date).toISOString().slice(0, 10),
      category: e.category,
      amount: Math.round(e.amount || 0),
      description: (e.description || '').slice(0, 80),
    }));

  return {
    period: {
      from: periodStart.toISOString(),
      to: periodEnd.toISOString(),
      days,
    },
    prevPeriod: {
      from: prevStart.toISOString(),
      to: prevEnd.toISOString(),
    },
    kpi: {
      revenue: Math.round(kpi.revenue),
      washes: kpi.washes,
      avgCheck: Math.round(kpi.avgCheck),
      expenses: Math.round(kpi.expenses),
      profit: Math.round(kpi.profit),
      cashAcquiringFee: Math.round(kpi.cashAcquiringFee),
    },
    prevKpi: {
      revenue: Math.round(prevKpi.revenue),
      washes: prevKpi.washes,
      avgCheck: Math.round(prevKpi.avgCheck),
      expenses: Math.round(prevKpi.expenses),
      profit: Math.round(prevKpi.profit),
    },
    deltas,
    daily,
    byPaymentMethod,
    byClientType,
    byAggregator,
    byCounterAgent,
    topServices,
    topEmployees,
    expensesByCategory,
    unusualExpenses,
  };
}

const generationPrompt = `Ты — старший бизнес-аналитик автомойки "АвтомойкаПро". Твоя задача — подготовить
подробный аналитический отчёт на русском языке на основе **уже агрегированных данных**
(KPI, разбивки по сотрудникам/клиентам/услугам/категориям расходов, сравнение с предыдущим
периодом такой же длины). Все числа в данных — это рубли (₽).

Вопрос владельца: {{{question}}}

Агрегированные данные:
\`\`\`json
{{{businessData}}}
\`\`\`

Правила:
- Отчёт строго в Markdown.
- Все суммы — с разделителем тысяч и знаком ₽ (например, "127 450 ₽").
- Все доли — в процентах с одним знаком (например, "23.5%").
- Сравнение с прошлым периодом — в виде «(+12.3% vs прошлый период)» рядом с числом.
- Если deltas.*Pct = null — пишешь «(данных за прошлый период нет)».
- Не выдумывай данные, которых нет — если данные пустые, пиши «нет данных».
- Будь конкретным: называй имена сотрудников, названия агрегаторов/контрагентов, конкретные услуги, конкретные категории расходов.

Структура отчёта:

# Аналитический отчёт за период {period.from} — {period.to}

## 1. 📈 Ключевые показатели (KPI)
- **Выручка:** {kpi.revenue} ₽ (delta vs прошлый период)
- **Количество моек:** {kpi.washes} шт (delta)
- **Средний чек:** {kpi.avgCheck} ₽ (delta)
- **Расходы:** {kpi.expenses} ₽ (delta)
- **Эквайринг (комиссия банка):** {kpi.cashAcquiringFee} ₽
- **Прибыль:** {kpi.profit} ₽ (delta)
Одной фразой — общее впечатление от периода.

## 2. 📅 Динамика по дням
Опиши тренд (стабильно / растёт / падает / есть пики или провалы). Назови лучший и худший день
с числами. Если есть выходные в данных — отметь разницу с буднями.

## 3. 💳 Способы оплаты
Разбивка по paymentMethod (cash / card / online_aggregator / transfer и т.п.). Назови
самый популярный, посчитай долю эквайринга.

## 4. 👥 Клиентская база
Доли retail / aggregator / counterAgent в выручке. Самый крупный агрегатор и контрагент
(имя + сумма). Если есть концентрация (>50% выручки от одного клиента) — отметь это как риск.

## 5. 🚿 Топ услуг
Топ-5 услуг по выручке. Какая самая частая, какая самая дорогая. Если есть редкие но
дорогие — отметь как opportunity.

## 6. 👨‍🔧 Производительность сотрудников
Топ-3 сотрудника по доле выручки (shareRevenue — учёт парных смен). Имя + кол-во моек +
вклад в выручку. Если кто-то сильно выделяется — рассмотри премию. Если есть отстающие — отметь.

## 7. 💸 Расходы
Топ-3 категории по сумме. Необычные / крупные расходы (>5% от общих) — назови дату и
описание. Если расходы выросли значительно vs прошлый период — выдели.

## 8. 💡 Выводы и рекомендации (3-5 пунктов)
Конкретные actionable рекомендации с указанием суммы/процента/имени. Не общие фразы вроде
"повысить эффективность", а "запустить акцию X для Y, что должно дать +Z%".

Тон: профессиональный, дата-driven, без воды. Используй жирный шрифт для важных чисел,
списки для перечислений, эмодзи в заголовках для читаемости.`;


const generatePerformanceReportFlow = ai.defineFlow(
  {
    name: 'generatePerformanceReportFlow',
    inputSchema: performanceReportInputSchema,
    outputSchema: performanceReportOutputSchema,
  },
  async (input) => {
    const start = new Date(input.startDate);
    const end = new Date(input.endDate);
    const businessData = await buildReportContext(start, end);

    const renderedPrompt = generationPrompt
      .replace('{{{question}}}', input.question)
      .replace('{{{businessData}}}', JSON.stringify(businessData, null, 2));

    const llmResponse = await ai.generate({
      prompt: renderedPrompt,
      model: 'gemini-1.5-flash-latest',
    });

    const reportText = llmResponse.text || '';

    return {
      reportMarkdown: reportText,
    };
  }
);

export async function generatePerformanceReport(input: PerformanceReportInput): Promise<PerformanceReportOutput> {
  return generatePerformanceReportFlow(input);
}
