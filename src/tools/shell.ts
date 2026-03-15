import { exec } from "node:child_process";
import type { ToolHandler } from "./registry.js";

export const shellExec: ToolHandler = {
  definition: {
    name: "shell",
    description:
      "Execute a shell command and return its stdout and stderr. Use for running programs, checking system state, etc.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute",
        },
        timeout_ms: {
          type: "number",
          description: "Timeout in milliseconds (default: 30000)",
        },
      },
      required: ["command"],
    },
  },
  execute: async (input) => {
    const command = input.command as string;
    const timeout = (input.timeout_ms as number) || 30000;

    return new Promise((resolve) => {
      exec(command, { timeout, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
        const parts: string[] = [];
        if (stdout) parts.push(`stdout:\n${stdout}`);
        if (stderr) parts.push(`stderr:\n${stderr}`);
        if (error && error.killed) parts.push(`[Process timed out after ${timeout}ms]`);
        else if (error) parts.push(`exit code: ${error.code}`);
        resolve(parts.join("\n") || "(no output)");
      });
    });
  },
};
