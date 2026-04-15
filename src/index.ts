import { bot } from "./bot.js";

console.log("Starting tg-agent...");

bot.api.setMyCommands([
  { command: "new", description: "Start a new session" },
  { command: "sessions", description: "List recent sessions" },
  { command: "switch", description: "Switch to a session by ID" },
  { command: "title", description: "Rename current session" },
  { command: "clear", description: "Clear current session history" },
  { command: "status", description: "System status" },
  { command: "myid", description: "Show your Telegram user ID" },
]).catch((err) => console.warn("Failed to set commands:", err));

bot.start({
  onStart: (botInfo) => {
    console.log(`✅ Bot running as @${botInfo.username}`);
    console.log(`   Security: ALLOWED_USERS enforced, rate limiting active`);
  },
});

// Graceful shutdown
const shutdown = () => {
  console.log("Shutting down...");
  bot.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
