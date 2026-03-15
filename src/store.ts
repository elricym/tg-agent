import { DatabaseSync } from "node:sqlite";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages.js";

const db = new DatabaseSync("conversations.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

const insertStmt = db.prepare(
  "INSERT INTO messages (chat_id, role, content_json) VALUES (?, ?, ?)"
);

const selectStmt = db.prepare(
  "SELECT role, content_json FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT ?"
);

const deleteStmt = db.prepare("DELETE FROM messages WHERE chat_id = ?");

export function addMessage(
  chatId: number,
  role: string,
  content: MessageParam["content"]
): void {
  insertStmt.run(chatId, role, JSON.stringify(content));
}

export function getHistory(
  chatId: number,
  limit: number
): MessageParam[] {
  const rows = selectStmt.all(chatId, limit) as {
    role: string;
    content_json: string;
  }[];
  return rows.reverse().map((r) => ({
    role: r.role as MessageParam["role"],
    content: JSON.parse(r.content_json),
  }));
}

export function clearHistory(chatId: number): void {
  deleteStmt.run(chatId);
}
