import fs from 'fs/promises';
import path from 'path';

export function createStepResult(name) {
  return {
    name,
    changed: [],
    unchanged: [],
    warnings: [],
    errors: [],
    stats: {},
  };
}

export function relPath(rootDir, filePath) {
  return path.relative(rootDir, filePath).replaceAll('\\', '/');
}

export function toNumberOrDefault(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function round2(value) {
  return Math.round(value * 100) / 100;
}

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function listJsonFiles(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => path.join(dirPath, entry.name))
      .sort((a, b) => a.localeCompare(b));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

export async function readJsonFile(filePath, options = {}) {
  const { allowMissing = false, fallback = null } = options;
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === 'ENOENT' && allowMissing) {
      return fallback;
    }
    throw error;
  }
}

export async function writeJsonFile(filePath, value) {
  await ensureDir(path.dirname(filePath));
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  await fs.writeFile(filePath, payload, 'utf-8');
}

export async function writeJsonIfChanged(context, filePath, nextValue, stepResult) {
  let currentRaw = null;
  try {
    currentRaw = await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const nextRaw = `${JSON.stringify(nextValue, null, 2)}\n`;
  const relative = relPath(context.rootDir, filePath);

  if (currentRaw === nextRaw) {
    stepResult.unchanged.push(relative);
    return false;
  }

  stepResult.changed.push(relative);
  if (context.mode === 'apply') {
    await ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, nextRaw, 'utf-8');
  }
  return true;
}
