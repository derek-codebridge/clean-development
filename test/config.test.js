import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveConfig, writeUserConfig } from "../src/config.js";
import { environmentForTool } from "../src/adapters.js";
import { canonicalizePotentialPath } from "../src/platform.js";
import { identifyWorkspace } from "../src/workspace.js";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clean-development-config-"));
  const home = path.join(root, "home");
  const project = path.join(root, "project");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(path.join(project, "Cargo.toml"), "[package]\nname='fixture'\nversion='0.1.0'\n");
  const env = {
    ...process.env,
    CLEAN_DEVELOPMENT_HOME: home,
    CLEAN_DEVELOPMENT_DATA_HOME: path.join(root, "data"),
    CLEAN_DEVELOPMENT_CONFIG_HOME: path.join(root, "config")
  };
  return { root, home, project, env };
}

test("user root and project buildRoot resolve with clear precedence", (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  const managed = path.join(item.root, "managed");
  writeUserConfig({ root: managed, enabled: true }, item.env);
  fs.writeFileSync(path.join(item.project, ".clean-development.json"), JSON.stringify({
    schemaVersion: 1,
    buildRoot: path.join(item.root, "external-builds")
  }));

  const config = resolveConfig({ cwd: item.project, env: item.env });
  assert.equal(config.root, canonicalizePotentialPath(managed));
  assert.equal(config.cacheRoot, canonicalizePotentialPath(path.join(managed, "caches")));
  assert.equal(config.buildRoot, canonicalizePotentialPath(path.join(item.root, "external-builds")));
});

test("Cargo routing is workspace-specific and preserves explicit overrides", (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  const config = resolveConfig({ cwd: item.project, env: { ...item.env, CLEAN_DEVELOPMENT_ROOT: path.join(item.root, "managed") } });
  const first = environmentForTool("cargo", [], { config, cwd: item.project, env: item.env, create: false });
  assert.match(first.applied.CARGO_TARGET_DIR, /builds[/\\]project-[a-f0-9]{10}[/\\]cargo[/\\]target$/);
  assert.equal(first.workspace.root, fs.realpathSync(item.project));

  const custom = path.join(item.root, "my-target");
  const second = environmentForTool("cargo", [], { config, cwd: item.project, env: { ...item.env, CARGO_TARGET_DIR: custom }, create: false });
  assert.deepEqual(second.applied, {});
  assert.equal(second.preserved.CARGO_TARGET_DIR, custom);
});

test("workspace identity is stable per path and distinct for another checkout", (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  const second = path.join(item.root, "project-copy");
  fs.mkdirSync(second);
  fs.writeFileSync(path.join(second, "Cargo.toml"), "[package]\nname='fixture'\nversion='0.1.0'\n");
  assert.equal(identifyWorkspace("cargo", [], item.project).id, identifyWorkspace("cargo", [], item.project).id);
  assert.notEqual(identifyWorkspace("cargo", [], item.project).id, identifyWorkspace("cargo", [], second).id);
});

test("npm's injected default cache is routed while a custom cache is preserved", (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  const config = resolveConfig({ cwd: item.project, env: { ...item.env, CLEAN_DEVELOPMENT_ROOT: path.join(item.root, "managed") } });
  const npmDefault = path.join(item.home, ".npm");
  const routed = environmentForTool("npm", [], { config, cwd: item.project, env: { ...item.env, npm_config_cache: npmDefault }, create: false });
  assert.equal(routed.applied.npm_config_cache, path.join(config.cacheRoot, "node", "npm"));
  const custom = path.join(item.root, "deliberate-npm-cache");
  const preserved = environmentForTool("npm", [], { config, cwd: item.project, env: { ...item.env, npm_config_cache: custom }, create: false });
  assert.equal(preserved.preserved.npm_config_cache, custom);
  const upper = environmentForTool("npm", [], { config, cwd: item.project, env: { ...item.env, NPM_CONFIG_CACHE: custom }, create: false });
  assert.equal(upper.preserved.NPM_CONFIG_CACHE, custom);
  assert.equal(upper.env.npm_config_cache, undefined);
});

test("broad roots are refused", () => {
  assert.throws(() => resolveConfig({ env: { ...process.env, CLEAN_DEVELOPMENT_ROOT: path.parse(process.cwd()).root } }), /Refusing broad managed root/);
});

test("relative managed roots are refused from project, user, and environment configuration", (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(item.project, ".clean-development.json"), JSON.stringify({ schemaVersion: 1, root: "relative-project-root" }));
  assert.throws(() => resolveConfig({ cwd: item.project, env: item.env }), /must be absolute/);
  fs.unlinkSync(path.join(item.project, ".clean-development.json"));
  fs.mkdirSync(path.dirname(path.join(item.root, "config", "config.json")), { recursive: true });
  fs.writeFileSync(path.join(item.root, "config", "config.json"), JSON.stringify({ schemaVersion: 1, root: "relative-user-root" }));
  assert.throws(() => resolveConfig({ cwd: item.project, env: item.env }), /must be absolute/);
  fs.unlinkSync(path.join(item.root, "config", "config.json"));
  assert.throws(() => resolveConfig({ cwd: item.project, env: { ...item.env, CLEAN_DEVELOPMENT_ROOT: "relative-env-root" } }), /must be absolute/);
});

test("a managed root symlinked to the home directory is refused", (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  const alias = path.join(item.root, "home-alias");
  fs.symlinkSync(item.home, alias);
  assert.throws(() => resolveConfig({ env: { ...item.env, CLEAN_DEVELOPMENT_ROOT: alias } }), /Refusing broad managed root/);
});

test("user setup resolution can ignore project-only paths", (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  const userRoot = path.join(item.root, "user-managed");
  writeUserConfig({ root: userRoot, enabled: true }, item.env);
  fs.writeFileSync(path.join(item.project, ".clean-development.json"), JSON.stringify({
    schemaVersion: 1,
    buildRoot: path.join(item.root, "project-only-builds")
  }));
  const config = resolveConfig({ cwd: item.project, env: item.env, includeProject: false });
  assert.equal(config.buildRoot, canonicalizePotentialPath(path.join(userRoot, "builds")));
  assert.equal(config.projectConfigPath, null);
});

test("invalid or misspelled storage configuration fails closed", (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  const projectFile = path.join(item.project, ".clean-development.json");
  for (const value of [
    [],
    null,
    "wrong",
    { schemaVersion: 1, buildroot: path.join(item.root, "wrong-disk") },
    { schemaVersion: 1, buildRoot: "" },
    { schemaVersion: 1, retention: { buildDays: -1 } },
    { schemaVersion: 1, retention: { scratchHours: 24 } },
    { schemaVersion: 1, tools: { cargo: "yes" } }
  ]) {
    fs.writeFileSync(projectFile, JSON.stringify(value));
    assert.throws(() => resolveConfig({ cwd: item.project, env: item.env }), /Invalid configuration/);
  }
  fs.unlinkSync(projectFile);
  const userFile = path.join(item.root, "config", "config.json");
  fs.mkdirSync(path.dirname(userFile), { recursive: true });
  fs.writeFileSync(userFile, "[]\n");
  assert.throws(() => resolveConfig({ cwd: item.project, env: item.env }), /top level must be a JSON object/);
});

test("empty managed-root environment variables fail closed", (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  assert.throws(
    () => resolveConfig({ cwd: item.project, env: { ...item.env, CLEAN_DEVELOPMENT_ROOT: "" } }),
    /CLEAN_DEVELOPMENT_ROOT must be a non-empty absolute path/
  );
});

test("application data and config overrides must be narrow absolute paths", (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  for (const name of ["CLEAN_DEVELOPMENT_DATA_HOME", "CLEAN_DEVELOPMENT_CONFIG_HOME"]) {
    for (const value of ["", "relative", path.parse(item.root).root, item.home]) {
      assert.throws(() => resolveConfig({ cwd: item.project, env: { ...item.env, [name]: value } }), new RegExp(name));
    }
  }
});
