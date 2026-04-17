import { exec } from "node:child_process";
import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { checkCommand } from "../safety.js";

const Params = Type.Object({
  command: Type.String({ description: "The shell command to execute" }),
  timeout_ms: Type.Optional(
    Type.Number({ description: "Timeout in ms (default 30000, max 60000)" })
  ),
});

export const shellTool: AgentTool<typeof Params> = {
  name: "shell",
  label: "Shell",
  description:
    "Execute a shell command and return stdout/stderr. Dangerous commands (rm -rf, sudo, etc.) are blocked.",
  parameters: Params,
  execute: async (_toolCallId, params: Static<typeof Params>, signal) => {
    const command = params.command;
    const timeout = Math.min(params.timeout_ms ?? 30000, 60000);

    const check = checkCommand(command);
    if (!check.allowed) {
      throw new Error(
        `Command blocked: ${check.reason}. Not allowed for security reasons.`
      );
    }

    return new Promise((resolve) => {
      const child = exec(
        command,
        { timeout, maxBuffer: 512 * 1024 },
        (error, stdout, stderr) => {
          const parts: string[] = [];
          const maxOut = 8000;
          if (stdout)
            parts.push(
              `stdout:\n${stdout.length > maxOut ? stdout.slice(0, maxOut) + "\n...[truncated]" : stdout}`
            );
          if (stderr)
            parts.push(
              `stderr:\n${stderr.length > maxOut ? stderr.slice(0, maxOut) + "\n...[truncated]" : stderr}`
            );
          if (error && (error as any).killed)
            parts.push(`[Process timed out after ${timeout}ms]`);
          else if (error) parts.push(`exit code: ${(error as any).code}`);
          const text = parts.join("\n") || "(no output)";
          resolve({ content: [{ type: "text", text }], details: {} });
        }
      );
      signal?.addEventListener("abort", () => child.kill("SIGTERM"), {
        once: true,
      });
    });
  },
};
