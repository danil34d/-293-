import path from 'path';
import { INVENTORY_DEFAULT, INVENTORY_SETTINGS_DEFAULTS } from './defaults.mjs';
import { createStepResult, readJsonFile, relPath, toNumberOrDefault, writeJsonIfChanged } from './io.mjs';

export async function runNormalizeInventory(context) {
  const result = createStepResult('normalize-inventory');
  const inventoryPath = path.join(context.dataDir, 'inventory.json');
  const inventoryRef = relPath(context.rootDir, inventoryPath);

  let rawInventory = null;
  try {
    rawInventory = await readJsonFile(inventoryPath, { allowMissing: true, fallback: null });
  } catch (error) {
    result.errors.push(`Ошибка чтения ${inventoryRef}: ${error.message}`);
    result.stats = { filesChecked: 1, changedFiles: 0, warnings: result.warnings.length, errors: result.errors.length };
    return result;
  }

  const base =
    rawInventory && typeof rawInventory === 'object' && !Array.isArray(rawInventory)
      ? { ...rawInventory }
      : { ...INVENTORY_DEFAULT };

  if (!rawInventory || Array.isArray(rawInventory) || typeof rawInventory !== 'object') {
    result.warnings.push(`[${inventoryRef}] отсутствовал или поврежден, применена структура по умолчанию`);
  }

  base.chemicalStockGrams = toNumberOrDefault(base.chemicalStockGrams, 0);
  if (!Array.isArray(base.materials)) {
    base.materials = [];
    result.warnings.push(`[${inventoryRef}] materials не массив, установлен []`);
  }

  const settings =
    base.settings && typeof base.settings === 'object' && !Array.isArray(base.settings)
      ? { ...base.settings }
      : {};

  for (const [key, defaultValue] of Object.entries(INVENTORY_SETTINGS_DEFAULTS)) {
    if (settings[key] === undefined || settings[key] === null || Number.isNaN(settings[key])) {
      settings[key] = defaultValue;
      result.warnings.push(`[${inventoryRef}] settings.${key} отсутствовал/битый, установлен ${defaultValue}`);
    }
  }
  base.settings = settings;

  await writeJsonIfChanged(context, inventoryPath, base, result);

  result.stats = {
    filesChecked: 1,
    changedFiles: result.changed.length,
    warnings: result.warnings.length,
    errors: result.errors.length,
  };

  return result;
}
