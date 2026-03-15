# tg-agent

A lightweight Telegram agent gateway powered by Claude.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

3. Configure `.env`:
   - `TELEGRAM_BOT_TOKEN` — from [@BotFather](https://t.me/BotFather)
   - `ANTHROPIC_API_KEY` — from [Anthropic Console](https://console.anthropic.com)
   - `MODEL` — Claude model to use (default: `claude-sonnet-4-20250514`)
   - `SYSTEM_PROMPT` — system prompt for the agent
   - `MAX_HISTORY` — max messages to keep per chat (default: 50)
   - `ALLOWED_USERS` — comma-separated Telegram user IDs (empty = allow all)
   - `ACP_DEFAULT_CWD` — default working directory for ACP tool

4. Run in development:
   ```bash
   npm run dev
   ```

5. Build and run:
   ```bash
   npm run build
   node dist/index.js
   ```

## Tools

The agent has access to:
- **shell** — execute shell commands
- **read_file** — read file contents
- **write_file** — write files
- **acp** — spawn an ACP Claude agent for complex tasks

## Commands

- `/start` — welcome message
- `/clear` — clear conversation history
