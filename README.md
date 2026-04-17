# tg-agent

A lightweight Telegram gateway for an AI agent powered by Claude. The agent
loop, LLM client, and tool protocol are provided by the
[pi-mono](https://github.com/badlogic/pi-mono) stack; this repo adds the
Telegram transport, SQLite session store, per-user safety rules, and a small
set of tools (shell, read/write file, ACP coding agent).

## Architecture

```
Telegram user ──► grammy Bot
                    │
                    ▼
              src/bot.ts ── session store (SQLite) ──► AgentMessage[]
                    │
                    ▼
              src/agent.ts
                    │ (uses)
                    ▼
  @mariozechner/pi-agent-core   ── emits AgentEvent stream ──► live status msg
                    │ (uses)
                    ▼
  @mariozechner/pi-ai (Anthropic provider)
                    │
                    ▼
               api.anthropic.com
```

Key pieces:

| Module | Responsibility |
|---|---|
| `src/bot.ts` | grammy handlers, commands, per-turn wiring of store ↔ agent, live status message |
| `src/agent.ts` | Constructs the `Agent` from pi-agent-core, owns OAuth detection, returns new `AgentMessage[]` + final text |
| `src/tools/*` | Four `AgentTool`s with TypeBox param schemas: `shell`, `read_file`, `write_file`, `acp` |
| `src/store.ts` | SQLite sessions + `AgentMessage` persistence so multi-turn tool chains retain context |
| `src/safety.ts` | System-prompt preamble, rate limiter, path whitelist, shell-command blocklist |
| `src/config.ts` | Env parsing + startup validation (refuses to run if `ALLOWED_USERS` is empty) |

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

   **Required**
   - `TELEGRAM_BOT_TOKEN` — from [@BotFather](https://t.me/BotFather)
   - `ANTHROPIC_API_KEY` — API key (`sk-ant-...`) **or** Claude Max OAuth token (`sk-ant-oat-...`)
   - `ALLOWED_USERS` — comma-separated Telegram user IDs. Bot refuses to start if empty. Use `/myid` in the bot to find your ID.

   **Optional**
   - `MODEL` — Claude model (default: `claude-sonnet-4-20250514`)
   - `SYSTEM_PROMPT` — custom instructions appended to the safety preamble
   - `MAX_HISTORY` — max messages kept per session (default: 50)
   - `RATE_LIMIT_PER_MINUTE` — per-user rate limit (default: 10)
   - `ALLOWED_PATHS` — comma-separated directories the file tools may touch (default: cwd only)
   - `ACP_DEFAULT_CWD`, `ACP_TIMEOUT_MS` — ACP tool defaults
   - `DB_PATH` — SQLite path (default: `conversations.db`). Tests set this to an isolated temp file.

4. Run in development:
   ```bash
   npm run dev
   ```

5. Build and run:
   ```bash
   npm run build
   node dist/index.js
   ```

## OAuth (Claude Max) vs API key

`src/agent.ts` detects the `sk-ant-oat-` prefix and hands the token to pi-ai via the Agent's `getApiKey` callback. pi-ai's Anthropic provider then switches to Bearer auth and attaches the Claude Code identity headers (`anthropic-beta: claude-code-20250219,oauth-2025-04-20,…`, `user-agent: claude-cli/…`, `x-app: cli`). Thinking is enabled automatically on the OAuth path per Claude Max requirements.

With a regular `sk-ant-…` API key, no identity headers are added and thinking defaults to off.

## Tools

| Name | Schema params | Notes |
|---|---|---|
| `shell` | `command`, `timeout_ms?` | `checkCommand` blocks `rm -rf`, `sudo`, `curl\|sh`, writes to `/dev/*`, `.env` reads, etc. Abort signals propagate. |
| `read_file` | `path` | `isPathAllowed` enforces `ALLOWED_PATHS` whitelist and blocks `.env`, SSH keys, `.git/config`. Max 256 KB. |
| `write_file` | `path`, `content` | Same whitelist rules as `read_file`; creates parent dirs. |
| `acp` | `task`, `cwd?` | Spawns `acpx claude --approve-reads` in an allowed cwd. Default 3-minute timeout. |

Tools report failures by **throwing** — the pi-agent-core loop converts that into an `isError` tool-result message the model can read.

## Telegram commands

- `/start` — welcome message
- `/new [title]` — archive the active session and start a new one
- `/sessions` — list recent sessions for this chat
- `/switch <id>` — switch active session
- `/title <text>` — rename the active session
- `/clear` — delete messages in the active session
- `/status` — uptime, model, auth mode, memory, session stats
- `/myid` — show your Telegram user ID (for `ALLOWED_USERS`)

## Live progress

While a turn is running, the bot posts a single status message that is edited in place as each tool executes (`🔧 shell(ls -la)`). On `tool_execution_end` with `isError: true` the status flips to a failure indicator. The status message is deleted just before the final reply.

## Testing

Tests use Node's built-in test runner (`node --test`) via `tsx`, no extra framework. Run:

```bash
npm test
```

Covered:

- `tests/safety.test.ts` — `checkCommand` block/allow matrix and `isPathAllowed` rules.
- `tests/tools.test.ts` — `AgentTool` registry shape, safety denials in each tool (`shell` blocks `rm -rf`; `read_file`, `write_file`, `acp` reject paths outside `ALLOWED_PATHS`), happy-path execution against a temp dir.
- `tests/store.test.ts` — `AgentMessage` round-trip through SQLite, session creation/switching/clearing, per-chat isolation, orphan-`toolResult` trimming after history truncation.

Store tests point `DB_PATH` at a temp file so runs are isolated from production data.

## Production

```bash
npm run build && npm run pm2:start   # start under pm2
npm run pm2:logs                      # tail logs
npm run pm2:restart                   # restart
npm run pm2:stop
```

See `ecosystem.config.cjs` for the pm2 config.
