import path from 'path';
import {
  createStepResult,
  listJsonFiles,
  readJsonFile,
  relPath,
  writeJsonIfChanged,
} from './io.mjs';

function normalizeRole(employee, stepResult, fileRef) {
  const originalRole = employee.role;

  if (employee.id === 'emp_manager_admin') {
    if (originalRole !== 'admin') {
      stepResult.warnings.push(`[${fileRef}] role принудительно установлен в admin для emp_manager_admin`);
    }
    return 'admin';
  }

  if (originalRole === 'admin') {
    stepResult.warnings.push(`[${fileRef}] роль admin недоступна для ${employee.id}, заменено на employee`);
    return 'employee';
  }

  if (originalRole === 'employee') {
    return 'employee';
  }

  if (employee.username === 'admin') {
    stepResult.warnings.push(`[${fileRef}] username=admin вне emp_manager_admin, роль заменена на employee`);
  }

  return 'employee';
}

function normalizeTelegramChatId(value) {
  if (value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return null;
}

export async function runNormalizeEmployees(context) {
  const result = createStepResult('normalize-employees');
  const employeesDir = path.join(context.dataDir, 'employees');
  const files = await listJsonFiles(employeesDir);

  for (const filePath of files) {
    const fileRef = relPath(context.rootDir, filePath);

    let employee;
    try {
      employee = await readJsonFile(filePath);
    } catch (error) {
      result.errors.push(`Ошибка чтения ${fileRef}: ${error.message}`);
      continue;
    }

    if (!employee || Array.isArray(employee) || typeof employee !== 'object') {
      result.errors.push(`Ожидался JSON-объект: ${fileRef}`);
      continue;
    }

    const next = { ...employee };

    next.role = normalizeRole(next, result, fileRef);

    if (typeof next.canSwapShifts !== 'boolean') {
      next.canSwapShifts = true;
      result.warnings.push(`[${fileRef}] canSwapShifts отсутствовал/битый, установлен true`);
    }

    const hadTelegramField = Object.prototype.hasOwnProperty.call(next, 'telegramChatId');
    if (!hadTelegramField) {
      next.telegramChatId = null;
    } else {
      next.telegramChatId = normalizeTelegramChatId(next.telegramChatId);
    }

    if (typeof next.hasCar !== 'boolean') {
      next.hasCar = false;
      result.warnings.push(`[${fileRef}] hasCar отсутствовал/битый, установлен false`);
    }

    await writeJsonIfChanged(context, filePath, next, result);
  }

  result.stats = {
    filesChecked: files.length,
    changedFiles: result.changed.length,
    warnings: result.warnings.length,
    errors: result.errors.length,
  };

  return result;
}
