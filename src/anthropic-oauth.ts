/**
 * Raw fetch-based Anthropic Messages API client for OAuth tokens.
 * Claude Max OAuth tokens require specific params that the SDK doesn't support:
 * - ?beta=true query param
 * - stream: true
 * - thinking block
 */

import type { Tool } from "@anthropic-ai/sdk/resources/messages.js";

const API_URL = "https://api.anthropic.com/v1/messages?beta=true";

const HEADERS = {
  "anthropic-beta":
    "claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14",
  "anthropic-dangerous-direct-browser-access": "true",
  "anthropic-version": "2023-06-01",
  "content-type": "application/json",
  "user-agent": "claude-cli/2.1.76 (external, sdk-cli)",
  "x-app": "cli",
};

interface Message {
  role: "user" | "assistant";
  content: any;
}

interface OAuthRequestParams {
  token: string;
  model: string;
  messages: Message[];
  system: string;
  tools?: Tool[];
  maxTokens?: number;
  thinkingBudget?: number;
}

interface ContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

export interface OAuthResponse {
  id: string;
  content: ContentBlock[];
  stop_reason: string;
  usage: { input_tokens: number; output_tokens: number };
}

export async function oauthMessagesCreate(
  params: OAuthRequestParams
): Promise<OAuthResponse> {
  const {
    token,
    model,
    messages,
    system,
    tools,
    maxTokens = 8192,
    thinkingBudget = 1024,
  } = params;

  const body: Record<string, any> = {
    model,
    messages,
    system: [{ type: "text", text: system }],
    max_tokens: maxTokens,
    thinking: { type: "enabled", budget_tokens: thinkingBudget },
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
  }

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      ...HEADERS,
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as OAuthResponse;
  return data;
}
