import { DatabaseSync } from "node:sqlite";
import type { AgentMessage } from "@mariozechner/pi-agent-core";

const db = new DatabaseSync("conversations.db");

// ── Schema ────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    title TEXT DEFAULT 'New Chat',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    is_active INTEGER NOT NULL DEFAULT 1
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    session_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  )
`);

// Migrate: add session_id if missing (from old schema)
try {
  db.exec(`ALTER TABLE messages ADD COLUMN session_id INTEGER NOT NULL DEFAULT 0`);
} catch {
  // column already exists
}

// ── Sessions ──────────────────────────────────────────────────

const activeSessionCache = new Map<number, number>();

const createSessionStmt = db.prepare(
  "INSERT INTO sessions (chat_id, title) VALUES (?, ?) RETURNING id"
);

const getActiveSessionStmt = db.prepare(
  "SELECT id, title, created_at FROM sessions WHERE chat_id = ? AND is_active = 1 ORDER BY id DESC LIMIT 1"
);

const listSessionsStmt = db.prepare(
  `SELECT s.id, s.title, s.created_at, s.updated_at, s.is_active,
          (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) as msg_count
   FROM sessions s WHERE s.chat_id = ? ORDER BY s.updated_at DESC LIMIT ?`
);

const deactivateSessionStmt = db.prepare(
  "UPDATE sessions SET is_active = 0 WHERE chat_id = ? AND is_active = 1"
);

const activateSessionStmt = db.prepare(
  "UPDATE sessions SET is_active = 1 WHERE id = ? AND chat_id = ?"
);

const updateSessionTitleStmt = db.prepare(
  "UPDATE sessions SET title = ? WHERE id = ?"
);

const touchSessionStmt = db.prepare(
  "UPDATE sessions SET updated_at = datetime('now') WHERE id = ?"
);

export interface SessionInfo {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  is_active: number;
  msg_count: number;
}

export function getOrCreateSession(chatId: number): { id: number; title: string; isNew: boolean } {
  // Check cache first
  const cachedId = activeSessionCache.get(chatId);
  if (cachedId) {
    const row = getActiveSessionStmt.get(chatId) as any;
    if (row && row.id === cachedId) {
      return { id: row.id, title: row.title, isNew: false };
    }
  }

  const existing = getActiveSessionStmt.get(chatId) as any;
  if (existing) {
    activeSessionCache.set(chatId, existing.id);
    return { id: existing.id, title: existing.title, isNew: false };
  }

  const row = createSessionStmt.get(chatId, "New Chat") as any;
  activeSessionCache.set(chatId, row.id);
  return { id: row.id, title: "New Chat", isNew: true };
}

export function createNewSession(chatId: number, title?: string): number {
  deactivateSessionStmt.run(chatId);
  const row = createSessionStmt.get(chatId, title || "New Chat") as any;
  activeSessionCache.set(chatId, row.id);
  return row.id;
}

export function switchSession(chatId: number, sessionId: number): boolean {
  // Verify session belongs to this chat
  const sessions = listSessionsStmt.all(chatId, 100) as unknown as SessionInfo[];
  const target = sessions.find((s) => s.id === sessionId);
  if (!target) return false;

  deactivateSessionStmt.run(chatId);
  activateSessionStmt.run(sessionId, chatId);
  activeSessionCache.set(chatId, sessionId);
  return true;
}

export function listSessions(chatId: number, limit = 10): SessionInfo[] {
  return listSessionsStmt.all(chatId, limit) as unknown as SessionInfo[];
}

export function setSessionTitle(sessionId: number, title: string): void {
  updateSessionTitleStmt.run(title, sessionId);
}

// ── Messages ──────────────────────────────────────────────────

const insertStmt = db.prepare(
  "INSERT INTO messages (chat_id, session_id, role, content_json) VALUES (?, ?, ?, ?)"
);

const selectStmt = db.prepare(
  "SELECT role, content_json FROM messages WHERE chat_id = ? AND session_id = ? ORDER BY id DESC LIMIT ?"
);

const deleteBySessionStmt = db.prepare(
  "DELETE FROM messages WHERE session_id = ?"
);

const countMsgStmt = db.prepare(
  "SELECT COUNT(*) as count FROM messages WHERE chat_id = ?"
);

const countSessionMsgStmt = db.prepare(
  "SELECT COUNT(*) as count FROM messages WHERE session_id = ?"
);

export function addAgentMessage(chatId: number, message: AgentMessage): void {
  const session = getOrCreateSession(chatId);
  // content_json holds the entire AgentMessage (role + content + metadata)
  // so multi-turn tool chains round-trip without losing context.
  insertStmt.run(chatId, session.id, message.role, JSON.stringify(message));
  touchSessionStmt.run(session.id);
}

export function getAgentHistory(chatId: number, limit: number): AgentMessage[] {
  const session = getOrCreateSession(chatId);
  const rows = selectStmt.all(chatId, session.id, limit) as {
    role: string;
    content_json: string;
  }[];

  // Parse and drop any legacy rows whose JSON isn't a full AgentMessage
  // (older format stored just content, not the wrapped message object).
  const all: AgentMessage[] = [];
  for (const r of rows.reverse()) {
    try {
      const parsed = JSON.parse(r.content_json);
      if (parsed && typeof parsed === "object" && "role" in parsed) {
        all.push(parsed as AgentMessage);
      }
    } catch {
      // malformed row — skip
    }
  }

  // If truncation cut mid tool-chain, drop leading messages until the
  // first turn is a user message. Orphan toolResults would break the API.
  let start = 0;
  while (start < all.length && all[start].role !== "user") start++;
  return all.slice(start);
}

export function clearHistory(chatId: number): void {
  const session = getOrCreateSession(chatId);
  deleteBySessionStmt.run(session.id);
}

// ── Stats ─────────────────────────────────────────────────────

export interface BotStats {
  totalMessages: number;
  sessionMessages: number;
  totalSessions: number;
  currentSession: { id: number; title: string } | null;
}

export function getStats(chatId: number): BotStats {
  const totalMsg = (countMsgStmt.get(chatId) as any).count;
  const session = getOrCreateSession(chatId);
  const sessionMsg = (countSessionMsgStmt.get(session.id) as any).count;
  const sessions = listSessions(chatId, 10000);

  return {
    totalMessages: totalMsg,
    sessionMessages: sessionMsg,
    totalSessions: sessions.length,
    currentSession: { id: session.id, title: session.title },
  };
}
