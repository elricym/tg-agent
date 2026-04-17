import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  ContentBlockParam,
  ToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/messages.js";
import { config } from "./config.js";
import { buildSystemPrompt } from "./safety.js";
import { getToolDefinitions, findTool } from "./tools/registry.js";

const isOAuth = config.anthropicApiKey.startsWith("sk-ant-oat");

// Match OpenClaw/pi-ai's OAuth client setup exactly
const client = isOAuth
  ? new Anthropic({
      apiKey: null as any,
      authToken: config.anthropicApiKey,
      dangerouslyAllowBrowser: true,
      defaultHeaders: {
        accept: "application/json",
        "anthropic-dangerous-direct-browser-access": "true",
        "anthropic-beta":
          "claude-code-20250219,oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14,interleaved-thinking-2025-05-14",
        "user-agent": "claude-cli/2.1.76 (external, cli)",
        "x-app": "cli",
      },
    })
  : new Anthropic({ apiKey: config.anthropicApiKey });

if (isOAuth) {
  console.log("⚡ OAuth token → SDK with Claude Code identity headers");
} else {
  console.log("🔑 API key → direct SDK");
}

const MAX_ROUNDS = 10;

// ── Progress events ──────────────────────────────────────────

export type ProgressEvent =
  | { type: "round"; round: number }
  | { type: "tool_use"; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; name: string; preview: string }
  | { type: "max_rounds" }
  | { type: "error"; message: string };

export interface RunAgentOptions {
  onProgress?: (event: ProgressEvent) => void | Promise<void>;
}

export interface AgentResult {
  text: string;
  newMessages: MessageParam[];
  rounds: number;
  stopReason: string | null;
  usage: { input_tokens: number; output_tokens: number };
}

// ── Tool execution ───────────────────────────────────────────

async function executeTools(
  toolUseBlocks: any[],
  onProgress?: RunAgentOptions["onProgress"]
): Promise<ToolResultBlockParam[]> {
  const results: ToolResultBlockParam[] = [];
  for (const block of toolUseBlocks) {
    if (block.type !== "tool_use") continue;

    await onProgress?.({
      type: "tool_use",
      name: block.name,
      input: block.input as Record<string, unknown>,
    });

    const handler = findTool(block.name);
    let result: string;
    if (handler) {
      try {
        result = await handler.execute(block.input as Record<string, unknown>);
      } catch (err) {
        result = `Tool error: ${(err as Error).message}`;
      }
    } else {
      result = `Unknown tool: ${block.name}`;
    }

    await onProgress?.({
      type: "tool_result",
      name: block.name,
      preview: result.slice(0, 120),
    });

    results.push({
      type: "tool_result",
      tool_use_id: block.id,
      content: result,
    });
  }
  return results;
}

// ── Build system prompt (OAuth needs Claude Code identity) ───

function buildSystemBlocks(): any {
  const userPrompt = buildSystemPrompt();

  if (isOAuth) {
    // OAuth tokens MUST include Claude Code identity as first system block
    return [
      { type: "text", text: "You are Claude Code, Anthropic's official CLI for Claude." },
      { type: "text", text: userPrompt },
    ];
  }

  return userPrompt;
}

// ── Agent loop ───────────────────────────────────────────────

export async function runAgent(
  messages: MessageParam[],
  opts: RunAgentOptions = {}
): Promise<AgentResult> {
  const tools = getToolDefinitions();
  const system = buildSystemBlocks();
  const newMessages: MessageParam[] = [];
  const textParts: string[] = [];
  const usage = { input_tokens: 0, output_tokens: 0 };
  let stopReason: string | null = null;
  let round = 0;

  for (round = 0; round < MAX_ROUNDS; round++) {
    await opts.onProgress?.({ type: "round", round: round + 1 });

    const params: any = {
      model: config.model,
      max_tokens: 16384,
      system,
      tools,
      messages: [...messages, ...newMessages],
      stream: true as const,
    };

    if (isOAuth) {
      params.thinking = { type: "enabled", budget_tokens: 1024 };
    }

    const stream = client.messages.stream(params);
    const response = await stream.finalMessage();

    usage.input_tokens += response.usage?.input_tokens ?? 0;
    usage.output_tokens += response.usage?.output_tokens ?? 0;
    stopReason = response.stop_reason ?? null;

    // Always preserve the assistant turn (text + thinking + tool_use blocks)
    // so multi-turn tool conversations keep full context.
    newMessages.push({
      role: "assistant",
      content: response.content as ContentBlockParam[],
    });

    const texts = response.content
      .filter((b: any) => b.type === "text" && b.text)
      .map((b: any) => b.text);
    textParts.push(...texts);

    const toolUseBlocks = response.content.filter(
      (b: any) => b.type === "tool_use"
    );

    if (toolUseBlocks.length === 0 || stopReason === "end_turn") {
      break;
    }

    const toolResults = await executeTools(toolUseBlocks, opts.onProgress);
    newMessages.push({ role: "user", content: toolResults });
  }

  if (round >= MAX_ROUNDS) {
    await opts.onProgress?.({ type: "max_rounds" });
  }

  return {
    text: textParts.join("\n\n") || "(No response)",
    newMessages,
    rounds: round + 1,
    stopReason,
    usage,
  };
}
