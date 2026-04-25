import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { readdir, readFile, stat, statfs } from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';

import type { Shift, WashEvent } from '@/types';
import {
  getEmployeesData,
  getInventory,
  getShiftAssignmentRequestsData,
  getShiftsData,
  getShiftSwapRequestsData,
  getWashEventsData,
} from '@/lib/data';
import { getShiftActiveEmployeeIds } from '@/lib/shift-state';
import { OCR_FAILED_DIR } from '@/services/plate-recognition-service';

const execFileAsync = promisify(execFile);
const MOSCOW_TIMEZONE = 'Europe/Moscow';
const CARWASH_BACKUP_ROOT = process.env.CARWASH_BACKUP_ROOT || '/srv/carwash/backups';
const WALLBOARD_SERVICES = [
  'carwash-web.service',
  'carwash-bot.service',
  'carwash-ocr-worker.service',
  'carwash-backup.timer',
  'carwash-health-check.timer',
] as const;

export interface WallboardServiceState {
  name: string;
  state: string;
}

export interface WallboardDiskState {
  mountPoint: string;
  totalBytes: number | null;
  usedBytes: number | null;
  availableBytes: number | null;
}

export interface WallboardBackupState {
  filename: string | null;
  createdAt: string | null;
  ageMinutes: number | null;
}

export interface WallboardSystemSnapshot {
  hostname: string;
  ipv4: string[];
  uptimeSeconds: number;
  rootSource: string | null;
  efiSource: string | null;
  cpuModel: string;
  cpuCores: number;
  load1: number;
  loadPercent: number;
  cpuTemperatureC: number | null;
  memoryTotalBytes: number;
  memoryUsedBytes: number;
  disks: WallboardDiskState[];
  services: WallboardServiceState[];
  backup: WallboardBackupState;
  ocrEngine: string;
}

export interface WallboardBusinessSnapshot {
  todayDate: string;
  currentShiftDate: string;
  currentShiftType: 'day' | 'night';
  washesToday: number;
  revenueToday: number;
  averageCheckToday: number;
  activeEmployees: number;
  activeBoxes: number;
  pendingRequests: number;
  failedOcrCount: number;
  latestVehicle: string | null;
  topEmployee: string | null;
  chemicalStockKg: number;
}

export interface WallboardSnapshot {
  generatedAt: string;
  timezone: string;
  system: WallboardSystemSnapshot;
  business: WallboardBusinessSnapshot;
}

type OcrFailedMeta = {
  savedAt?: string;
};

type NetworkAddress = {
  address: string;
  family: string | number;
  internal: boolean;
};

function getDateFormatter() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MOSCOW_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
}

function getMoscowParts(date: Date) {
  const parts = Object.fromEntries(
    getDateFormatter()
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  ) as Record<string, string>;

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
  };
}

function getPreviousDateString(dateString: string): string {
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function getMoscowDateString(value: string | Date): string {
  return getMoscowParts(value instanceof Date ? value : new Date(value)).date;
}

function getCurrentShiftContext(now: Date) {
  const parts = getMoscowParts(now);
  const shiftType: 'day' | 'night' = parts.hour >= 20 || parts.hour < 8 ? 'night' : 'day';
  const shiftDate = parts.hour < 8 ? getPreviousDateString(parts.date) : parts.date;

  return {
    todayDate: parts.date,
    shiftDate,
    shiftType,
  };
}

async function readTextFile(filePath: string): Promise<string | null> {
  try {
    return (await readFile(filePath, 'utf-8')).trim();
  } catch {
    return null;
  }
}

async function readCommandOutput(command: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(command, args, { timeout: 15000 });
    return stdout.trim();
  } catch {
    return null;
  }
}

async function getServiceState(name: string): Promise<WallboardServiceState> {
  const state = await readCommandOutput('systemctl', ['is-active', name]);
  return { name, state: state || 'unknown' };
}

async function getDiskState(mountPoint: string): Promise<WallboardDiskState> {
  try {
    const info = await statfs(mountPoint);
    const totalBytes = Number(info.blocks) * Number(info.bsize);
    const availableBytes = Number(info.bavail) * Number(info.bsize);
    const usedBytes = totalBytes - availableBytes;

    return {
      mountPoint,
      totalBytes,
      usedBytes,
      availableBytes,
    };
  } catch {
    return {
      mountPoint,
      totalBytes: null,
      usedBytes: null,
      availableBytes: null,
    };
  }
}

async function getCpuTemperatureC(): Promise<number | null> {
  const thermalRoot = '/sys/class/thermal';

  try {
    const entries = await readdir(thermalRoot);
    const zones = entries.filter((entry) => entry.startsWith('thermal_zone'));

    const readings: number[] = [];
    for (const zone of zones) {
      const type = (await readTextFile(path.join(thermalRoot, zone, 'type'))) || '';
      const rawTemp = await readTextFile(path.join(thermalRoot, zone, 'temp'));
      if (!rawTemp) continue;

      const parsed = Number(rawTemp) / 1000;
      if (!Number.isFinite(parsed) || parsed <= 0) continue;

      const normalizedType = type.toLowerCase();
      if (
        normalizedType.includes('x86_pkg_temp') ||
        normalizedType.includes('cpu') ||
        normalizedType.includes('package')
      ) {
        return parsed;
      }

      readings.push(parsed);
    }

    return readings[0] ?? null;
  } catch {
    return null;
  }
}

async function getBackupState(): Promise<WallboardBackupState> {
  try {
    if (!existsSync(CARWASH_BACKUP_ROOT)) {
      return { filename: null, createdAt: null, ageMinutes: null };
    }

    const files = (await readdir(CARWASH_BACKUP_ROOT)).filter((file) =>
      /^carwash-backup-.*\.tar\.gz$/.test(file)
    );
    if (files.length === 0) {
      return { filename: null, createdAt: null, ageMinutes: null };
    }

    const stats = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(CARWASH_BACKUP_ROOT, file);
        const info = await stat(filePath);
        return { file, mtimeMs: info.mtimeMs, createdAt: info.mtime.toISOString() };
      })
    );

    stats.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const latest = stats[0];

    return {
      filename: latest.file,
      createdAt: latest.createdAt,
      ageMinutes: Math.max(0, Math.round((Date.now() - latest.mtimeMs) / 60000)),
    };
  } catch {
    return { filename: null, createdAt: null, ageMinutes: null };
  }
}

async function getOcrFailedCount(): Promise<number> {
  try {
    if (!existsSync(OCR_FAILED_DIR)) {
      return 0;
    }

    const files = await readdir(OCR_FAILED_DIR);
    const metaFiles = files.filter((file) => file.endsWith('.json'));
    let count = 0;

    for (const file of metaFiles) {
      try {
        const raw = await readFile(path.join(OCR_FAILED_DIR, file), 'utf-8');
        const parsed = JSON.parse(raw) as OcrFailedMeta;
        if (parsed && typeof parsed.savedAt === 'string') {
          count += 1;
        }
      } catch {
        // skip corrupt metadata
      }
    }

    return count;
  } catch {
    return 0;
  }
}

async function getOcrEngine(): Promise<string> {
  const envPath = '/etc/default/carwash';
  const envContent = await readTextFile(envPath);
  if (!envContent) {
    return 'auto';
  }

  const engineLine = envContent
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.startsWith('PLATE_READER_ENGINE='));

  const rawEngine = engineLine?.split('=')[1]?.trim() || 'auto';
  return rawEngine || 'auto';
}

function getIPv4Addresses(): string[] {
  const interfaces = os.networkInterfaces() as Record<string, NetworkAddress[] | undefined>;
  const addresses: string[] = [];

  for (const networkInterface of Object.values(interfaces)) {
    for (const entry of (networkInterface || []) as NetworkAddress[]) {
      const family = typeof entry.family === 'string' ? entry.family : String(entry.family);
      if (family === 'IPv4' && !entry.internal) {
        addresses.push(entry.address);
      }
    }
  }

  return Array.from(new Set(addresses));
}

function buildTopEmployeeName(events: WashEvent[], employees: Awaited<ReturnType<typeof getEmployeesData>>) {
  const score = new Map<string, { count: number; revenue: number }>();

  for (const event of events) {
    const amount = event.netAmount ?? event.totalAmount;
    const participants = event.employeeIds.filter(Boolean);
    const revenueShare = participants.length > 0 ? amount / participants.length : amount;

    for (const employeeId of participants) {
      const current = score.get(employeeId) || { count: 0, revenue: 0 };
      current.count += 1;
      current.revenue += revenueShare;
      score.set(employeeId, current);
    }
  }

  const [topEmployeeId] = Array.from(score.entries()).sort((a, b) => {
    if (b[1].count !== a[1].count) {
      return b[1].count - a[1].count;
    }
    return b[1].revenue - a[1].revenue;
  })[0] || [];

  if (!topEmployeeId) {
    return null;
  }

  return employees.find((employee) => employee.id === topEmployeeId)?.fullName || null;
}

export async function getWallboardSnapshot(): Promise<WallboardSnapshot> {
  const now = new Date();
  const [rootSource, efiSource, cpuTemperatureC, backup, ocrEngine, services, disks] = await Promise.all([
    readCommandOutput('findmnt', ['-no', 'SOURCE', '/']),
    readCommandOutput('findmnt', ['-no', 'SOURCE', '/boot/efi']),
    getCpuTemperatureC(),
    getBackupState(),
    getOcrEngine(),
    Promise.all(WALLBOARD_SERVICES.map((service) => getServiceState(service))),
    Promise.all(['/', '/srv/carwash', CARWASH_BACKUP_ROOT].map((mountPoint) => getDiskState(mountPoint))),
  ]);

  const [washEvents, employees, shifts, shiftAssignmentRequests, shiftSwapRequests, inventory, failedOcrCount] =
    await Promise.all([
      getWashEventsData(),
      getEmployeesData(),
      getShiftsData(),
      getShiftAssignmentRequestsData(),
      getShiftSwapRequestsData(),
      getInventory(),
      getOcrFailedCount(),
    ]);

  const shiftContext = getCurrentShiftContext(now);
  const todayEvents = washEvents.filter(
    (event) => !event.refundedAt && getMoscowDateString(event.timestamp) === shiftContext.todayDate
  );
  const revenueToday = todayEvents.reduce((sum, event) => sum + (event.netAmount ?? event.totalAmount), 0);
  const activeShifts = shifts.filter(
    (shift) => shift.date === shiftContext.shiftDate && shift.shiftType === shiftContext.shiftType
  );
  const activeEmployeeIds = Array.from(
    new Set(activeShifts.flatMap((shift) => getShiftActiveEmployeeIds(shift)))
  );
  const activeBoxes = Array.from(new Set(activeShifts.map((shift: Shift) => shift.boxNumber))).length;
  const pendingRequests =
    shiftAssignmentRequests.filter((request) => request.status === 'pending').length +
    shiftSwapRequests.filter((request) => request.status === 'pending').length;

  return {
    generatedAt: now.toISOString(),
    timezone: MOSCOW_TIMEZONE,
    system: {
      hostname: os.hostname(),
      ipv4: getIPv4Addresses(),
      uptimeSeconds: os.uptime(),
      rootSource,
      efiSource,
      cpuModel: os.cpus()[0]?.model || 'Unknown CPU',
      cpuCores: os.cpus().length,
      load1: os.loadavg()[0],
      loadPercent: os.cpus().length > 0 ? (os.loadavg()[0] / os.cpus().length) * 100 : 0,
      cpuTemperatureC,
      memoryTotalBytes: os.totalmem(),
      memoryUsedBytes: os.totalmem() - os.freemem(),
      disks,
      services,
      backup,
      ocrEngine,
    },
    business: {
      todayDate: shiftContext.todayDate,
      currentShiftDate: shiftContext.shiftDate,
      currentShiftType: shiftContext.shiftType,
      washesToday: todayEvents.length,
      revenueToday,
      averageCheckToday: todayEvents.length > 0 ? revenueToday / todayEvents.length : 0,
      activeEmployees: activeEmployeeIds.length,
      activeBoxes,
      pendingRequests,
      failedOcrCount,
      latestVehicle: washEvents[0]?.vehicleNumber || null,
      topEmployee: buildTopEmployeeName(todayEvents, employees),
      chemicalStockKg: Math.round((inventory.chemicalStockGrams / 1000) * 10) / 10,
    },
  };
}
