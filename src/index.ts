import { bot } from "./bot.js";

console.log("Starting tg-agent...");

bot.start({
  onStart: (botInfo) => {
    console.log(`Bot running as @${botInfo.username}`);
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
