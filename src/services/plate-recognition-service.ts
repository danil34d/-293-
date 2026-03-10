import { execFile } from 'child_process';
import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, readFile, readdir, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import { promisify } from 'util';

export const OCR_FAILED_DIR = join(process.cwd(), 'data', 'ocr-failed');
const SAFE_OCR_FILENAME_RE = /^[\w-]+\.jpg$/;
const OCR_CORRECTED_REASON_PREFIX = 'ocr_corrected_by_user:';

type OcrMetaRecord = {
  filename: string;
  savedAt: string;
  reason: string;
  imageHash?: string;
};

async function ensureOcrFailedDir() {
  if (!existsSync(OCR_FAILED_DIR)) {
    await mkdir(OCR_FAILED_DIR, { recursive: true });
  }
}

function buildOcrMetaFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, '.json');
}

function buildOcrMetaPayload(filename: string, savedAt: string, reason: string, imageHash?: string): string {
  return JSON.stringify(
    {
      filename,
      savedAt,
      reason,
      imageHash,
    },
    null,
    2
  );
}

function buildOcrMetaPath(filename: string): string {
  return join(OCR_FAILED_DIR, buildOcrMetaFilename(filename));
}

function isOcrCorrectedReason(reason: string): boolean {
  return reason.startsWith(OCR_CORRECTED_REASON_PREFIX);
}

function buildOcrImageHash(imageBuffer: Buffer): string {
  return createHash('sha256').update(imageBuffer).digest('hex');
}

async function readOcrMeta(filename: string): Promise<OcrMetaRecord | null> {
  const metaPath = buildOcrMetaPath(filename);
  if (!existsSync(metaPath)) return null;

  try {
    const rawMeta = await readFile(metaPath, 'utf-8');
    const parsed = JSON.parse(rawMeta) as Partial<OcrMetaRecord>;
    if (!parsed || typeof parsed !== 'object') return null;

    return {
      filename: typeof parsed.filename === 'string' && parsed.filename.trim() ? parsed.filename : filename,
      savedAt:
        typeof parsed.savedAt === 'string' && parsed.savedAt.trim()
          ? parsed.savedAt
          : new Date().toISOString(),
      reason: typeof parsed.reason === 'string' ? parsed.reason : '',
      imageHash: typeof parsed.imageHash === 'string' && parsed.imageHash.trim() ? parsed.imageHash : undefined,
    };
  } catch {
    return null;
  }
}

async function writeOcrMeta(meta: OcrMetaRecord): Promise<void> {
  await writeFile(
    buildOcrMetaPath(meta.filename),
    buildOcrMetaPayload(meta.filename, meta.savedAt, meta.reason, meta.imageHash)
  );
}

async function findDuplicateOcrPhoto(imageHash: string): Promise<OcrMetaRecord | null> {
  const entries = await readFileSystemOcrEntries();
  const matches: OcrMetaRecord[] = [];

  for (const entry of entries) {
    if (entry.imageHash && entry.imageHash === imageHash) {
      matches.push(entry);
      continue;
    }

    if (entry.imageHash || !existsSync(join(OCR_FAILED_DIR, entry.filename))) {
      continue;
    }

    try {
      const existingBuffer = await readFile(join(OCR_FAILED_DIR, entry.filename));
      const existingHash = buildOcrImageHash(existingBuffer);
      entry.imageHash = existingHash;
      await writeOcrMeta(entry);
      if (existingHash === imageHash) {
        matches.push(entry);
      }
    } catch {
      // ignore unreadable duplicates
    }
  }

  if (matches.length === 0) {
    return null;
  }

  matches.sort((a, b) => {
    const aCorrected = isOcrCorrectedReason(a.reason);
    const bCorrected = isOcrCorrectedReason(b.reason);
    if (aCorrected !== bCorrected) {
      return aCorrected ? -1 : 1;
    }
    return new Date(a.savedAt).getTime() - new Date(b.savedAt).getTime();
  });

  return matches[0] || null;
}

async function readFileSystemOcrEntries(): Promise<OcrMetaRecord[]> {
  await ensureOcrFailedDir();

  const files = await readdir(OCR_FAILED_DIR);
  const entries: OcrMetaRecord[] = [];

  for (const jsonFile of files.filter((file) => file.endsWith('.json'))) {
    const filename = jsonFile.replace(/\.[^.]+$/, '.jpg');
    const meta = await readOcrMeta(filename);
    if (!meta || !existsSync(join(OCR_FAILED_DIR, meta.filename))) {
      continue;
    }
    entries.push(meta);
  }

  return entries;
}

async function upsertOcrPhoto(imageBuffer: Buffer, reason: string): Promise<string | null> {
  await ensureOcrFailedDir();

  const imageHash = buildOcrImageHash(imageBuffer);
  const duplicate = await findDuplicateOcrPhoto(imageHash);
  if (duplicate) {
    const nextReason = isOcrCorrectedReason(reason) || !isOcrCorrectedReason(duplicate.reason)
      ? reason
      : duplicate.reason;

    if (duplicate.reason !== nextReason || duplicate.imageHash !== imageHash) {
      await writeOcrMeta({
        ...duplicate,
        reason: nextReason,
        imageHash,
      });
    }

    return duplicate.filename;
  }

  try {
    const timestamp = Date.now();
    const savedAt = new Date(timestamp).toISOString();
    const date = savedAt.slice(0, 10);
    const randomStr = Math.random().toString(36).slice(2, 7);
    const filename = `${date}_${timestamp}_${randomStr}.jpg`;

    await writeFile(join(OCR_FAILED_DIR, filename), imageBuffer);
    await writeOcrMeta({
      filename,
      savedAt,
      reason,
      imageHash,
    });
    return filename;
  } catch {
    return null;
  }
}

export async function saveOcrFailedPhoto(imageBuffer: Buffer, reason: string): Promise<string | null> {
  return upsertOcrPhoto(imageBuffer, reason);
}

export async function saveOcrCorrectedPhoto(imageBuffer: Buffer, reason: string): Promise<string | null> {
  return upsertOcrPhoto(imageBuffer, reason);
}

export async function updateOcrFailedPhotoReason(filename: string, reason: string): Promise<string> {
  if (!SAFE_OCR_FILENAME_RE.test(filename)) {
    throw new Error('invalid filename');
  }

  await ensureOcrFailedDir();
  const imagePath = join(OCR_FAILED_DIR, filename);
  if (!existsSync(imagePath)) {
    throw new Error('OCR failed photo not found');
  }

  const existingMeta = await readOcrMeta(filename);
  const savedAt = existingMeta?.savedAt || new Date().toISOString();
  let imageHash = existingMeta?.imageHash;

  if (!imageHash) {
    try {
      const imageBuffer = await readFile(imagePath);
      imageHash = buildOcrImageHash(imageBuffer);
    } catch {
      imageHash = undefined;
    }
  }

  await writeOcrMeta({
    filename,
    savedAt,
    reason,
    imageHash,
  });
  return filename;
}

const execFileAsync = promisify(execFile);

const TEMP_DIR = process.platform === 'win32'
  ? join(process.env.TEMP || 'C:\\Temp', 'carwash-plate-temp')
  : join(process.cwd(), 'temp');
const OCR_PROCESS_TIMEOUT_MS = Number(process.env.PLATE_READER_TIMEOUT_MS || '60000');

type PythonRuntime = {
  command: string;
  baseArgs: string[];
};

export interface PlateRecognitionResult {
  success: boolean;
  plateNumber?: string;
  error?: string;
  rawOutput?: string;
  stderr?: string;
  failedFilename?: string;
}

async function ensureTempDir() {
  if (!existsSync(TEMP_DIR)) {
    await mkdir(TEMP_DIR, { recursive: true });
  }
}

function getPythonCandidates(): PythonRuntime[] {
  const candidates: PythonRuntime[] = [];
  const customPython = process.env.PLATE_READER_PYTHON?.trim();
  if (customPython) {
    candidates.push({ command: customPython, baseArgs: [] });
  }

  if (process.platform === 'win32') {
    const localVenvWin = join(process.cwd(), '.venv-ocr', 'Scripts', 'python.exe');
    if (existsSync(localVenvWin)) {
      candidates.push({ command: localVenvWin, baseArgs: [] });
    }

    candidates.push(
      { command: 'python', baseArgs: [] },
      { command: 'py', baseArgs: ['-3'] },
      { command: 'python3', baseArgs: [] },
    );

    return candidates;
  }

  const localVenvUnix = join(process.cwd(), '.venv-ocr', 'bin', 'python');
  if (existsSync(localVenvUnix)) {
    candidates.push({ command: localVenvUnix, baseArgs: [] });
  }

  candidates.push(
    { command: 'python3', baseArgs: [] },
    { command: 'python', baseArgs: [] },
  );

  return candidates;
}

async function resolvePythonRuntime(): Promise<PythonRuntime> {
  const candidates = getPythonCandidates();
  for (const runtime of candidates) {
    try {
      await execFileAsync(runtime.command, [...runtime.baseArgs, '--version']);
      return runtime;
    } catch {
      // ignore candidate
    }
  }
  throw new Error('Python runtime not found. Install Python or set PLATE_READER_PYTHON to a valid interpreter path.');
}

function parsePlateFromOutput(outputRaw: string): string | null {
  const output = outputRaw.trim();

  // 1. Прямой вывод скрипта "Номер: ..."
  const directMatch = output.match(/Номер:\s*(.+)/i);
  if (directMatch?.[1]?.trim()) {
    return directMatch[1].trim();
  }

  // 2. Стандартный формат: БЦЦЦББ РР(Р)
  const standardMatch = output
    .toUpperCase()
    .match(/[ABEKMHOPCTYXАВЕКМНОРСТУХ]\d{3}[ABEKMHOPCTYXАВЕКМНОРСТУХ]{2}\s*\d{2,3}/);
  if (standardMatch) {
    return standardMatch[0].replace(/\s+/g, ' ').trim();
  }

  // 3. Прицеп: ББ ЦЦЦЦ РР(Р)
  const trailerMatch = output
    .toUpperCase()
    .match(/[ABEKMHOPCTYXАВЕКМНОРСТУХ]{2}\d{4}\s*\d{2,3}/);
  if (trailerMatch) {
    return trailerMatch[0].replace(/\s+/g, ' ').trim();
  }

  return null;
}

export async function recognizePlateFromBuffer(imageBuffer: Buffer): Promise<PlateRecognitionResult> {
  let tempFilePath: string | null = null;
  try {
    await ensureTempDir();
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).slice(2, 9);
    tempFilePath = join(TEMP_DIR, `plate_${timestamp}_${randomStr}.jpg`);
    await writeFile(tempFilePath, imageBuffer);

    const scriptPath = join(process.cwd(), 'scripts', 'plate_reader.py');
    if (!existsSync(scriptPath)) {
      const failedFilename = (await saveOcrFailedPhoto(imageBuffer, 'error: Plate reader script not found').catch(() => null)) || undefined;
      return { success: false, error: 'Plate reader script not found', failedFilename };
    }

    const pythonRuntime = await resolvePythonRuntime();
    const { stdout, stderr } = await execFileAsync(
      pythonRuntime.command,
      [...pythonRuntime.baseArgs, scriptPath, tempFilePath],
      {
        maxBuffer: 1024 * 1024 * 10,
        timeout: OCR_PROCESS_TIMEOUT_MS,
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1',
        },
      }
    );

    const plateNumber = parsePlateFromOutput(stdout);
    if (plateNumber) {
      return {
        success: true,
        plateNumber,
        rawOutput: stdout.trim(),
      };
    }

    const failedFilename = (await saveOcrFailedPhoto(
      imageBuffer,
      `not_recognized: ${stdout.trim().slice(0, 120) || 'empty output'}`
    )) || undefined;
    return {
      success: false,
      error: 'Номер не распознан. Попробуйте сделать более четкое фото.',
      rawOutput: stdout.trim(),
      stderr: stderr || undefined,
      failedFilename,
    };
  } catch (error: any) {
    const isTimeout = Boolean(error?.killed) || error?.signal === 'SIGTERM';
    const errorMessage = isTimeout
      ? `OCR timeout after ${OCR_PROCESS_TIMEOUT_MS}ms`
      : error?.message || 'unknown';
    const failedFilename = (await saveOcrFailedPhoto(imageBuffer, `error: ${errorMessage}`).catch(() => null)) || undefined;
    return {
      success: false,
      error: isTimeout ? 'OCR превысил лимит времени. Попробуйте другое фото.' : errorMessage,
      stderr: error?.stderr || error?.stdout || undefined,
      failedFilename,
    };
  } finally {
    const keepTempFiles = process.env.KEEP_PLATE_TEMP_FILES === '1';
    if (tempFilePath && !keepTempFiles) {
      try {
        await unlink(tempFilePath);
      } catch {
        // ignore temp cleanup errors
      }
    }
  }
}
