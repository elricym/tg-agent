import "dotenv/config";

export const config = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN!,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  model: process.env.MODEL || "claude-sonnet-4-20250514",
  systemPrompt: process.env.SYSTEM_PROMPT || "",
  maxHistory: parseInt(process.env.MAX_HISTORY || "50", 10),
  allowedUsers: process.env.ALLOWED_USERS
    ? process.env.ALLOWED_USERS.split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [],
  acpDefaultCwd: process.env.ACP_DEFAULT_CWD || process.cwd(),
  rateLimitPerMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE || "10", 10),
  // Security: restrict file access to these directories
  allowedPaths: process.env.ALLOWED_PATHS
    ? process.env.ALLOWED_PATHS.split(",").map((s) => s.trim())
    : [process.cwd()],
  // Security: max ACP timeout
  acpTimeoutMs: parseInt(process.env.ACP_TIMEOUT_MS || "180000", 10),
};

// Validate critical config at startup
export function validateConfig(): void {
  if (!config.telegramBotToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is required");
  }
  if (!config.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is required");
  }
  if (config.allowedUsers.length === 0) {
    throw new Error(
      "ALLOWED_USERS is required — set it to your Telegram user ID(s). " +
        "An open bot is a security risk. Use /myid to find your ID."
    );
  }
}
