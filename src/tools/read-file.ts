import { readFile, stat } from "node:fs/promises";
import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { isPathAllowed } from "../safety.js";

const MAX_FILE_SIZE = 256 * 1024;

const Params = Type.Object({
  path: Type.String({ description: "Absolute or relative file path to read" }),
});

export const readFileTool: AgentTool<typeof Params> = {
  name: "read_file",
  label: "Read File",
  description:
    "Read the contents of a file. Path must be within allowed directories. Sensitive files (.env, keys) are blocked.",
  parameters: Params,
  execute: async (_toolCallId, params: Static<typeof Params>) => {
    const filePath = params.path;

    if (!isPathAllowed(filePath)) {
      throw new Error(
        `Access denied: path "${filePath}" is outside allowed directories or is a sensitive file.`
      );
    }

    const info = await stat(filePath);
    if (info.size > MAX_FILE_SIZE) {
      throw new Error(
        `File too large (${(info.size / 1024).toFixed(0)}KB). Max: ${MAX_FILE_SIZE / 1024}KB.`
      );
    }
    const content = await readFile(filePath, "utf-8");
    return { content: [{ type: "text", text: content }], details: { size: info.size } };
  },
};
