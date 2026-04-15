import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { isPathAllowed } from "../safety.js";
import type { ToolHandler } from "./registry.js";

export const writeFileTool: ToolHandler = {
  definition: {
    name: "write_file",
    description:
      "Write content to a file. Path must be within allowed directories. Sensitive paths are blocked.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: {
          type: "string",
          description: "Absolute or relative file path to write",
        },
        content: {
          type: "string",
          description: "Content to write to the file",
        },
      },
      required: ["path", "content"],
    },
  },
  execute: async (input) => {
    const filePath = input.path as string;

    if (!isPathAllowed(filePath)) {
      return `⛔ Access denied: path "${filePath}" is outside allowed directories or is a sensitive file.`;
    }

    try {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, input.content as string, "utf-8");
      return `File written: ${filePath}`;
    } catch (err) {
      return `Error writing file: ${(err as Error).message}`;
    }
  },
};
