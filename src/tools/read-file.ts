import { readFile, stat } from "node:fs/promises";
import { isPathAllowed } from "../safety.js";
import type { ToolHandler } from "./registry.js";

const MAX_FILE_SIZE = 256 * 1024; // 256KB

export const readFileTool: ToolHandler = {
  definition: {
    name: "read_file",
    description:
      "Read the contents of a file. Path must be within allowed directories. Sensitive files (.env, keys) are blocked.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Absolute or relative file path to read",
        },
      },
      required: ["path"],
    },
  },
  execute: async (input) => {
    const filePath = input.path as string;

    if (!isPathAllowed(filePath)) {
      return `⛔ Access denied: path "${filePath}" is outside allowed directories or is a sensitive file.`;
    }

    try {
      const info = await stat(filePath);
      if (info.size > MAX_FILE_SIZE) {
        return `⛔ File too large (${(info.size / 1024).toFixed(0)}KB). Max: ${MAX_FILE_SIZE / 1024}KB.`;
      }
      const content = await readFile(filePath, "utf-8");
      return content;
    } catch (err) {
      return `Error reading file: ${(err as Error).message}`;
    }
  },
};
