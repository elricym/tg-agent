import type { AgentTool } from "@mariozechner/pi-agent-core";
import { shellTool } from "./shell.js";
import { readFileTool } from "./read-file.js";
import { writeFileTool } from "./write-file.js";
import { acpTool } from "./acp.js";

export const tools: AgentTool<any>[] = [
  shellTool,
  readFileTool,
  writeFileTool,
  acpTool,
];
