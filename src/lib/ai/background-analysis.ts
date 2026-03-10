/**
 * Background Analysis Module
 * Performs automated analysis of car wash data using GLM AI
 */

import { getGLMClient } from './glm-client';
import { executeMCPTool } from './mcp-tools';
import {
  createBackgroundAnalysis,
  updateBackgroundAnalysis,
  getBackgroundAnalyses,
} from '@/lib/db/ai-database';
import type { GLMMessage } from '@/types/ai-assistant';

/**
 * Daily Summary Analysis
 * Analyzes yesterday's performance and generates insights
 */
export async function runDailySummaryAnalysis(): Promise<void> {
  console.log('[Background Analysis] Starting daily summary...');

  const analysis = createBackgroundAnalysis('daily_summary', 10);

  try {
    updateBackgroundAnalysis(analysis.id, { status: 'processing' });

    // Calculate date range (yesterday, fallback to last available data)
    const today = new Date();
    let endDate = new Date(today);
    endDate.setDate(endDate.getDate() - 1);
    let startDate = new Date(endDate);

    let startDateStr = startDate.toISOString().split('T')[0];
    let endDateStr = endDate.toISOString().split('T')[0];

    // Get revenue stats
    let revenueStats = await executeMCPTool('calculate_revenue_stats', {
      start_date: startDateStr,
      end_date: endDateStr,
    });

    // Fallback to last 30 days if no data yesterday
    if (!revenueStats.data || revenueStats.data.totalWashes === 0) {
      console.log('[Background Analysis] No data yesterday, using last 30 days...');
      startDate = new Date(today);
      startDate.setDate(startDate.getDate() - 30);
      startDateStr = startDate.toISOString().split('T')[0];
      endDateStr = today.toISOString().split('T')[0];
    }

    // Get all data for the selected period
    revenueStats = await executeMCPTool('calculate_revenue_stats', {
      start_date: startDateStr,
      end_date: endDateStr,
    });

    const employeePerf = await executeMCPTool('get_employee_performance', {
      start_date: startDateStr,
      end_date: endDateStr,
    });

    const expenses = await executeMCPTool('get_expenses_summary', {
      start_date: startDateStr,
      end_date: endDateStr,
    });

    console.log('[Background Analysis] Daily summary period:', startDateStr, 'to', endDateStr);

    // Prepare context for GLM
    const systemPrompt: GLMMessage = {
      role: 'system',
      content: `Ты - аналитик автомойки. Проанализируй данные за вчерашний день (${startDate}) и создай краткий отчёт.

Включи в отчёт:
- Общую выручку и количество моек
- Топ сотрудников по выручке
- Необычные показатели или проблемы
- Краткие рекомендации

Формат: краткий, конкретный, без воды. Максимум 200 слов.`,
    };

    const dataContext: GLMMessage = {
      role: 'user',
      content: `Данные за ${startDate}:

**Выручка:**
${JSON.stringify(revenueStats.data, null, 2)}

**Производительность сотрудников:**
${JSON.stringify(employeePerf.data, null, 2)}

**Расходы:**
${JSON.stringify(expenses.data, null, 2)}

Проанализируй эти данные.`,
    };

    const glmClient = getGLMClient();
    const response = await glmClient.chat({
      messages: [systemPrompt, dataContext],
      // model берётся из настроек через getGLMClient()
      temperature: 0.7,
    });

    console.log('[Background Analysis] GLM Response:', JSON.stringify(response, null, 2));

    if (!response.choices || response.choices.length === 0) {
      throw new Error('GLM API returned no choices in response');
    }

    const summary = response.choices[0].message.content || 'Не удалось сгенерировать отчёт';

    // Save result
    updateBackgroundAnalysis(analysis.id, {
      status: 'completed',
      result_data: {
        date: startDate,
        summary,
        revenue: revenueStats.data,
        employees: employeePerf.data,
        expenses: expenses.data,
      },
    });

    console.log('[Background Analysis] Daily summary completed:', analysis.id);
  } catch (error: any) {
    console.error('[Background Analysis] Daily summary failed:', error);
    updateBackgroundAnalysis(analysis.id, {
      status: 'failed',
      error_message: error.message,
    });
  }
}

/**
 * Employee Performance Analysis
 * Analyzes employee performance over the last 7 days
 */
export async function runEmployeePerformanceAnalysis(): Promise<void> {
  console.log('[Background Analysis] Starting employee performance analysis...');

  const analysis = createBackgroundAnalysis('employee_performance', 5);

  try {
    updateBackgroundAnalysis(analysis.id, { status: 'processing' });

    // Calculate date range (last 7 days, fallback to 30 days if no data)
    const endDate = new Date();
    let startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    let startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // Get employee performance
    let employeePerf = await executeMCPTool('get_employee_performance', {
      start_date: startDateStr,
      end_date: endDateStr,
    });

    console.log('[Background Analysis] Employee performance data (7 days):', JSON.stringify(employeePerf, null, 2));

    // Fallback to 30 days if no data found
    if (!employeePerf.data || employeePerf.data.length === 0) {
      console.log('[Background Analysis] No data in last 7 days, trying last 30 days...');
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      startDateStr = startDate.toISOString().split('T')[0];

      employeePerf = await executeMCPTool('get_employee_performance', {
        start_date: startDateStr,
        end_date: endDateStr,
      });

      console.log('[Background Analysis] Employee performance data (30 days):', JSON.stringify(employeePerf, null, 2));
    }

    // Prepare context for GLM
    const systemPrompt: GLMMessage = {
      role: 'system',
      content: `Ты - HR аналитик автомойки. Проанализируй производительность сотрудников за последние 7 дней.

Определи:
- Лучших исполнителей (топ-3)
- Сотрудников, которым нужна помощь или обучение
- Необычные паттерны (резкое снижение/повышение производительности)
- Рекомендации по мотивации и управлению

Формат: конкретный, действенный. Максимум 250 слов.`,
    };

    const dataContext: GLMMessage = {
      role: 'user',
      content: `Производительность сотрудников (${startDateStr} - ${endDateStr}):

${JSON.stringify(employeePerf.data, null, 2)}

Проанализируй и дай рекомендации.`,
    };

    const glmClient = getGLMClient();
    const response = await glmClient.chat({
      messages: [systemPrompt, dataContext],
      // model берётся из настроек через getGLMClient()
      temperature: 0.7,
    });

    console.log('[Background Analysis] GLM Response:', JSON.stringify(response, null, 2));

    if (!response.choices || response.choices.length === 0) {
      throw new Error('GLM API returned no choices in response');
    }

    const analysis_text = response.choices[0].message.content || 'Не удалось сгенерировать анализ';

    // Save result
    updateBackgroundAnalysis(analysis.id, {
      status: 'completed',
      result_data: {
        period: { start: startDateStr, end: endDateStr },
        analysis: analysis_text,
        data: employeePerf.data,
      },
    });

    console.log('[Background Analysis] Employee performance analysis completed:', analysis.id);
  } catch (error: any) {
    console.error('[Background Analysis] Employee performance analysis failed:', error);
    updateBackgroundAnalysis(analysis.id, {
      status: 'failed',
      error_message: error.message,
    });
  }
}

/**
 * Anomaly Detection
 * Detects unusual patterns in revenue, expenses, or performance
 */
export async function runAnomalyDetection(): Promise<void> {
  console.log('[Background Analysis] Starting anomaly detection...');

  const analysis = createBackgroundAnalysis('anomaly_detection', 8);

  try {
    updateBackgroundAnalysis(analysis.id, { status: 'processing' });

    // Compare last 7 days with previous 7 days
    const today = new Date();
    const period2End = new Date(today);
    const period2Start = new Date(today);
    period2Start.setDate(today.getDate() - 7);

    const period1End = new Date(period2Start);
    period1End.setDate(period1End.getDate() - 1);
    const period1Start = new Date(period1End);
    period1Start.setDate(period1End.getDate() - 7);

    const p1Start = period1Start.toISOString().split('T')[0];
    const p1End = period1End.toISOString().split('T')[0];
    const p2Start = period2Start.toISOString().split('T')[0];
    const p2End = period2End.toISOString().split('T')[0];

    // Compare periods
    const comparison = await executeMCPTool('compare_periods', {
      period1_start: p1Start,
      period1_end: p1End,
      period2_start: p2Start,
      period2_end: p2End,
    });

    // Get inventory status for low stock warnings
    const inventory = await executeMCPTool('get_inventory_status', {
      low_stock_only: true,
    });

    // Prepare context for GLM
    const systemPrompt: GLMMessage = {
      role: 'system',
      content: `Ты - система мониторинга автомойки. Обнаружь аномалии и проблемы.

Проверь:
- Резкие изменения выручки (>20% падение - КРИТИЧНО!)
- Снижение количества моек
- Низкие запасы материалов
- Необычные паттерны

Формат ответа:
- 🔴 КРИТИЧНО: [описание]
- ⚠️ ВНИМАНИЕ: [описание]
- ✅ НОРМА: если всё хорошо

Максимум 200 слов, только важное.`,
    };

    const dataContext: GLMMessage = {
      role: 'user',
      content: `**Сравнение периодов:**
Период 1: ${p1Start} - ${p1End}
Период 2: ${p2Start} - ${p2End}

${JSON.stringify(comparison.data, null, 2)}

**Материалы с низким уровнем запасов:**
${JSON.stringify(inventory.data, null, 2)}

Обнаружь аномалии.`,
    };

    const glmClient = getGLMClient();
    const response = await glmClient.chat({
      messages: [systemPrompt, dataContext],
      // model берётся из настроек через getGLMClient()
      temperature: 0.5,
    });

    console.log('[Background Analysis] GLM Response:', JSON.stringify(response, null, 2));

    if (!response.choices || response.choices.length === 0) {
      throw new Error('GLM API returned no choices in response');
    }

    const anomalies = response.choices[0].message.content || 'Аномалий не обнаружено';

    // Determine if there are critical issues
    const hasCritical = anomalies.includes('🔴') || anomalies.includes('КРИТИЧНО');

    // Save result
    updateBackgroundAnalysis(analysis.id, {
      status: 'completed',
      result_data: {
        period: { p1: `${p1Start} - ${p1End}`, p2: `${p2Start} - ${p2End}` },
        anomalies,
        hasCritical,
        comparison: comparison.data,
        lowStock: inventory.data,
      },
    });

    console.log('[Background Analysis] Anomaly detection completed:', analysis.id);
  } catch (error: any) {
    console.error('[Background Analysis] Anomaly detection failed:', error);
    updateBackgroundAnalysis(analysis.id, {
      status: 'failed',
      error_message: error.message,
    });
  }
}

/**
 * Get unread background analyses
 */
export function getUnreadAnalyses() {
  return getBackgroundAnalyses({ isNotified: false, status: 'completed', limit: 10 });
}

/**
 * Mark analyses as read
 */
export function markAnalysesAsRead(analysisIds: string[]) {
  for (const id of analysisIds) {
    updateBackgroundAnalysis(id, { is_notified: true });
  }
}
