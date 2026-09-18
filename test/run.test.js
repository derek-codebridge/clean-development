import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveConfig } from "../src/config.js";
import { runWithShims } from "../src/runtime.js";

test("run routes a supported top-level command through its shim logic", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clean-development-run-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const project = path.join(root, "project");
  const fakeBin = path.join(root, "fake-bin");
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(path.join(project, "Cargo.toml"), "[package]\nname='fixture'\nversion='0.1.0'\n");
  const capture = path.join(root, "capture");
  const cargo = path.join(fakeBin, "cargo");
  fs.writeFileSync(cargo, `#!${process.execPath}\nimport fs from 'node:fs';\nfs.writeFileSync(process.env.CAPTURE, process.env.CARGO_TARGET_DIR || 'missing');\n`, { mode: 0o755 });
  fs.chmodSync(cargo, 0o755);
  const env = {
    ...process.env,
    CLEAN_DEVELOPMENT_HOME: path.join(root, "home"),
    CLEAN_DEVELOPMENT_DATA_HOME: path.join(root, "data"),
    CLEAN_DEVELOPMENT_CONFIG_HOME: path.join(root, "config"),
    CLEAN_DEVELOPMENT_ROOT: path.join(root, "managed"),
    CAPTURE: capture,
    PATH: fakeBin
  };
  for (const name of ["caches", "builds", "scratch"]) fs.mkdirSync(path.join(root, "managed", name), { recursive: true });
  const config = resolveConfig({ cwd: project, env });
  assert.equal(await runWithShims("cargo", ["check"], { config, cwd: project, env }), 0);
  assert.match(fs.readFileSync(capture, "utf8"), /managed[/\\]builds[/\\]project-[a-f0-9]{10}[/\\]cargo[/\\]target$/);
});
