/**
 * Next.js Instrumentation
 * Runs once when the server starts
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[Instrumentation] Initializing server-side features...');

    // Initialize cron jobs for background analysis
    const { initializeCronJobs } = await import('./lib/ai/cron-scheduler');
    initializeCronJobs();

    console.log('[Instrumentation] Server initialization complete');
  }
}
