import { Bot } from "grammy";
import { config } from "./config.js";
import { addMessage, getHistory, clearHistory } from "./store.js";
import { runAgent } from "./agent.js";

const bot = new Bot(config.telegramBotToken);

function isAllowed(userId: number): boolean {
  if (config.allowedUsers.length === 0) return true;
  return config.allowedUsers.includes(String(userId));
}

function splitMessage(text: string, maxLen = 4096): string[] {
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      parts.push(remaining);
      break;
    }
    // Try to split at a newline
    let splitIdx = remaining.lastIndexOf("\n", maxLen);
    if (splitIdx <= 0) splitIdx = maxLen;
    parts.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx).trimStart();
  }
  return parts;
}

bot.command("clear", async (ctx) => {
  if (!ctx.from || !isAllowed(ctx.from.id)) return;
  clearHistory(ctx.chat.id);
  await ctx.reply("Conversation cleared.");
});

bot.command("start", async (ctx) => {
  await ctx.reply("Hello! Send me a message and I'll respond using Claude.");
});

bot.on("message:text", async (ctx) => {
  if (!ctx.from || !isAllowed(ctx.from.id)) {
    await ctx.reply("You are not authorized to use this bot.");
    return;
  }

  const chatId = ctx.chat.id;
  const userText = ctx.message.text;

  // Store user message
  addMessage(chatId, "user", userText);

  // Show typing indicator
  const typingInterval = setInterval(() => {
    ctx.api.sendChatAction(chatId, "typing").catch(() => {});
  }, 4000);
  // Send initial typing
  await ctx.api.sendChatAction(chatId, "typing").catch(() => {});

  try {
    const history = getHistory(chatId, config.maxHistory);
    const reply = await runAgent(history);

    // Store assistant response
    addMessage(chatId, "assistant", reply);

    // Send reply, splitting if needed
    const parts = splitMessage(reply);
    for (const part of parts) {
      await ctx.reply(part);
    }
  } catch (err) {
    console.error("Agent error:", err);
    await ctx.reply("Sorry, an error occurred while processing your message.");
  } finally {
    clearInterval(typingInterval);
  }
});

export { bot };
