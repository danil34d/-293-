/**
 * Cron Scheduler for Background Analysis
 * Runs automated analysis tasks on schedule
 */

import cron, { type ScheduledTask } from 'node-cron';
import {
  runDailySummaryAnalysis,
  runEmployeePerformanceAnalysis,
  runAnomalyDetection,
} from './background-analysis';
import { getSetting } from '@/lib/db/ai-database';

let isInitialized = false;
const tasks: ScheduledTask[] = [];

/**
 * Initialize and start cron jobs
 */
export function initializeCronJobs(): void {
  if (isInitialized) {
    console.log('[Cron] Already initialized, skipping...');
    return;
  }

  // Check if analysis is enabled
  const analysisEnabled = getSetting('analysis_enabled');
  if (analysisEnabled === false) {
    console.log('[Cron] Background analysis is disabled');
    return;
  }

  console.log('[Cron] Initializing background analysis jobs...');

  // Daily Summary - Every day at 1:00 AM
  // Analyzes previous day's performance
  const dailySummaryTask = cron.schedule('0 1 * * *', async () => {
    console.log('[Cron] Running daily summary analysis...');
    try {
      await runDailySummaryAnalysis();
    } catch (error) {
      console.error('[Cron] Daily summary failed:', error);
    }
  });
  tasks.push(dailySummaryTask);

  // Employee Performance - Every Monday at 9:00 AM
  // Weekly analysis of employee performance
  const employeePerfTask = cron.schedule('0 9 * * 1', async () => {
    console.log('[Cron] Running employee performance analysis...');
    try {
      await runEmployeePerformanceAnalysis();
    } catch (error) {
      console.error('[Cron] Employee performance analysis failed:', error);
    }
  });
  tasks.push(employeePerfTask);

  // Anomaly Detection - Every 6 hours
  // Detects unusual patterns, revenue drops, low stock
  const anomalyTask = cron.schedule('0 */6 * * *', async () => {
    console.log('[Cron] Running anomaly detection...');
    try {
      await runAnomalyDetection();
    } catch (error) {
      console.error('[Cron] Anomaly detection failed:', error);
    }
  });
  tasks.push(anomalyTask);

  isInitialized = true;
  console.log('[Cron] Background analysis jobs initialized:');
  console.log('  - Daily Summary: Every day at 1:00 AM');
  console.log('  - Employee Performance: Every Monday at 9:00 AM');
  console.log('  - Anomaly Detection: Every 6 hours');
}

/**
 * Stop all cron jobs
 */
export function stopCronJobs(): void {
  if (!isInitialized) {
    console.log('[Cron] Not initialized, nothing to stop');
    return;
  }

  console.log('[Cron] Stopping all background analysis jobs...');
  tasks.forEach(task => task.stop());
  tasks.length = 0;
  isInitialized = false;
  console.log('[Cron] All jobs stopped');
}

/**
 * Manually trigger a specific analysis (for testing)
 */
export async function triggerAnalysis(type: 'daily_summary' | 'employee_performance' | 'anomaly_detection'): Promise<void> {
  console.log(`[Cron] Manually triggering ${type}...`);

  switch (type) {
    case 'daily_summary':
      await runDailySummaryAnalysis();
      break;
    case 'employee_performance':
      await runEmployeePerformanceAnalysis();
      break;
    case 'anomaly_detection':
      await runAnomalyDetection();
      break;
    default:
      throw new Error(`Unknown analysis type: ${type}`);
  }
}

/**
 * Get scheduler status
 */
export function getCronStatus(): { initialized: boolean; taskCount: number } {
  return {
    initialized: isInitialized,
    taskCount: tasks.length,
  };
}
