import path from 'path';
import { createStepResult, listJsonFiles, readJsonFile, relPath } from './io.mjs';

async function readObjectFiles(dirPath, stepResult, rootDir) {
  const files = await listJsonFiles(dirPath);
  const rows = [];

  for (const filePath of files) {
    try {
      const data = await readJsonFile(filePath);
      if (!data || Array.isArray(data) || typeof data !== 'object') {
        stepResult.errors.push(`Ожидался JSON-объект: ${relPath(rootDir, filePath)}`);
        continue;
      }
      rows.push({ filePath, data });
    } catch (error) {
      stepResult.errors.push(`Ошибка чтения ${relPath(rootDir, filePath)}: ${error.message}`);
    }
  }

  return rows;
}

export async function runValidateRefs(context) {
  const result = createStepResult('validate-refs');

  const employeesDir = path.join(context.dataDir, 'employees');
  const salarySchemesDir = path.join(context.dataDir, 'salary-schemes');
  const washEventsDir = path.join(context.dataDir, 'wash-events');
  const aggregatorsDir = path.join(context.dataDir, 'aggregators');
  const counterAgentsDir = path.join(context.dataDir, 'counter-agents');

  const [employees, salarySchemes, washEvents, aggregators, counterAgents] = await Promise.all([
    readObjectFiles(employeesDir, result, context.rootDir),
    readObjectFiles(salarySchemesDir, result, context.rootDir),
    readObjectFiles(washEventsDir, result, context.rootDir),
    readObjectFiles(aggregatorsDir, result, context.rootDir),
    readObjectFiles(counterAgentsDir, result, context.rootDir),
  ]);

  const employeeIds = new Set(employees.map((entry) => entry.data.id).filter(Boolean));
  const salarySchemeIds = new Set(salarySchemes.map((entry) => entry.data.id).filter(Boolean));
  const aggregatorIds = new Set(aggregators.map((entry) => entry.data.id).filter(Boolean));
  const counterAgentIds = new Set(counterAgents.map((entry) => entry.data.id).filter(Boolean));

  let washEmployeeLinkErrors = 0;
  let washClientLinkErrors = 0;
  let employeeSalaryLinkErrors = 0;

  for (const { filePath, data } of washEvents) {
    const ref = relPath(context.rootDir, filePath);
    const employeeIdsInWash = Array.isArray(data.employeeIds) ? data.employeeIds : [];
    for (const employeeId of employeeIdsInWash) {
      if (!employeeIds.has(employeeId)) {
        washEmployeeLinkErrors += 1;
        result.errors.push(`[${ref}] employeeIds -> отсутствует сотрудник: ${employeeId}`);
      }
    }

    const sourceId = typeof data.sourceId === 'string' ? data.sourceId.trim() : '';
    if (!sourceId) continue;

    const inAggregators = aggregatorIds.has(sourceId);
    const inCounterAgents = counterAgentIds.has(sourceId);
    if (!inAggregators && !inCounterAgents) {
      washClientLinkErrors += 1;
      result.errors.push(`[${ref}] sourceId -> отсутствует клиент: ${sourceId}`);
    }
  }

  for (const { filePath, data } of employees) {
    if (!data.salarySchemeId) continue;
    if (!salarySchemeIds.has(data.salarySchemeId)) {
      employeeSalaryLinkErrors += 1;
      result.errors.push(
        `[${relPath(context.rootDir, filePath)}] salarySchemeId -> отсутствует схема: ${data.salarySchemeId}`
      );
    }
  }

  result.stats = {
    employeesChecked: employees.length,
    salarySchemesChecked: salarySchemes.length,
    washEventsChecked: washEvents.length,
    washEmployeeLinkErrors,
    washClientLinkErrors,
    employeeSalaryLinkErrors,
  };

  return result;
}
