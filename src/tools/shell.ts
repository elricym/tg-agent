import { exec } from "node:child_process";
import { checkCommand } from "../safety.js";
import type { ToolHandler } from "./registry.js";

export const shellExec: ToolHandler = {
  definition: {
    name: "shell",
    description:
      "Execute a shell command and return stdout/stderr. Dangerous commands (rm -rf, sudo, etc.) are blocked.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute",
        },
        timeout_ms: {
          type: "number",
          description: "Timeout in milliseconds (default: 30000, max: 60000)",
        },
      },
      required: ["command"],
    },
  },
  execute: async (input) => {
    const command = input.command as string;
    const timeout = Math.min((input.timeout_ms as number) || 30000, 60000);

    // Security check
    const check = checkCommand(command);
    if (!check.allowed) {
      return `⛔ Command blocked: ${check.reason}. This command is not allowed for security reasons.`;
    }

    return new Promise((resolve) => {
      exec(
        command,
        { timeout, maxBuffer: 512 * 1024 },
        (error, stdout, stderr) => {
          const parts: string[] = [];
          // Truncate output to prevent token bombs
          const maxOut = 8000;
          if (stdout)
            parts.push(
              `stdout:\n${stdout.length > maxOut ? stdout.slice(0, maxOut) + "\n...[truncated]" : stdout}`
            );
          if (stderr)
            parts.push(
              `stderr:\n${stderr.length > maxOut ? stderr.slice(0, maxOut) + "\n...[truncated]" : stderr}`
            );
          if (error && error.killed)
            parts.push(`[Process timed out after ${timeout}ms]`);
          else if (error) parts.push(`exit code: ${error.code}`);
          resolve(parts.join("\n") || "(no output)");
        }
      );
    });
  },
};
