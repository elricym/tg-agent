import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentMessage } from "@mariozechner/pi-agent-core";

// Isolated DB per test run
const tmp = mkdtempSync(join(tmpdir(), "tg-agent-store-"));
process.env.DB_PATH = join(tmp, "test.db");
process.env.ALLOWED_USERS ??= "1";
process.env.TELEGRAM_BOT_TOKEN ??= "test";
process.env.ANTHROPIC_API_KEY ??= "sk-ant-test";

const store = await import("../src/store.ts");

const CHAT_A = 1001;
const CHAT_B = 1002;

function userMsg(text: string): AgentMessage {
  return { role: "user", content: text, timestamp: Date.now() };
}

function assistantMsg(text: string): AgentMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

test("getOrCreateSession creates a session on first call", () => {
  const s = store.getOrCreateSession(CHAT_A);
  assert.ok(s.id > 0);
  assert.equal(s.title, "New Chat");
});

test("addAgentMessage + getAgentHistory round-trip messages", () => {
  store.addAgentMessage(CHAT_A, userMsg("hello"));
  store.addAgentMessage(CHAT_A, assistantMsg("hi there"));
  const history = store.getAgentHistory(CHAT_A, 50);
  assert.equal(history.length, 2);
  assert.equal(history[0].role, "user");
  assert.equal(history[1].role, "assistant");
  assert.equal((history[0] as any).content, "hello");
});

test("createNewSession archives previous and isolates history", () => {
  store.createNewSession(CHAT_A, "fresh");
  const history = store.getAgentHistory(CHAT_A, 50);
  assert.equal(history.length, 0);
});

test("switchSession restores prior session history", () => {
  const sessions = store.listSessions(CHAT_A, 10);
  const older = sessions.find((s) => s.title !== "fresh");
  assert.ok(older, "expected a prior session");
  const ok = store.switchSession(CHAT_A, older!.id);
  assert.equal(ok, true);
  const history = store.getAgentHistory(CHAT_A, 50);
  assert.equal(history.length, 2);
});

test("clearHistory empties the active session", () => {
  store.clearHistory(CHAT_A);
  assert.equal(store.getAgentHistory(CHAT_A, 50).length, 0);
});

test("sessions are isolated per chat", () => {
  store.addAgentMessage(CHAT_B, userMsg("from B"));
  assert.equal(store.getAgentHistory(CHAT_A, 50).length, 0);
  assert.equal(store.getAgentHistory(CHAT_B, 50).length, 1);
});

test("getAgentHistory drops leading orphan toolResult after truncation", () => {
  // Simulate a session whose truncation left a toolResult at the head.
  store.createNewSession(CHAT_A, "orphan");
  const orphan: AgentMessage = {
    role: "toolResult",
    toolCallId: "x",
    toolName: "shell",
    content: [{ type: "text", text: "out" }],
    isError: false,
    timestamp: Date.now(),
  };
  store.addAgentMessage(CHAT_A, orphan);
  store.addAgentMessage(CHAT_A, userMsg("follow-up"));
  const history = store.getAgentHistory(CHAT_A, 50);
  assert.equal(history.length, 1);
  assert.equal(history[0].role, "user");
});

test("getStats reports accurate counts", () => {
  const stats = store.getStats(CHAT_B);
  assert.ok(stats.currentSession);
  assert.equal(stats.sessionMessages, 1);
});

test.after(() => rmSync(tmp, { recursive: true, force: true }));
