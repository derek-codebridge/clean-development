import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveConfig } from "../src/config.js";
import { runWithShims } from "../src/runtime.js";
import { applySessionPlan, planSession } from "../src/session.js";
import { isolatedEnvironment } from "../scripts/harness-utils.mjs";

test("run routes a supported top-level command through its shim logic", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clean-development-run-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const project = path.join(root, "project");
  const fakeBin = path.join(root, "fake-bin");
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(path.join(project, "Cargo.toml"), "[package]\nname='fixture'\nversion='0.1.0'\n");
  fs.writeFileSync(path.join(project, ".clean-development.json"), '{"schemaVersion":1}\n');
  const capture = path.join(root, "capture");
  const cargo = path.join(fakeBin, "cargo");
  fs.writeFileSync(cargo, `#!${process.execPath}\nconst fs = require('node:fs');\nfs.writeFileSync(process.env.CAPTURE, process.env.CARGO_TARGET_DIR || 'missing');\n`, { mode: 0o755 });
  fs.chmodSync(cargo, 0o755);
  const env = {
    ...isolatedEnvironment(root),
    NODE_OPTIONS: "--no-experimental-detect-module",
    CAPTURE: capture,
    PATH: fakeBin
  };
  for (const name of ["caches", "builds", "scratch"]) fs.mkdirSync(path.join(root, "managed", name), { recursive: true });
  const config = resolveConfig({ cwd: project, env });
  assert.equal(await runWithShims("cargo", ["check"], { config, cwd: project, env }), 0);
  assert.match(fs.readFileSync(capture, "utf8"), /managed[/\\]builds[/\\]project-[a-f0-9]{10}[/\\]cargo[/\\]target$/);
});

test("a routed shim strips its managed environment when targeting a disabled project", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clean-development-disabled-transition-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const enabled = path.join(root, "enabled");
  const disabled = path.join(root, "disabled");
  const fakeBin = path.join(root, "fake-bin");
  fs.mkdirSync(enabled, { recursive: true });
  fs.mkdirSync(disabled, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(path.join(enabled, "package.json"), "{}\n");
  fs.writeFileSync(path.join(disabled, "package.json"), "{}\n");
  fs.writeFileSync(path.join(disabled, ".clean-development.json"), '{"schemaVersion":1,"enabled":false}\n');
  const capture = path.join(root, "capture.json");
  const npm = path.join(fakeBin, "npm");
  fs.writeFileSync(npm, `#!${process.execPath}\nrequire('node:fs').writeFileSync(process.env.CAPTURE, JSON.stringify({mode:process.env.CLEAN_DEVELOPMENT_SESSION_MODE,active:process.env.CLEAN_DEVELOPMENT_ACTIVE,cache:process.env.npm_config_cache,marker:process.env.CLEAN_DEVELOPMENT_SESSION_ENV,path:process.env.PATH}));\n`, { mode: 0o755 });
  const env = {
    ...isolatedEnvironment(root),
    CLEAN_DEVELOPMENT_ROOT: path.join(root, "managed"),
    CAPTURE: capture,
    PATH: fakeBin
  };
  const config = resolveConfig({ cwd: enabled, env });
  const routed = applySessionPlan(planSession({ cwd: enabled, env, config }), "session-only", env);
  assert.equal(await runWithShims("npm", ["--prefix", disabled, "test"], { config, cwd: enabled, env: routed.env }), 0);
  const observed = JSON.parse(fs.readFileSync(capture, "utf8"));
  assert.equal(observed.mode, "skip");
  assert.equal(observed.active, undefined);
  assert.equal(observed.cache, undefined);
  assert.equal(observed.marker, undefined);
  assert.equal(observed.path, fakeBin);
});
