import { readFile } from "node:fs/promises";
import type { ToolHandler } from "./registry.js";

export const readFileTool: ToolHandler = {
  definition: {
    name: "read_file",
    description: "Read the contents of a file at the given path.",
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
    try {
      const content = await readFile(input.path as string, "utf-8");
      return content;
    } catch (err) {
      return `Error reading file: ${(err as Error).message}`;
    }
  },
};
