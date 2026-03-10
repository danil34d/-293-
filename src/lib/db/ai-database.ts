import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type {
  Chat,
  Message,
  BackgroundAnalysis,
  GeneratedReport,
  Setting,
} from '@/types/ai-assistant';

const DB_PATH = path.join(process.cwd(), 'data', 'ai-assistant.db');

// Singleton instance
let db: Database.Database | null = null;

/**
 * Get or initialize the AI Assistant database
 */
export function getAIDatabase(): Database.Database {
  if (db) return db;

  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(DB_PATH);

  // Performance optimizations
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  // Initialize schema
  initializeSchema(db);

  console.log(`[AI DB] Initialized at ${DB_PATH}`);

  return db;
}

/**
 * Initialize database schema
 */
function initializeSchema(db: Database.Database) {
  // Chats table
  db.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      is_archived INTEGER DEFAULT 0,
      user_id TEXT DEFAULT 'admin'
    )
  `);

  // Messages table
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      metadata TEXT,
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
    )
  `);

  // Index for faster message queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_chat_id
    ON messages(chat_id, created_at DESC)
  `);

  // Background analyses table
  db.exec(`
    CREATE TABLE IF NOT EXISTS background_analyses (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('employee_performance', 'anomaly_detection', 'daily_summary')),
      status TEXT NOT NULL CHECK(status IN ('pending', 'processing', 'completed', 'failed')),
      created_at INTEGER NOT NULL,
      completed_at INTEGER,
      result_data TEXT,
      error_message TEXT,
      is_notified INTEGER DEFAULT 0,
      priority INTEGER DEFAULT 0
    )
  `);

  // Indices for background analyses
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_analyses_status
    ON background_analyses(status, created_at DESC)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_analyses_notified
    ON background_analyses(is_notified, created_at DESC)
  `);

  // Generated reports table
  db.exec(`
    CREATE TABLE IF NOT EXISTS generated_reports (
      id TEXT PRIMARY KEY,
      chat_id TEXT,
      report_type TEXT NOT NULL CHECK(report_type IN ('pdf', 'docx')),
      title TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      created_at INTEGER NOT NULL,
      parameters TEXT,
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE SET NULL
    )
  `);

  // Settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Initialize default settings
  const settingExists = db.prepare('SELECT 1 FROM settings WHERE key = ?').get('analysis_enabled');
  if (!settingExists) {
    db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)')
      .run('analysis_enabled', JSON.stringify(true), Date.now());
  }
}

// CHAT OPERATIONS
export function createChat(title: string, userId: string = 'admin'): Chat {
  const db = getAIDatabase();
  const now = Date.now();
  const id = `chat_${now}_${Math.random().toString(36).substr(2, 9)}`;

  db.prepare(`
    INSERT INTO chats (id, title, created_at, updated_at, is_archived, user_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, title, now, now, 0, userId);

  return { id, title, created_at: now, updated_at: now, is_archived: 0, user_id: userId };
}

export function getChats(params?: { isArchived?: boolean; userId?: string }): Chat[] {
  const db = getAIDatabase();
  let query = `
    SELECT
      c.*,
      COUNT(m.id) as message_count
    FROM chats c
    LEFT JOIN messages m ON m.chat_id = c.id
    WHERE 1=1
  `;
  const queryParams: any[] = [];

  if (params?.isArchived !== undefined) {
    query += ' AND c.is_archived = ?';
    queryParams.push(params.isArchived ? 1 : 0);
  }
  if (params?.userId) {
    query += ' AND c.user_id = ?';
    queryParams.push(params.userId);
  }
  query += ' GROUP BY c.id ORDER BY c.updated_at DESC';

  return db.prepare(query).all(...queryParams) as Chat[];
}

export function getChat(chatId: string): Chat | undefined {
  const db = getAIDatabase();
  return db.prepare('SELECT * FROM chats WHERE id = ?').get(chatId) as Chat | undefined;
}

export function updateChat(chatId: string, updates: Partial<Pick<Chat, 'title' | 'is_archived'>>): void {
  const db = getAIDatabase();
  const now = Date.now();
  const setClauses: string[] = ['updated_at = ?'];
  const params: any[] = [now];

  if (updates.title !== undefined) {
    setClauses.push('title = ?');
    params.push(updates.title);
  }
  if (updates.is_archived !== undefined) {
    setClauses.push('is_archived = ?');
    params.push(updates.is_archived);
  }
  params.push(chatId);

  db.prepare(`UPDATE chats SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);
}

export function deleteChat(chatId: string): void {
  const db = getAIDatabase();
  db.prepare('DELETE FROM chats WHERE id = ?').run(chatId);
}

// MESSAGE OPERATIONS
export function createMessage(
  chatId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  metadata?: any
): Message {
  const db = getAIDatabase();
  const now = Date.now();
  const id = `msg_${now}_${Math.random().toString(36).substr(2, 9)}`;

  db.prepare(`
    INSERT INTO messages (id, chat_id, role, content, created_at, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, chatId, role, content, now, metadata ? JSON.stringify(metadata) : null);

  db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(now, chatId);

  return { id, chat_id: chatId, role, content, created_at: now, metadata: metadata ? JSON.stringify(metadata) : undefined };
}

export function getMessages(chatId: string, params?: { limit?: number; offset?: number }): Message[] {
  const db = getAIDatabase();
  let query = 'SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC';
  const queryParams: any[] = [chatId];

  if (params?.limit) {
    query += ' LIMIT ?';
    queryParams.push(params.limit);
    if (params.offset) {
      query += ' OFFSET ?';
      queryParams.push(params.offset);
    }
  }

  return db.prepare(query).all(...queryParams) as Message[];
}

export function getRecentMessages(chatId: string, limit: number = 20): Message[] {
  const db = getAIDatabase();
  return db.prepare(`
    SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC LIMIT ?
  `).all(chatId, limit) as Message[];
}

// BACKGROUND ANALYSIS OPERATIONS
export function createBackgroundAnalysis(
  type: 'employee_performance' | 'anomaly_detection' | 'daily_summary',
  priority: number = 0
): BackgroundAnalysis {
  const db = getAIDatabase();
  const now = Date.now();
  const id = `analysis_${now}_${Math.random().toString(36).substr(2, 9)}`;

  db.prepare(`
    INSERT INTO background_analyses (id, type, status, created_at, priority)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, type, 'pending', now, priority);

  return { id, type, status: 'pending', created_at: now, is_notified: 0, priority };
}

export function updateBackgroundAnalysis(
  analysisId: string,
  updates: {
    status?: 'pending' | 'processing' | 'completed' | 'failed';
    result_data?: any;
    error_message?: string;
    is_notified?: boolean;
  }
): void {
  const db = getAIDatabase();
  const now = Date.now();
  const setClauses: string[] = [];
  const params: any[] = [];

  if (updates.status !== undefined) {
    setClauses.push('status = ?');
    params.push(updates.status);
    if (updates.status === 'completed' || updates.status === 'failed') {
      setClauses.push('completed_at = ?');
      params.push(now);
    }
  }
  if (updates.result_data !== undefined) {
    setClauses.push('result_data = ?');
    params.push(JSON.stringify(updates.result_data));
  }
  if (updates.error_message !== undefined) {
    setClauses.push('error_message = ?');
    params.push(updates.error_message);
  }
  if (updates.is_notified !== undefined) {
    setClauses.push('is_notified = ?');
    params.push(updates.is_notified ? 1 : 0);
  }
  params.push(analysisId);

  db.prepare(`UPDATE background_analyses SET ${setClauses.join(', ')} WHERE id = ?`).run(...params);
}

export function getBackgroundAnalyses(params?: {
  status?: 'pending' | 'processing' | 'completed' | 'failed';
  isNotified?: boolean;
  limit?: number;
}): BackgroundAnalysis[] {
  const db = getAIDatabase();
  let query = 'SELECT * FROM background_analyses WHERE 1=1';
  const queryParams: any[] = [];

  if (params?.status) {
    query += ' AND status = ?';
    queryParams.push(params.status);
  }
  if (params?.isNotified !== undefined) {
    query += ' AND is_notified = ?';
    queryParams.push(params.isNotified ? 1 : 0);
  }
  query += ' ORDER BY priority DESC, created_at DESC';

  if (params?.limit) {
    query += ' LIMIT ?';
    queryParams.push(params.limit);
  }

  return db.prepare(query).all(...queryParams) as BackgroundAnalysis[];
}

export function getBackgroundAnalysis(analysisId: string): BackgroundAnalysis | undefined {
  const db = getAIDatabase();
  return db.prepare('SELECT * FROM background_analyses WHERE id = ?').get(analysisId) as BackgroundAnalysis | undefined;
}

// GENERATED REPORT OPERATIONS
export function createGeneratedReport(
  reportType: 'pdf' | 'docx',
  title: string,
  filePath: string,
  params?: { chatId?: string; fileSize?: number; parameters?: any }
): GeneratedReport {
  const db = getAIDatabase();
  const now = Date.now();
  const id = `report_${now}_${Math.random().toString(36).substr(2, 9)}`;

  db.prepare(`
    INSERT INTO generated_reports (id, chat_id, report_type, title, file_path, file_size, created_at, parameters)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, params?.chatId || null, reportType, title, filePath, params?.fileSize || null, now, params?.parameters ? JSON.stringify(params.parameters) : null);

  return { id, chat_id: params?.chatId, report_type: reportType, title, file_path: filePath, file_size: params?.fileSize, created_at: now, parameters: params?.parameters ? JSON.stringify(params.parameters) : undefined };
}

export function getGeneratedReports(params?: { chatId?: string; limit?: number }): GeneratedReport[] {
  const db = getAIDatabase();
  let query = 'SELECT * FROM generated_reports WHERE 1=1';
  const queryParams: any[] = [];

  if (params?.chatId) {
    query += ' AND chat_id = ?';
    queryParams.push(params.chatId);
  }
  query += ' ORDER BY created_at DESC';

  if (params?.limit) {
    query += ' LIMIT ?';
    queryParams.push(params.limit);
  }

  return db.prepare(query).all(...queryParams) as GeneratedReport[];
}

// SETTINGS OPERATIONS
export function getSetting(key: string): any {
  const db = getAIDatabase();
  const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as Setting | undefined;
  return setting ? JSON.parse(setting.value) : null;
}

export function setSetting(key: string, value: any): void {
  const db = getAIDatabase();
  const now = Date.now();

  db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?
  `).run(key, JSON.stringify(value), now, JSON.stringify(value), now);
}

export function closeAIDatabase(): void {
  if (db) {
    db.close();
    db = null;
    console.log('[AI DB] Closed');
  }
}
