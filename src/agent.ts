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

// ── Tool execution ───────────────────────────────────────────

async function executeTools(
  toolUseBlocks: any[]
): Promise<ToolResultBlockParam[]> {
  const results: ToolResultBlockParam[] = [];
  for (const block of toolUseBlocks) {
    if (block.type !== "tool_use") continue;
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
  messages: MessageParam[]
): Promise<string> {
  const tools = getToolDefinitions();
  const system = buildSystemBlocks();
  let currentMessages = [...messages];
  let textParts: string[] = [];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const params: any = {
      model: config.model,
      max_tokens: 16384,
      system,
      tools,
      messages: currentMessages,
      stream: true as const,
    };

    // OAuth requires thinking enabled
    if (isOAuth) {
      params.thinking = { type: "enabled", budget_tokens: 1024 };
    }

    // Use streaming to satisfy OAuth requirement
    const stream = client.messages.stream(params);
    const response = await stream.finalMessage();

    // Collect text blocks (skip thinking blocks)
    const texts = response.content
      .filter((b: any) => b.type === "text" && b.text)
      .map((b: any) => b.text);
    textParts.push(...texts);

    const toolUseBlocks = response.content.filter(
      (b: any) => b.type === "tool_use"
    );

    if (toolUseBlocks.length === 0 || response.stop_reason === "end_turn") {
      break;
    }

    currentMessages.push({
      role: "assistant",
      content: response.content as ContentBlockParam[],
    });

    const toolResults = await executeTools(toolUseBlocks);
    currentMessages.push({ role: "user", content: toolResults });
  }

  return textParts.join("\n\n") || "(No response)";
}
