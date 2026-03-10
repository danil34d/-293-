import path from 'path';
import {
  createStepResult,
  listJsonFiles,
  readJsonFile,
  relPath,
  round2,
  toNumberOrDefault,
  writeJsonIfChanged,
} from './io.mjs';

async function readClientEntities(context, dirName, kind, result) {
  const dirPath = path.join(context.dataDir, dirName);
  const files = await listJsonFiles(dirPath);
  const map = new Map();

  for (const filePath of files) {
    const fileRef = relPath(context.rootDir, filePath);
    try {
      const data = await readJsonFile(filePath);
      if (!data || Array.isArray(data) || typeof data !== 'object') {
        result.errors.push(`Ожидался JSON-объект: ${fileRef}`);
        continue;
      }
      const id = typeof data.id === 'string' ? data.id : path.basename(filePath, '.json');
      map.set(id, { filePath, kind, data });
    } catch (error) {
      result.errors.push(`Ошибка чтения ${fileRef}: ${error.message}`);
    }
  }

  return map;
}

async function calculateExpectedBalances(context, result) {
  const expected = new Map();

  const washEventFiles = await listJsonFiles(path.join(context.dataDir, 'wash-events'));
  for (const filePath of washEventFiles) {
    const fileRef = relPath(context.rootDir, filePath);
    try {
      const wash = await readJsonFile(filePath);
      if (!wash || typeof wash !== 'object' || Array.isArray(wash)) {
        result.errors.push(`Некорректный wash-event: ${fileRef}`);
        continue;
      }

      const sourceId = typeof wash.sourceId === 'string' ? wash.sourceId.trim() : '';
      if (!sourceId) continue;
      const totalAmount = toNumberOrDefault(wash.totalAmount, 0);
      expected.set(sourceId, round2((expected.get(sourceId) ?? 0) - totalAmount));
    } catch (error) {
      result.errors.push(`Ошибка чтения ${fileRef}: ${error.message}`);
    }
  }

  const transactionFiles = await listJsonFiles(path.join(context.dataDir, 'client-transactions'));
  for (const filePath of transactionFiles) {
    const fileRef = relPath(context.rootDir, filePath);
    const fallbackClientId = path.basename(filePath, '.json');

    try {
      const payload = await readJsonFile(filePath);
      const transactions = Array.isArray(payload) ? payload : [payload];
      for (const tx of transactions) {
        if (!tx || typeof tx !== 'object') continue;
        const clientId = typeof tx.clientId === 'string' ? tx.clientId : fallbackClientId;
        const amount = toNumberOrDefault(tx.amount, 0);
        expected.set(clientId, round2((expected.get(clientId) ?? 0) + amount));
      }
    } catch (error) {
      result.errors.push(`Ошибка чтения ${fileRef}: ${error.message}`);
    }
  }

  return expected;
}

export async function runRebuildDerived(context) {
  const result = createStepResult('rebuild-derived');
  const expectedBalances = await calculateExpectedBalances(context, result);

  const [aggregators, counterAgents] = await Promise.all([
    readClientEntities(context, 'aggregators', 'aggregator', result),
    readClientEntities(context, 'counter-agents', 'counter-agent', result),
  ]);

  const clients = new Map([...aggregators.entries(), ...counterAgents.entries()]);
  const allClientIds = new Set([...clients.keys(), ...expectedBalances.keys()]);

  let mismatches = 0;
  let fixed = 0;

  for (const clientId of allClientIds) {
    const entity = clients.get(clientId);
    const expected = round2(expectedBalances.get(clientId) ?? 0);

    if (!entity) {
      mismatches += 1;
      result.errors.push(`Не найден клиент для расчета баланса: ${clientId}`);
      continue;
    }

    const current = round2(toNumberOrDefault(entity.data.balance, 0));
    const delta = round2(current - expected);
    if (Math.abs(delta) <= 0.01) continue;

    mismatches += 1;
    result.warnings.push(
      `[${relPath(context.rootDir, entity.filePath)}] balance mismatch: current=${current}, expected=${expected}, delta=${delta}`
    );

    if (context.fixBalances) {
      const next = { ...entity.data, balance: expected };
      const changed = await writeJsonIfChanged(context, entity.filePath, next, result);
      if (changed) fixed += 1;
    }
  }

  result.stats = {
    clientsChecked: allClientIds.size,
    mismatches,
    fixed,
    changedFiles: result.changed.length,
    warnings: result.warnings.length,
    errors: result.errors.length,
    fixBalancesMode: context.fixBalances,
  };

  return result;
}
