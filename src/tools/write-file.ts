import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { isPathAllowed } from "../safety.js";

const Params = Type.Object({
  path: Type.String({ description: "Absolute or relative file path to write" }),
  content: Type.String({ description: "Content to write to the file" }),
});

export const writeFileTool: AgentTool<typeof Params> = {
  name: "write_file",
  label: "Write File",
  description:
    "Write content to a file. Path must be within allowed directories. Sensitive paths are blocked.",
  parameters: Params,
  execute: async (_toolCallId, params: Static<typeof Params>) => {
    const filePath = params.path;

    if (!isPathAllowed(filePath)) {
      throw new Error(
        `Access denied: path "${filePath}" is outside allowed directories or is a sensitive file.`
      );
    }

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, params.content, "utf-8");
    return {
      content: [{ type: "text", text: `File written: ${filePath}` }],
      details: { path: filePath, bytes: params.content.length },
    };
  },
};
