import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "tg-agent-tools-"));
process.env.ALLOWED_USERS ??= "1";
process.env.TELEGRAM_BOT_TOKEN ??= "test";
process.env.ANTHROPIC_API_KEY ??= "sk-ant-test";
process.env.ALLOWED_PATHS = tmp;

const { tools } = await import("../src/tools/registry.ts");

function getTool(name: string) {
  const t = tools.find((x) => x.name === name);
  if (!t) throw new Error(`tool ${name} not registered`);
  return t;
}

test("registry exports 4 tools with required AgentTool shape", () => {
  assert.equal(tools.length, 4);
  for (const t of tools) {
    assert.equal(typeof t.name, "string");
    assert.equal(typeof t.label, "string");
    assert.equal(typeof t.description, "string");
    assert.equal(typeof t.execute, "function");
    assert.equal(t.parameters.type, "object");
  }
});

test("shell blocks dangerous commands via thrown error", async () => {
  const shell = getTool("shell");
  await assert.rejects(
    () => shell.execute("id-1", { command: "rm -rf /" }),
    /Command blocked/
  );
});

test("shell executes safe commands and returns text content", async () => {
  const shell = getTool("shell");
  const res = await shell.execute("id-1", { command: "echo hello" });
  assert.ok(res.content.length > 0);
  const text = res.content[0] as { type: "text"; text: string };
  assert.equal(text.type, "text");
  assert.match(text.text, /hello/);
});

test("read_file blocks paths outside allowed dirs", async () => {
  const read = getTool("read_file");
  await assert.rejects(
    () => read.execute("id-1", { path: "/etc/hosts" }),
    /Access denied/
  );
});

test("read_file reads files inside allowed dirs", async () => {
  const p = join(tmp, "sample.txt");
  writeFileSync(p, "pi-mono!");
  const read = getTool("read_file");
  const res = await read.execute("id-1", { path: p });
  const text = res.content[0] as { type: "text"; text: string };
  assert.equal(text.text, "pi-mono!");
  rmSync(p);
});

test("write_file blocks outside allowed dirs", async () => {
  const write = getTool("write_file");
  await assert.rejects(
    () =>
      write.execute("id-1", { path: "/tmp/forbidden.txt", content: "nope" }),
    /Access denied/
  );
});

test("write_file writes inside allowed dirs", async () => {
  const p = join(tmp, "out.txt");
  const write = getTool("write_file");
  const res = await write.execute("id-1", { path: p, content: "hi" });
  const text = res.content[0] as { type: "text"; text: string };
  assert.match(text.text, /File written/);
  rmSync(p);
});

test("acp blocks cwd outside allowed dirs", async () => {
  const acp = getTool("acp");
  await assert.rejects(
    () => acp.execute("id-1", { task: "hi", cwd: "/etc" }),
    /Access denied/
  );
});

test("acp rejects tasks over 4000 chars", async () => {
  const acp = getTool("acp");
  await assert.rejects(
    () => acp.execute("id-1", { task: "x".repeat(4001), cwd: tmp }),
    /too long/
  );
});

test.after(() => rmSync(tmp, { recursive: true, force: true }));
