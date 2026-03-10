#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createStepResult, ensureDir, writeJsonFile } from './lib/io.mjs';
import { runValidateRefs } from './lib/step-validate-refs.mjs';
import { runNormalizeEmployees } from './lib/step-normalize-employees.mjs';
import { runNormalizeClients } from './lib/step-normalize-clients.mjs';
import { runNormalizeInventory } from './lib/step-normalize-inventory.mjs';
import { runRebuildDerived } from './lib/step-rebuild-derived.mjs';

function formatRunId(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function parseArgs(argv) {
  const options = {
    mode: 'dry-run',
    fixBalances: false,
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--mode=apply' || arg === '--apply') {
      options.mode = 'apply';
      continue;
    }
    if (arg === '--mode=dry-run' || arg === '--dry-run') {
      options.mode = 'dry-run';
      continue;
    }
    if (arg === '--fix-balances') {
      options.fixBalances = true;
    }
  }

  return options;
}

function printHelp() {
  console.log('JSON v2 migration');
  console.log('');
  console.log('Usage:');
  console.log('  node scripts/migrations/json-v2/index.mjs --mode=dry-run');
  console.log('  node scripts/migrations/json-v2/index.mjs --mode=apply');
  console.log('  node scripts/migrations/json-v2/index.mjs --mode=apply --fix-balances');
}

function summarizeSteps(steps) {
  return steps.reduce(
    (acc, step) => {
      acc.changedFiles += step.changed.length;
      acc.unchangedFiles += step.unchanged.length;
      acc.warnings += step.warnings.length;
      acc.errors += step.errors.length;
      return acc;
    },
    { changedFiles: 0, unchangedFiles: 0, warnings: 0, errors: 0 }
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    process.exit(0);
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.resolve(scriptDir, '../../..');
  const dataDir = path.join(rootDir, 'data');
  const runDate = new Date();
  const runId = formatRunId(runDate);
  const startedAt = runDate.toISOString();

  const context = {
    mode: options.mode,
    fixBalances: options.fixBalances,
    rootDir,
    dataDir,
    runId,
    startedAt,
  };

  const steps = [];

  if (context.mode === 'apply') {
    const backupDir = path.join(rootDir, 'data-backups', runId);
    await ensureDir(path.dirname(backupDir));
    await fs.cp(dataDir, backupDir, { recursive: true });
    context.backupDir = backupDir;
    console.log(`[migration] backup created: ${path.relative(rootDir, backupDir).replaceAll('\\', '/')}`);
  }

  const stepRunners = [
    runValidateRefs,
    runNormalizeEmployees,
    runNormalizeClients,
    runNormalizeInventory,
    runRebuildDerived,
  ];

  for (const runStep of stepRunners) {
    const result = await runStep(context);
    steps.push(result);
    console.log(
      `[migration] ${result.name}: changed=${result.changed.length}, warnings=${result.warnings.length}, errors=${result.errors.length}`
    );
  }

  const finishedAt = new Date().toISOString();
  const summary = summarizeSteps(steps);

  const reportStep = createStepResult('report');
  reportStep.stats = {
    mode: context.mode,
    fixBalances: context.fixBalances,
    steps: steps.length,
    changedFiles: summary.changedFiles,
    warnings: summary.warnings,
    errors: summary.errors,
  };
  steps.push(reportStep);

  const report = {
    schemaTarget: 'json-v2',
    runId,
    mode: context.mode,
    fixBalances: context.fixBalances,
    startedAt,
    finishedAt,
    backupDir: context.backupDir
      ? path.relative(rootDir, context.backupDir).replaceAll('\\', '/')
      : null,
    summary,
    steps,
  };

  if (context.mode === 'apply') {
    const metaDir = path.join(dataDir, '_meta');
    await ensureDir(metaDir);

    const schemaVersionPath = path.join(metaDir, 'schema-version.json');
    const schemaVersion = {
      schema: 'json-v2',
      version: 2,
      migratedAt: finishedAt,
      lastMigrationId: runId,
    };
    await writeJsonFile(schemaVersionPath, schemaVersion);

    const reportFileName = `migration-log-${runId}.json`;
    const reportPath = path.join(metaDir, reportFileName);
    await writeJsonFile(reportPath, report);

    console.log(`[migration] schema version updated: ${path.relative(rootDir, schemaVersionPath).replaceAll('\\', '/')}`);
    console.log(`[migration] report saved: ${path.relative(rootDir, reportPath).replaceAll('\\', '/')}`);
  }

  console.log(
    `[migration] done: mode=${context.mode}, changed=${summary.changedFiles}, warnings=${summary.warnings}, errors=${summary.errors}`
  );

  if (summary.errors > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[migration] fatal:', error);
  process.exit(1);
});
