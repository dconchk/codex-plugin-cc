import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMPANION = path.join(ROOT, "plugins", "codex", "scripts", "codex-companion.mjs");

test("task accepts --output-schema and forwards it to the turn", () => {
  const source = fs.readFileSync(COMPANION, "utf8");
  assert.match(source, /valueOptions: \["model", "effort", "cwd", "prompt-file", "output-schema"\]/);
  assert.match(source, /outputSchema: request\.outputSchemaPath \? readOutputSchema\(request\.outputSchemaPath\) : null/);
  assert.match(source, /buildTaskRequest\(\{ cwd, model, effort, prompt, write, resumeLast, jobId, outputSchemaPath = null \}\)/);
});

test("task --output-schema with a missing file fails before any turn, naming the file", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "codex-task-schema-"));
  const missing = path.join(cwd, "does-not-exist.schema.json");
  const result = spawnSync(process.execPath, [COMPANION, "task", "--cwd", cwd, "--output-schema", missing, "say hi"], {
    encoding: "utf8",
    env: { ...process.env, PATH: cwd + path.delimiter + (process.env.PATH ?? "") }
  });
  assert.notEqual(result.status, 0);
  const text = `${result.stdout}\n${result.stderr}`;
  assert.match(text, /does-not-exist\.schema\.json|ENOENT|no such file|output schema/i);
  assert.doesNotMatch(text, /unknown option/i);
});
