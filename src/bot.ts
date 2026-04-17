import { Bot } from "grammy";
import { config, validateConfig } from "./config.js";
import {
  addMessage,
  getHistory,
  clearHistory,
  createNewSession,
  switchSession,
  listSessions,
  setSessionTitle,
  getOrCreateSession,
  getStats,
} from "./store.js";
import { runAgent, type ProgressEvent } from "./agent.js";
import { checkRateLimit } from "./safety.js";

validateConfig();

const bot = new Bot(config.telegramBotToken);
const startTime = Date.now();

function isAllowed(userId: number): boolean {
  return config.allowedUsers.includes(String(userId));
}

function summarizeToolInput(name: string, input: Record<string, unknown>): string {
  if (name === "shell") return String(input.command ?? "").slice(0, 80);
  if (name === "read_file" || name === "write_file") return String(input.path ?? "");
  if (name === "acp") return String(input.task ?? "").slice(0, 80);
  const json = JSON.stringify(input);
  return json.length > 80 ? json.slice(0, 80) + "…" : json;
}

function splitMessage(text: string, maxLen = 4096): string[] {
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      parts.push(remaining);
      break;
    }
    let splitIdx = remaining.lastIndexOf("\n", maxLen);
    if (splitIdx <= 0) splitIdx = maxLen;
    parts.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).trimStart();
  }
  return parts;
}

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ── Commands ──────────────────────────────────────────────────

bot.command("myid", async (ctx) => {
  if (!ctx.from) return;
  await ctx.reply(`Your Telegram user ID: \`${ctx.from.id}\``, {
    parse_mode: "MarkdownV2",
  });
});

bot.command("start", async (ctx) => {
  if (!ctx.from || !isAllowed(ctx.from.id)) {
    await ctx.reply("⛔ Not authorized. Use /myid to get your ID.");
    return;
  }
  await ctx.reply(
    "Hello! I'm your AI assistant powered by Claude.\n\n" +
      "Commands:\n" +
      "/new [title] — Start a new session\n" +
      "/sessions — List recent sessions\n" +
      "/switch <id> — Switch to a session\n" +
      "/title <text> — Rename current session\n" +
      "/clear — Clear current session history\n" +
      "/status — System status\n" +
      "/myid — Show your Telegram user ID"
  );
});

bot.command("new", async (ctx) => {
  if (!ctx.from || !isAllowed(ctx.from.id)) return;
  const title = ctx.match?.trim() || undefined;
  const sessionId = createNewSession(ctx.chat.id, title);
  await ctx.reply(
    `✨ New session #${sessionId}${title ? ` — "${title}"` : ""}\nPrevious session archived.`
  );
});

bot.command("sessions", async (ctx) => {
  if (!ctx.from || !isAllowed(ctx.from.id)) return;
  const sessions = listSessions(ctx.chat.id, 10);
  if (sessions.length === 0) {
    await ctx.reply("No sessions yet. Send a message to start one.");
    return;
  }
  const lines = sessions.map((s) => {
    const active = s.is_active ? " ◀" : "";
    const date = s.updated_at.slice(0, 10);
    return `#${s.id} ${s.title} (${s.msg_count} msgs, ${date})${active}`;
  });
  await ctx.reply("📋 Recent Sessions:\n\n" + lines.join("\n"));
});

bot.command("switch", async (ctx) => {
  if (!ctx.from || !isAllowed(ctx.from.id)) return;
  const id = parseInt(ctx.match?.trim() || "", 10);
  if (!id) {
    await ctx.reply("Usage: /switch <session_id>\nUse /sessions to see IDs.");
    return;
  }
  const ok = switchSession(ctx.chat.id, id);
  if (ok) {
    await ctx.reply(`🔄 Switched to session #${id}`);
  } else {
    await ctx.reply(`❌ Session #${id} not found.`);
  }
});

bot.command("title", async (ctx) => {
  if (!ctx.from || !isAllowed(ctx.from.id)) return;
  const title = ctx.match?.trim();
  if (!title) {
    await ctx.reply("Usage: /title <new title>");
    return;
  }
  const session = getOrCreateSession(ctx.chat.id);
  setSessionTitle(session.id, title);
  await ctx.reply(`✏️ Session #${session.id} renamed to "${title}"`);
});

bot.command("clear", async (ctx) => {
  if (!ctx.from || !isAllowed(ctx.from.id)) return;
  clearHistory(ctx.chat.id);
  await ctx.reply("🗑 Current session history cleared.");
});

bot.command("status", async (ctx) => {
  if (!ctx.from || !isAllowed(ctx.from.id)) return;
  const stats = getStats(ctx.chat.id);
  const uptime = formatUptime(Date.now() - startTime);
  const memUsage = process.memoryUsage();
  const heapMB = (memUsage.heapUsed / 1024 / 1024).toFixed(1);
  const rssMB = (memUsage.rss / 1024 / 1024).toFixed(1);

  const lines = [
    "📊 System Status",
    "",
    `⏱ Uptime: ${uptime}`,
    `🤖 Model: ${config.model}`,
    `🔑 Auth: ${config.anthropicApiKey.startsWith("sk-ant-oat") ? "OAuth (Max)" : "API Key"}`,
    "",
    `📝 Current Session: #${stats.currentSession?.id} "${stats.currentSession?.title}"`,
    `💬 Session Messages: ${stats.sessionMessages}`,
    `📚 Total Sessions: ${stats.totalSessions}`,
    `📨 Total Messages: ${stats.totalMessages}`,
    "",
    `💾 Memory: ${heapMB}MB heap / ${rssMB}MB RSS`,
    `⚡ Rate Limit: ${config.rateLimitPerMinute}/min`,
    `📂 Allowed Paths: ${config.allowedPaths.length}`,
  ];

  await ctx.reply(lines.join("\n"));
});

// ── Message Handler ───────────────────────────────────────────

bot.on("message:text", async (ctx) => {
  if (!ctx.from || !isAllowed(ctx.from.id)) return;

  if (!checkRateLimit(ctx.from.id)) {
    await ctx.reply("⏳ Rate limit reached. Please wait a moment.");
    return;
  }

  const chatId = ctx.chat.id;
  const userText = ctx.message.text;

  // Auto-create session if needed
  const session = getOrCreateSession(chatId);

  addMessage(chatId, "user", userText);

  const typingInterval = setInterval(() => {
    ctx.api.sendChatAction(chatId, "typing").catch(() => {});
  }, 4000);
  await ctx.api.sendChatAction(chatId, "typing").catch(() => {});

  let statusMsgId: number | null = null;
  let lastStatusText = "";
  const setStatus = async (text: string) => {
    if (text === lastStatusText) return;
    lastStatusText = text;
    try {
      if (statusMsgId === null) {
        const m = await ctx.reply(text);
        statusMsgId = m.message_id;
      } else {
        await ctx.api.editMessageText(chatId, statusMsgId, text);
      }
    } catch {
      // editing can fail (e.g. identical content, message gone) — ignore
    }
  };

  const onProgress = async (e: ProgressEvent) => {
    if (e.type === "tool_use") {
      await setStatus(`🔧 ${e.name}(${summarizeToolInput(e.name, e.input)})`);
    } else if (e.type === "max_rounds") {
      await setStatus("⚠️ Reached max tool rounds.");
    } else if (e.type === "error") {
      await setStatus(`❌ ${e.message}`);
    }
  };

  try {
    const history = getHistory(chatId, config.maxHistory);
    const result = await runAgent(history, { onProgress });

    // Persist the full assistant + tool_result chain so future turns
    // retain tool context, not just the final text.
    for (const msg of result.newMessages) {
      addMessage(chatId, msg.role, msg.content);
    }

    if (session.title === "New Chat" && history.length <= 1) {
      const shortTitle =
        userText.length > 30 ? userText.slice(0, 30) + "…" : userText;
      setSessionTitle(session.id, shortTitle);
    }

    if (statusMsgId !== null) {
      await ctx.api.deleteMessage(chatId, statusMsgId).catch(() => {});
      statusMsgId = null;
    }

    const parts = splitMessage(result.text);
    for (const part of parts) {
      await ctx.reply(part);
    }
  } catch (err) {
    console.error("Agent error:", err);
    if (statusMsgId !== null) {
      await ctx.api.deleteMessage(chatId, statusMsgId).catch(() => {});
    }
    await ctx.reply("Sorry, an error occurred while processing your message.");
  } finally {
    clearInterval(typingInterval);
  }
});

export { bot };
