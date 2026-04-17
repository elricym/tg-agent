import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { config } from "../config.js";
import { isPathAllowed } from "../safety.js";

const Params = Type.Object({
  task: Type.String({ description: "The task description for the Claude Code agent" }),
  cwd: Type.Optional(
    Type.String({
      description: "Working directory for the agent (must be within allowed paths)",
    })
  ),
});

export const acpTool: AgentTool<typeof Params> = {
  name: "acp",
  label: "Claude Code (ACP)",
  description:
    "Spawn a Claude Code session via ACP for complex coding tasks. Runs with --approve-reads and restricted to allowed directories. Timeout: 3 minutes by default.",
  parameters: Params,
  execute: async (_toolCallId, params: Static<typeof Params>, signal) => {
    const task = params.task;
    const cwd = resolve(params.cwd ?? config.acpDefaultCwd);

    if (!isPathAllowed(cwd)) {
      throw new Error(
        `Access denied: working directory "${cwd}" is outside allowed paths.`
      );
    }
    if (task.length > 4000) {
      throw new Error("Task description too long (max 4000 chars).");
    }

    return new Promise((resolveResult) => {
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
      }, config.acpTimeoutMs);

      signal?.addEventListener("abort", () => child.kill("SIGTERM"), {
        once: true,
      });

      child.on("close", (code) => {
        clearTimeout(timeout);
        const stdout = Buffer.concat(chunks).toString();
        const stderr = Buffer.concat(errChunks).toString();
        const parts: string[] = [];
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
        const text = parts.join("\n") || "(no output)";
        resolveResult({ content: [{ type: "text", text }], details: { code } });
      });

      child.on("error", (err) => {
        clearTimeout(timeout);
        resolveResult({
          content: [{ type: "text", text: `Error spawning acp: ${err.message}` }],
          details: { error: err.message },
        });
      });
    });
  },
};
