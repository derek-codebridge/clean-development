import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveConfig } from "../src/config.js";
import { ensureRuntime, runTool } from "../src/runtime.js";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clean-development-runtime-"));
  const project = path.join(root, "project");
  const fakeBin = path.join(root, "fake-bin");
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(path.join(project, "Cargo.toml"), "[package]\nname='fixture'\nversion='0.1.0'\n");
  const env = {
    ...process.env,
    CLEAN_DEVELOPMENT_HOME: path.join(root, "home"),
    CLEAN_DEVELOPMENT_DATA_HOME: path.join(root, "data"),
    CLEAN_DEVELOPMENT_CONFIG_HOME: path.join(root, "config"),
    CLEAN_DEVELOPMENT_ROOT: path.join(root, "managed"),
    PATH: fakeBin
  };
  for (const name of ["caches", "builds", "scratch"]) fs.mkdirSync(path.join(root, "managed", name), { recursive: true });
  return { root, project, fakeBin, env };
}

test("runtime materializes stable CLI and tool shims", (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  const config = resolveConfig({ cwd: item.project, env: item.env });
  const runtime = ensureRuntime(config);
  assert.ok(fs.existsSync(path.join(runtime.binDir, "clean-development")));
  assert.ok(fs.existsSync(path.join(runtime.binDir, "cargo")));
  assert.ok(fs.existsSync(path.join(runtime.binDir, "clean-development-codex")));
  assert.ok(fs.existsSync(path.join(runtime.versionRoot, "src", "adapters.js")));
});

test("shim executes the real tool with routed environment and exit status", async (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  const capture = path.join(item.root, "capture.json");
  const fakeCargo = path.join(item.fakeBin, "cargo");
  fs.writeFileSync(fakeCargo, `#!${process.execPath}\nimport fs from 'node:fs';\nfs.writeFileSync(process.env.CAPTURE, JSON.stringify({ target: process.env.CARGO_TARGET_DIR, args: process.argv.slice(2), tty: Boolean(process.stdout.isTTY) }));\nprocess.exit(7);\n`, { mode: 0o755 });
  fs.chmodSync(fakeCargo, 0o755);
  const env = { ...item.env, CAPTURE: capture };
  const config = resolveConfig({ cwd: item.project, env });
  const code = await runTool("cargo", ["build", "--locked"], { config, cwd: item.project, env });
  assert.equal(code, 7);
  const observed = JSON.parse(fs.readFileSync(capture, "utf8"));
  assert.deepEqual(observed.args, ["build", "--locked"]);
  assert.match(observed.target, /managed[/\\]builds[/\\]project-[a-f0-9]{10}[/\\]cargo[/\\]target$/);
  assert.equal(fs.readdirSync(path.join(config.locations.stateDir, "leases")).length, 0);
});
