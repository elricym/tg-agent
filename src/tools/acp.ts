import { spawn } from "node:child_process";
import { config } from "../config.js";
import type { ToolHandler } from "./registry.js";

export const acpTool: ToolHandler = {
  definition: {
    name: "acp",
    description:
      "Spawn an ACP (Agent Control Protocol) Claude session to handle a complex task. Returns the text output from the agent.",
    input_schema: {
      type: "object" as const,
      properties: {
        task: {
          type: "string",
          description: "The task description for the ACP agent",
        },
        cwd: {
          type: "string",
          description:
            "Working directory for the agent (defaults to ACP_DEFAULT_CWD)",
        },
      },
      required: ["task"],
    },
  },
  execute: async (input) => {
    const task = input.task as string;
    const cwd = (input.cwd as string) || config.acpDefaultCwd;

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
        resolve("[ACP timed out after 5 minutes]");
      }, 5 * 60 * 1000);

      child.on("close", (code) => {
        clearTimeout(timeout);
        const stdout = Buffer.concat(chunks).toString();
        const stderr = Buffer.concat(errChunks).toString();
        const parts: string[] = [];
        if (stdout) parts.push(stdout);
        if (stderr) parts.push(`stderr:\n${stderr}`);
        if (code !== 0) parts.push(`exit code: ${code}`);
        resolve(parts.join("\n") || "(no output)");
      });

      child.on("error", (err) => {
        clearTimeout(timeout);
        resolve(`Error spawning acp: ${err.message}`);
      });
    });
  },
};
