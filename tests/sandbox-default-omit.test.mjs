import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { buildEnv, installFakeCodex } from "./fake-codex-fixture.mjs";
import { initGitRepo, makeTempDir, run } from "./helpers.mjs";
import { resolveSandboxMode } from "../plugins/codex/scripts/lib/codex.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_ROOT = path.join(ROOT, "plugins", "codex");
const SCRIPT = path.join(PLUGIN_ROOT, "scripts", "codex-companion.mjs");

// Fork behavior (openai/codex-plugin-cc#240): the plugin must not force a
// sandbox mode on app-server threads. Omitting the field lets the app server
// inherit the user's ~/.codex/config.toml sandbox_mode. The
// CODEX_COMPANION_SANDBOX_MODE env var forces a mode when explicitly set.

function sandboxTestEnv(binDir, mode) {
  const env = buildEnv(binDir);
  // Shield the tests from any ambient override in the invoking shell.
  delete env.CODEX_COMPANION_SANDBOX_MODE;
  if (mode !== undefined) {
    env.CODEX_COMPANION_SANDBOX_MODE = mode;
  }
  return env;
}

function readThreads(binDir) {
  return JSON.parse(fs.readFileSync(path.join(binDir, "fake-codex-state.json"), "utf8")).threads;
}

test("resolveSandboxMode omits by default and honors the env override", () => {
  assert.equal(resolveSandboxMode(null, {}), null);
  assert.equal(resolveSandboxMode(undefined, {}), null);
  assert.equal(resolveSandboxMode("workspace-write", {}), "workspace-write");
  assert.equal(resolveSandboxMode("bogus-mode", {}), null);
  assert.equal(resolveSandboxMode(null, { CODEX_COMPANION_SANDBOX_MODE: "danger-full-access" }), "danger-full-access");
  assert.equal(resolveSandboxMode("read-only", { CODEX_COMPANION_SANDBOX_MODE: "danger-full-access" }), "danger-full-access");
  assert.equal(resolveSandboxMode("workspace-write", { CODEX_COMPANION_SANDBOX_MODE: "inherit" }), null);
  assert.equal(resolveSandboxMode("read-only", { CODEX_COMPANION_SANDBOX_MODE: "" }), "read-only");
  assert.equal(resolveSandboxMode(null, { CODEX_COMPANION_SANDBOX_MODE: "not-a-mode" }), null);
});

test("task omits sandbox from thread/start so config.toml governs", () => {
  const repo = makeTempDir();
  const binDir = makeTempDir();
  installFakeCodex(binDir);
  initGitRepo(repo);

  const result = run("node", [SCRIPT, "task", "default sandbox probe"], {
    cwd: repo,
    env: sandboxTestEnv(binDir)
  });
  assert.equal(result.status, 0, result.stderr);

  const threads = readThreads(binDir);
  assert.equal(threads.length, 1);
  assert.equal(threads[0].sandboxFieldPresent, false);
  assert.equal(threads[0].requestedSandbox, null);
});

test("task --write also omits sandbox (no forced workspace-write)", () => {
  const repo = makeTempDir();
  const binDir = makeTempDir();
  installFakeCodex(binDir);
  initGitRepo(repo);

  const result = run("node", [SCRIPT, "task", "--write", "write sandbox probe"], {
    cwd: repo,
    env: sandboxTestEnv(binDir)
  });
  assert.equal(result.status, 0, result.stderr);

  const threads = readThreads(binDir);
  assert.equal(threads.length, 1);
  assert.equal(threads[0].sandboxFieldPresent, false);
});

test("CODEX_COMPANION_SANDBOX_MODE forces the mode on thread/start", () => {
  const repo = makeTempDir();
  const binDir = makeTempDir();
  installFakeCodex(binDir);
  initGitRepo(repo);

  const result = run("node", [SCRIPT, "task", "forced sandbox probe"], {
    cwd: repo,
    env: sandboxTestEnv(binDir, "danger-full-access")
  });
  assert.equal(result.status, 0, result.stderr);

  const threads = readThreads(binDir);
  assert.equal(threads.length, 1);
  assert.equal(threads[0].sandboxFieldPresent, true);
  assert.equal(threads[0].requestedSandbox, "danger-full-access");
});

test("task --resume-last keeps the omit on thread/resume", () => {
  const repo = makeTempDir();
  const binDir = makeTempDir();
  installFakeCodex(binDir);
  initGitRepo(repo);

  const firstRun = run("node", [SCRIPT, "task", "initial task"], {
    cwd: repo,
    env: sandboxTestEnv(binDir)
  });
  assert.equal(firstRun.status, 0, firstRun.stderr);

  const result = run("node", [SCRIPT, "task", "--resume-last", "follow up"], {
    cwd: repo,
    env: sandboxTestEnv(binDir)
  });
  assert.equal(result.status, 0, result.stderr);

  const threads = readThreads(binDir);
  const resumed = threads.find((thread) => thread.resumeSandboxFieldPresent !== undefined);
  assert.ok(resumed, "expected a thread/resume request to be recorded");
  assert.equal(resumed.resumeSandboxFieldPresent, false);
  assert.equal(resumed.resumeRequestedSandbox, null);
});
