import type { Tool } from "@anthropic-ai/sdk/resources/messages.js";
import { shellExec } from "./shell.js";
import { readFileTool } from "./read-file.js";
import { writeFileTool } from "./write-file.js";
import { acpTool } from "./acp.js";

export interface ToolHandler {
  definition: Tool;
  execute: (input: Record<string, unknown>) => Promise<string>;
}

const tools: ToolHandler[] = [shellExec, readFileTool, writeFileTool, acpTool];

export function getToolDefinitions(): Tool[] {
  return tools.map((t) => t.definition);
}

export function findTool(name: string): ToolHandler | undefined {
  return tools.find((t) => t.definition.name === name);
}
