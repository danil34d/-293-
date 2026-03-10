import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { TelegramWebAppSession } from '@/types/telegram-bot';

const RUNTIME_DIR = path.join(process.cwd(), 'data', 'telegram-bot');
const SESSION_FILE = path.join(RUNTIME_DIR, 'webapp-sessions.json');
const DEFAULT_TTL_SEC = 120;
const MIN_TTL_SEC = 30;
const MAX_TTL_SEC = 3600;

type ConsumeSessionResult =
  | { status: 'ok'; session: TelegramWebAppSession }
  | { status: 'invalid' | 'expired' | 'used'; session?: TelegramWebAppSession };

function parseIsoToMs(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isSessionShape(value: unknown): value is TelegramWebAppSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<TelegramWebAppSession>;
  return (
    typeof session.token === 'string' &&
    typeof session.employeeId === 'string' &&
    typeof session.chatId === 'string' &&
    typeof session.createdAt === 'string' &&
    typeof session.expiresAt === 'string'
  );
}

function resolveTtlSec(): number {
  const envValue = Number(process.env.TELEGRAM_WEBAPP_SESSION_TTL_SEC || DEFAULT_TTL_SEC);
  if (!Number.isFinite(envValue)) return DEFAULT_TTL_SEC;
  const normalized = Math.floor(envValue);
  if (normalized < MIN_TTL_SEC) return MIN_TTL_SEC;
  if (normalized > MAX_TTL_SEC) return MAX_TTL_SEC;
  return normalized;
}

function isExpired(session: TelegramWebAppSession, nowMs: number): boolean {
  const expiresAtMs = parseIsoToMs(session.expiresAt);
  return expiresAtMs <= 0 || expiresAtMs <= nowMs;
}

function pruneSessions(sessions: TelegramWebAppSession[], nowMs: number): TelegramWebAppSession[] {
  return sessions.filter((session) => !isExpired(session, nowMs));
}

async function ensureRuntimeDir(): Promise<void> {
  await fs.mkdir(RUNTIME_DIR, { recursive: true });
}

async function readSessions(): Promise<TelegramWebAppSession[]> {
  await ensureRuntimeDir();
  try {
    const raw = await fs.readFile(SESSION_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSessionShape);
  } catch (error: any) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeSessions(sessions: TelegramWebAppSession[]): Promise<void> {
  await ensureRuntimeDir();
  await fs.writeFile(SESSION_FILE, JSON.stringify(sessions, null, 2), 'utf-8');
}

export async function createTelegramWebAppSession(params: {
  employeeId: string;
  chatId: string;
  ttlSec?: number;
}): Promise<TelegramWebAppSession> {
  const now = new Date();
  const nowMs = now.getTime();
  const ttlSec = Number.isFinite(Number(params.ttlSec)) ? Number(params.ttlSec) : resolveTtlSec();
  const ttlSecNormalized = Math.max(MIN_TTL_SEC, Math.min(MAX_TTL_SEC, Math.floor(ttlSec)));

  const token = crypto.randomBytes(32).toString('hex');
  const session: TelegramWebAppSession = {
    token,
    employeeId: params.employeeId,
    chatId: params.chatId,
    createdAt: now.toISOString(),
    expiresAt: new Date(nowMs + ttlSecNormalized * 1000).toISOString(),
  };

  const existing = await readSessions();
  const pruned = pruneSessions(existing, nowMs);
  pruned.push(session);
  await writeSessions(pruned);

  return session;
}

export async function consumeTelegramWebAppSession(token: string): Promise<ConsumeSessionResult> {
  const cleanedToken = token.trim();
  if (!cleanedToken) {
    return { status: 'invalid' };
  }

  const now = new Date();
  const nowMs = now.getTime();

  const existing = await readSessions();
  const pruned = pruneSessions(existing, nowMs);
  const hadPrunedChanges = pruned.length !== existing.length;

  const index = pruned.findIndex((session) => session.token === cleanedToken);
  if (index === -1) {
    if (hadPrunedChanges) {
      await writeSessions(pruned);
    }
    return { status: 'invalid' };
  }

  const session = pruned[index];
  if (isExpired(session, nowMs)) {
    pruned.splice(index, 1);
    await writeSessions(pruned);
    return { status: 'expired', session };
  }

  if (session.usedAt) {
    if (hadPrunedChanges) {
      await writeSessions(pruned);
    }
    return { status: 'used', session };
  }

  const consumedSession: TelegramWebAppSession = {
    ...session,
    usedAt: now.toISOString(),
  };
  pruned[index] = consumedSession;
  await writeSessions(pruned);
  return { status: 'ok', session: consumedSession };
}
