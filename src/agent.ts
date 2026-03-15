import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  ContentBlockParam,
  ToolResultBlockParam,
} from "@anthropic-ai/sdk/resources/messages.js";
import { config } from "./config.js";
import { getToolDefinitions, findTool } from "./tools/registry.js";

// OAuth tokens (sk-ant-oat-*) need Bearer auth + special beta headers
// This mirrors how OpenClaw/Claude Code authenticates with Max plan tokens
const isOAuth = config.anthropicApiKey.includes("sk-ant-oat");
const client = isOAuth
  ? new Anthropic({
      apiKey: null as any,
      authToken: config.anthropicApiKey,
      defaultHeaders: {
        "anthropic-beta": "claude-code-20250219,oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14,interleaved-thinking-2025-05-14",
        "user-agent": "claude-cli/2.1.0 (external, cli)",
        "x-app": "cli",
      },
    })
  : new Anthropic({ apiKey: config.anthropicApiKey });

const MAX_ROUNDS = 10;

export async function runAgent(
  messages: MessageParam[]
): Promise<string> {
  const tools = getToolDefinitions();
  let currentMessages = [...messages];
  let textParts: string[] = [];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const response = await client.messages.create({
      model: config.model,
      max_tokens: 8192,
      system: config.systemPrompt,
      tools,
      messages: currentMessages,
    });

    // Collect text blocks
    const texts = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text);
    textParts.push(...texts);

    // Check for tool use
    const toolUseBlocks = response.content.filter(
      (b) => b.type === "tool_use"
    );

    if (toolUseBlocks.length === 0 || response.stop_reason === "end_turn") {
      break;
    }

    // Add assistant response to messages
    currentMessages.push({
      role: "assistant",
      content: response.content as ContentBlockParam[],
    });

    // Execute tools and collect results
    const toolResults: ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      if (block.type !== "tool_use") continue;
      const handler = findTool(block.name);
      let result: string;
      if (handler) {
        try {
          result = await handler.execute(
            block.input as Record<string, unknown>
          );
        } catch (err) {
          result = `Tool error: ${(err as Error).message}`;
        }
      } else {
        result = `Unknown tool: ${block.name}`;
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: result,
      });
    }

    currentMessages.push({
      role: "user",
      content: toolResults,
    });
  }

  return textParts.join("\n\n") || "(No response)";
}
