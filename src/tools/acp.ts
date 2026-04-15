import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { config } from "../config.js";
import { isPathAllowed } from "../safety.js";
import type { ToolHandler } from "./registry.js";

export const acpTool: ToolHandler = {
  definition: {
    name: "acp",
    description:
      "Spawn a Claude Code session via ACP for complex coding tasks. Runs with --approve-reads and restricted to allowed directories. Timeout: 3 minutes by default.",
    input_schema: {
      type: "object" as const,
      properties: {
        task: {
          type: "string",
          description: "The task description for the Claude Code agent",
        },
        cwd: {
          type: "string",
          description:
            "Working directory for the agent (must be within allowed paths)",
        },
      },
      required: ["task"],
    },
  },
  execute: async (input) => {
    const task = input.task as string;
    const cwd = resolve((input.cwd as string) || config.acpDefaultCwd);

    if (!isPathAllowed(cwd)) {
      return `⛔ Access denied: working directory "${cwd}" is outside allowed paths.`;
    }

    // Sanitize: block obvious prompt injection in task
    if (task.length > 4000) {
      return "⛔ Task description too long (max 4000 chars).";
    }

    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      const errChunks: Buffer[] = [];

      const child = spawn(
        "acpx",
        ["claude", "--format", "text", "--approve-reads", "--cwd", cwd, task],
        { cwd, stdio: ["ignore", "pipe", "pipe"] }
      );

      child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
      child.stderr.on("data", (chunk: Buffer) => errChunks.push(chunk));

      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
        resolve(
          `[ACP timed out after ${config.acpTimeoutMs / 1000}s]`
        );
      }, config.acpTimeoutMs);

      child.on("close", (code) => {
        clearTimeout(timeout);
        const stdout = Buffer.concat(chunks).toString();
        const stderr = Buffer.concat(errChunks).toString();
        const parts: string[] = [];
        // Truncate to prevent token explosion
        const maxOut = 8000;
        if (stdout)
          parts.push(
            stdout.length > maxOut
              ? stdout.slice(0, maxOut) + "\n...[truncated]"
              : stdout
          );
        if (stderr)
          parts.push(
            `stderr:\n${stderr.length > maxOut ? stderr.slice(0, maxOut) + "\n...[truncated]" : stderr}`
          );
        if (code !== 0) parts.push(`exit code: ${code}`);
        resolve(parts.join("\n") || "(no output)");
      });

      child.on("error", (err) => {
        clearTimeout(timeout);
        resolve(`Error spawning acp: ${(err as Error).message}`);
      });
    });
  },
};
