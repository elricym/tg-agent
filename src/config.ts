import "dotenv/config";

export const config = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN!,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  model: process.env.MODEL || "claude-sonnet-4-20250514",
  systemPrompt:
    process.env.SYSTEM_PROMPT ||
    "You are a helpful assistant accessible via Telegram.",
  maxHistory: parseInt(process.env.MAX_HISTORY || "50", 10),
  allowedUsers: process.env.ALLOWED_USERS
    ? process.env.ALLOWED_USERS.split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [],
  acpDefaultCwd: process.env.ACP_DEFAULT_CWD || process.cwd(),
};
