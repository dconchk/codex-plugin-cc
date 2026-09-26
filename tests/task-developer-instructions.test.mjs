import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { buildEnv, installFakeCodex } from "./fake-codex-fixture.mjs";
import { initGitRepo, makeTempDir, run } from "./helpers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "plugins", "codex", "scripts", "codex-companion.mjs");

function readThreads(binDir) {
  return JSON.parse(fs.readFileSync(path.join(binDir, "fake-codex-state.json"), "utf8")).threads;
}

test("task --developer-instructions-file sends the file as thread/start developerInstructions; without it none is sent", () => {
  const repo = makeTempDir();
  const binDir = makeTempDir();
  installFakeCodex(binDir);
  initGitRepo(repo);
  const file = path.join(repo, "role.md");
  fs.writeFileSync(file, "You are the Reviewer.\n");

  const withFile = run("node", [SCRIPT, "task", "--developer-instructions-file", file, "role probe"], { cwd: repo, env: buildEnv(binDir) });
  assert.equal(withFile.status, 0, withFile.stderr);
  const without = run("node", [SCRIPT, "task", "--fresh", "plain probe"], { cwd: repo, env: buildEnv(binDir) });
  assert.equal(without.status, 0, without.stderr);

  const threads = readThreads(binDir);
  const byPrompt = (prompt) => threads.find((thread) => thread.name.endsWith(prompt));
  assert.equal(threads.length, 2);
  assert.equal(byPrompt("role probe").developerInstructions, "You are the Reviewer.\n");
  assert.equal(byPrompt("plain probe").developerInstructions, null);
});

test("task --developer-instructions-file with an empty file fails before any turn, naming the file", () => {
  const repo = makeTempDir();
  const binDir = makeTempDir();
  installFakeCodex(binDir);
  initGitRepo(repo);
  const file = path.join(repo, "empty.md");
  fs.writeFileSync(file, "  \n");

  const result = run("node", [SCRIPT, "task", "--developer-instructions-file", file, "role probe"], { cwd: repo, env: buildEnv(binDir) });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /empty\.md/);
  assert.equal(fs.existsSync(path.join(binDir, "fake-codex-state.json")) ? readThreads(binDir).length : 0, 0);
});
