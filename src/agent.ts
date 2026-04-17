import { Agent } from "@mariozechner/pi-agent-core";
import type { AgentEvent, AgentMessage } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import type { AssistantMessage, TextContent } from "@mariozechner/pi-ai";
import { config } from "./config.js";
import { buildSystemPrompt } from "./safety.js";
import { tools } from "./tools/registry.js";

// Our OAuth logic:
// Tokens starting with sk-ant-oat are Claude Max OAuth bearer tokens.
// pi-ai's anthropic provider detects the same prefix and automatically
// switches to Bearer auth with Claude Code identity headers
// (anthropic-beta: claude-code-20250219,oauth-2025-04-20 ; user-agent:
// claude-cli/... ; x-app: cli). We keep the detection explicit here so
// ownership of the auth decision stays in this repo — pi-ai just executes
// the resulting request. Thinking must be enabled for OAuth.
const isOAuth = config.anthropicApiKey.startsWith("sk-ant-oat");

if (isOAuth) {
  console.log("⚡ OAuth token → pi-ai (Claude Code identity)");
} else {
  console.log("🔑 API key → pi-ai");
}

export interface RunAgentOptions {
  onEvent?: (event: AgentEvent) => void | Promise<void>;
}

export interface AgentResult {
  /** Concatenated final assistant text. */
  text: string;
  /** Messages appended during this run (user prompt + assistant turns + tool results). */
  newMessages: AgentMessage[];
  stopReason: string | null;
  errorMessage?: string;
}

function extractFinalText(message: AssistantMessage | undefined): string {
  if (!message) return "(No response)";
  const parts = message.content
    .filter((b): b is TextContent => b.type === "text")
    .map((b) => b.text.trim())
    .filter(Boolean);
  return parts.join("\n\n") || "(No response)";
}

export async function runAgent(
  history: AgentMessage[],
  userText: string,
  opts: RunAgentOptions = {}
): Promise<AgentResult> {
  const model = getModel("anthropic", config.model as any);

  const agent = new Agent({
    initialState: {
      systemPrompt: buildSystemPrompt(),
      model,
      // OAuth requires thinking enabled on Claude 4 models.
      thinkingLevel: isOAuth ? "low" : "off",
      tools,
      messages: history,
    },
    getApiKey: (provider) =>
      provider === "anthropic" ? config.anthropicApiKey : undefined,
  });

  if (opts.onEvent) {
    agent.subscribe(opts.onEvent);
  }

  await agent.prompt(userText);

  const allMessages = agent.state.messages;
  const newMessages = allMessages.slice(history.length);

  const lastAssistant = [...newMessages]
    .reverse()
    .find((m): m is AssistantMessage => m.role === "assistant");

  return {
    text: extractFinalText(lastAssistant),
    newMessages,
    stopReason: lastAssistant?.stopReason ?? null,
    errorMessage: lastAssistant?.errorMessage,
  };
}
