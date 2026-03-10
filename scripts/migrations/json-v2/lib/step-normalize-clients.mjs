import path from 'path';
import {
  createStepResult,
  listJsonFiles,
  readJsonFile,
  relPath,
  toNumberOrDefault,
  writeJsonIfChanged,
} from './io.mjs';

function normalizeCounterAgent(data, stepResult, fileRef) {
  const next = { ...data };

  const normalizedBalance = toNumberOrDefault(next.balance, 0);
  if (!Number.isFinite(Number(next.balance))) {
    stepResult.warnings.push(`[${fileRef}] balance некорректный, установлен 0`);
  }
  next.balance = normalizedBalance;

  if (!Array.isArray(next.cars)) {
    next.cars = [];
    stepResult.warnings.push(`[${fileRef}] cars не массив, установлен []`);
  }
  if (!Array.isArray(next.companies)) {
    next.companies = [];
    stepResult.warnings.push(`[${fileRef}] companies не массив, установлен []`);
  }
  if (!Array.isArray(next.priceList)) {
    next.priceList = [];
    stepResult.warnings.push(`[${fileRef}] priceList не массив, установлен []`);
  }
  if (!Array.isArray(next.additionalPriceList)) {
    next.additionalPriceList = [];
    stepResult.warnings.push(`[${fileRef}] additionalPriceList не массив, установлен []`);
  }

  return next;
}

function normalizeAggregator(data, stepResult, fileRef) {
  const next = { ...data };

  const normalizedBalance = toNumberOrDefault(next.balance, 0);
  if (!Number.isFinite(Number(next.balance))) {
    stepResult.warnings.push(`[${fileRef}] balance некорректный, установлен 0`);
  }
  next.balance = normalizedBalance;

  if (!Array.isArray(next.cars)) {
    next.cars = [];
    stepResult.warnings.push(`[${fileRef}] cars не массив, установлен []`);
  }
  if (!Array.isArray(next.companies)) {
    next.companies = [];
    stepResult.warnings.push(`[${fileRef}] companies не массив, установлен []`);
  }

  if (!Array.isArray(next.priceLists)) {
    if (Array.isArray(next.priceList)) {
      const legacyName =
        typeof next.activePriceListName === 'string' && next.activePriceListName.trim().length > 0
          ? next.activePriceListName
          : 'Основной';
      next.priceLists = [{ name: legacyName, services: next.priceList }];
      stepResult.warnings.push(`[${fileRef}] найден legacy priceList, преобразован в priceLists`);
      delete next.priceList;
    } else {
      next.priceLists = [];
      stepResult.warnings.push(`[${fileRef}] priceLists не массив, установлен []`);
    }
  }

  if (next.priceLists.length > 0) {
    const activeName = typeof next.activePriceListName === 'string' ? next.activePriceListName.trim() : '';
    if (!activeName) {
      next.activePriceListName = next.priceLists[0]?.name ?? '';
      stepResult.warnings.push(`[${fileRef}] activePriceListName отсутствовал, установлен в первый прайс`);
    }
  }

  return next;
}

async function normalizeDirectory(context, dirName, kind, result) {
  const dirPath = path.join(context.dataDir, dirName);
  const files = await listJsonFiles(dirPath);

  for (const filePath of files) {
    const fileRef = relPath(context.rootDir, filePath);
    let data;

    try {
      data = await readJsonFile(filePath);
    } catch (error) {
      result.errors.push(`Ошибка чтения ${fileRef}: ${error.message}`);
      continue;
    }

    if (!data || Array.isArray(data) || typeof data !== 'object') {
      result.errors.push(`Ожидался JSON-объект: ${fileRef}`);
      continue;
    }

    const next =
      kind === 'counter-agent'
        ? normalizeCounterAgent(data, result, fileRef)
        : normalizeAggregator(data, result, fileRef);

    await writeJsonIfChanged(context, filePath, next, result);
  }

  return files.length;
}

export async function runNormalizeClients(context) {
  const result = createStepResult('normalize-clients');

  const [counterAgentFiles, aggregatorFiles] = await Promise.all([
    normalizeDirectory(context, 'counter-agents', 'counter-agent', result),
    normalizeDirectory(context, 'aggregators', 'aggregator', result),
  ]);

  result.stats = {
    counterAgentFiles,
    aggregatorFiles,
    changedFiles: result.changed.length,
    warnings: result.warnings.length,
    errors: result.errors.length,
  };

  return result;
}
