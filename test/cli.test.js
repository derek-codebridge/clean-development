import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const cli = path.resolve("bin/clean-development.js");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clean-development-cli-"));
  const home = path.join(root, "home");
  const claude = path.join(root, "claude");
  const codex = path.join(root, "codex");
  const grok = path.join(root, "grok");
  fs.mkdirSync(home, { recursive: true });
  const env = {
    ...process.env,
    CLEAN_DEVELOPMENT_HOME: home,
    CLEAN_DEVELOPMENT_DATA_HOME: path.join(root, "data"),
    CLEAN_DEVELOPMENT_CONFIG_HOME: path.join(root, "config"),
    CLAUDE_CONFIG_DIR: claude,
    CODEX_HOME: codex,
    GROK_HOME: grok
  };
  for (const name of ["npm_execpath", "NPM_EXECPATH", "npm_lifecycle_event", "npm_command"]) delete env[name];
  return { root, home, claude, codex, grok, env };
}

function run(args, env, cwd = process.cwd()) {
  return spawnSync(process.execPath, [cli, ...args], { cwd, env, encoding: "utf8" });
}

test("setup dry run performs no writes", (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  const managed = path.join(item.root, "managed");
  const result = run(["setup", "--root", managed, "--agents", "claude,codex", "--dry-run", "--json"], item.env);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).dryRun, true);
  assert.equal(fs.existsSync(path.join(item.root, "config")), false);
  assert.equal(fs.existsSync(managed), false);
});

test("setup refuses to create through a missing parent that may be an unmounted volume", (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  const managed = path.join(item.root, "missing-volume", "clean-development");
  const result = run(["setup", "--root", managed, "--agents", "claude", "--json"], item.env);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Parent directory is unavailable/);
  assert.equal(fs.existsSync(path.join(item.root, "missing-volume")), false);
});

test("mutating commands reject unknown flags, boolean values, and stray positionals", (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  const managed = path.join(item.root, "managed");
  const cases = [
    ["prepare", "--dryrun", "--json"],
    ["prepare", "--toString", "ignored", "--json"],
    ["setup", "dry-run", "--root", managed, "--json"],
    ["setup", "--dry-run=false", "--root", managed, "--json"],
    ["setup", "--root", managed, "--agents", "toString", "--json"],
    ["prune", "--apply=false", "--json"]
  ];
  for (const args of cases) {
    const result = run(args, item.env);
    assert.equal(result.status, 1, `${args.join(" ")} unexpectedly succeeded`);
  }
  assert.equal(fs.existsSync(managed), false);
  assert.equal(fs.existsSync(path.join(item.root, "config", "config.json")), false);
  const invalidAgent = run(["agent", "toString"], item.env);
  assert.equal(invalidAgent.status, 1);
  assert.equal(fs.existsSync(path.join(item.root, "data", "bin")), false);

  const installed = run(["setup", "--root", managed, "--agents", "claude", "--json"], item.env);
  assert.equal(installed.status, 0, installed.stderr);
  const launcher = path.join(item.root, "data", "bin", process.platform === "win32" ? "clean-development.cmd" : "clean-development");
  const misspelledUninstall = run(["uninstall", "--dryrun", "--json"], item.env);
  assert.equal(misspelledUninstall.status, 1);
  assert.equal(fs.existsSync(launcher), true);

  const project = path.join(item.root, "project");
  fs.mkdirSync(project);
  const projectConfig = path.join(project, ".clean-development.json");
  fs.writeFileSync(projectConfig, "{\"schemaVersion\":1}\n");
  const forced = run(["init", "--force=false", "--root", managed], item.env, project);
  assert.equal(forced.status, 1);
  assert.equal(fs.readFileSync(projectConfig, "utf8"), "{\"schemaVersion\":1}\n");
});

test("setup installs durable runtime and owned Claude, Codex, and Grok integrations", (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  const managed = path.join(item.root, "managed");
  const result = run(["setup", "--root", managed, "--agents", "claude,codex,grok", "--json"], item.env);
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.root, fs.realpathSync(managed));
  assert.ok(fs.existsSync(path.join(item.root, "data", "bin", "clean-development")));
  const settings = JSON.parse(fs.readFileSync(path.join(item.claude, "settings.json"), "utf8"));
  assert.equal(settings.hooks.SessionStart.length, 1);
  assert.match(settings.hooks.SessionStart[0].hooks[0].command, /clean-development\.js.*hook session-start/);
  const codex = fs.readFileSync(path.join(item.codex, "config.toml"), "utf8");
  const grok = fs.readFileSync(path.join(item.grok, "config.toml"), "utf8");
  assert.match(codex, /clean-development begin \(codex\)/);
  assert.match(codex, /\[shell_environment_policy\.set\]/);
  assert.match(grok, /clean-development begin \(grok\)/);

  const second = run(["setup", "--root", managed, "--agents", "claude,codex,grok", "--json"], item.env);
  assert.equal(second.status, 0, second.stderr);
  const repeated = JSON.parse(fs.readFileSync(path.join(item.claude, "settings.json"), "utf8"));
  assert.equal(repeated.hooks.SessionStart.length, 1);
  assert.equal((fs.readFileSync(path.join(item.codex, "config.toml"), "utf8").match(/clean-development begin/g) || []).length, 1);
  assert.equal(fs.existsSync(path.join(item.home, ".codex", "config.toml")), false);
  assert.equal(fs.existsSync(path.join(item.home, ".grok", "config.toml")), false);
});

test("explicit agent selection deactivates previously owned native integrations", (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  const managed = path.join(item.root, "managed");
  const first = run(["setup", "--root", managed, "--agents", "claude,codex,grok", "--json"], item.env);
  assert.equal(first.status, 0, first.stderr);
  fs.appendFileSync(path.join(item.codex, "config.toml"), "\nKEEP = \"yes\"\n");

  const second = run(["setup", "--agents", "claude", "--json"], item.env);
  assert.equal(second.status, 0, second.stderr);
  const codex = fs.readFileSync(path.join(item.codex, "config.toml"), "utf8");
  const grok = fs.readFileSync(path.join(item.grok, "config.toml"), "utf8");
  assert.match(codex, /KEEP = "yes"/);
  assert.doesNotMatch(codex, /clean-development begin \(codex\)/);
  assert.doesNotMatch(grok, /clean-development begin \(grok\)/);
  const integrations = JSON.parse(fs.readFileSync(path.join(item.root, "data", "state", "integrations.json"), "utf8"));
  assert.deepEqual(integrations.integrations.map((entry) => entry.agent), ["claude"]);
});

test("update refreshes the runtime while preserving the configured agent selection", (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  const managed = path.join(item.root, "managed");
  const setup = run(["setup", "--root", managed, "--agents", "codex", "--json"], item.env);
  assert.equal(setup.status, 0, setup.stderr);
  const dryRun = run(["update", "--dry-run", "--json"], item.env);
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.equal(JSON.parse(dryRun.stdout).command, "update");
  assert.deepEqual(JSON.parse(dryRun.stdout).agents, ["codex"]);
  const updated = run(["update", "--json"], item.env);
  assert.equal(updated.status, 0, updated.stderr);
  const summary = JSON.parse(updated.stdout);
  assert.equal(summary.command, "update");
  assert.deepEqual(summary.agents, ["codex"]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(item.root, "config", "config.json"), "utf8")).agents[0], "codex");
  assert.equal(fs.existsSync(path.join(item.claude, "settings.json")), false);
  assert.equal(fs.existsSync(path.join(item.codex, "config.toml")), true);
});

test("rerunning setup from an activated session does not grow the persisted PATH", (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  const managed = path.join(item.root, "managed");
  const first = run(["setup", "--root", managed, "--agents", "codex,grok", "--json"], item.env);
  assert.equal(first.status, 0, first.stderr);
  const binDir = JSON.parse(first.stdout).runtime.binDir;
  const activated = { ...item.env, PATH: [binDir, binDir, item.env.PATH].join(path.delimiter) };
  const second = run(["setup", "--root", managed, "--agents", "codex,grok", "--json"], activated);
  assert.equal(second.status, 0, second.stderr);
  for (const home of [item.codex, item.grok]) {
    const contents = fs.readFileSync(path.join(home, "config.toml"), "utf8");
    const pathLine = contents.split("\n").find((line) => line.startsWith("PATH = "));
    assert.ok(pathLine);
    assert.equal((pathLine.match(new RegExp(binDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length, 1);
  }
});

test("npm and npx setup uses stable launchers instead of persisting a transient PATH", (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  const transient = path.join(item.root, ".npm", "_npx", "abc", "node_modules", ".bin");
  fs.mkdirSync(transient, { recursive: true });
  const env = {
    ...item.env,
    npm_execpath: path.join(item.root, "npm-cli.js"),
    npm_command: "exec",
    PATH: [transient, item.env.PATH].join(path.delimiter)
  };
  const result = run(["setup", "--root", path.join(item.root, "managed"), "--agents", "codex,grok", "--json"], env);
  assert.equal(result.status, 0, result.stderr);
  const integrations = JSON.parse(result.stdout).integrations;
  assert.deepEqual(integrations.map((entry) => entry.mode), ["zero-context-launcher", "zero-context-launcher"]);
  assert.equal(integrations.every((entry) => /transient PATH/.test(entry.reason)), true);
  assert.equal(fs.existsSync(path.join(item.codex, "config.toml")), false);
  assert.equal(fs.existsSync(path.join(item.grok, "config.toml")), false);
});

test("direct setup excludes project and temporary package bins from persistent agent PATH", (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  const packageBin = path.join(item.root, "project", "node_modules", ".bin");
  fs.mkdirSync(packageBin, { recursive: true });
  const env = { ...item.env, PATH: [packageBin, os.tmpdir(), "/usr/bin", "/bin"].join(path.delimiter) };
  const result = run(["setup", "--root", path.join(item.root, "managed"), "--agents", "codex", "--json"], env);
  assert.equal(result.status, 0, result.stderr);
  const contents = fs.readFileSync(path.join(item.codex, "config.toml"), "utf8");
  assert.doesNotMatch(contents, /node_modules/);
  const pathLine = contents.split("\n").find((line) => line.startsWith("PATH = "));
  const persisted = JSON.parse(pathLine.slice("PATH = ".length)).split(path.delimiter);
  assert.equal(persisted.slice(1).some((entry) => entry === os.tmpdir() || entry.startsWith(`${os.tmpdir()}${path.sep}`)), false);
  assert.equal(persisted.includes("/usr/bin"), true);
});

test("native agent PATH persistence excludes the current project and active environments", (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  const project = path.join(item.root, "project");
  const projectBin = path.join(project, "bin");
  const virtualEnvironment = path.join(item.root, "python-env");
  const virtualBin = path.join(virtualEnvironment, "bin");
  fs.mkdirSync(projectBin, { recursive: true });
  fs.mkdirSync(virtualBin, { recursive: true });
  const env = {
    ...item.env,
    VIRTUAL_ENV: virtualEnvironment,
    PATH: [projectBin, virtualBin, "/usr/bin", "/bin"].join(path.delimiter)
  };
  const result = run(["setup", "--root", path.join(item.root, "managed"), "--agents", "codex,grok", "--json"], env, project);
  assert.equal(result.status, 0, result.stderr);
  for (const home of [item.codex, item.grok]) {
    const contents = fs.readFileSync(path.join(home, "config.toml"), "utf8");
    assert.doesNotMatch(contents, new RegExp(projectBin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(contents, new RegExp(virtualBin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(contents, /\/usr\/bin/);
  }
});

test("prepare creates effective project storage roots without changing user configuration", (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  const project = path.join(item.root, "project");
  const externalParent = path.join(item.root, "external-builds");
  const root = path.join(item.root, "project-storage");
  const buildRoot = path.join(externalParent, "this-project");
  fs.mkdirSync(project, { recursive: true });
  fs.mkdirSync(externalParent, { recursive: true });
  fs.writeFileSync(path.join(project, ".clean-development.json"), `${JSON.stringify({ schemaVersion: 1, root, buildRoot })}\n`);
  const result = run(["prepare", "--json"], item.env, project);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(root, "caches")), true);
  assert.equal(fs.existsSync(buildRoot), true);
  assert.equal(fs.existsSync(path.join(root, "scratch")), true);
  assert.equal(fs.existsSync(path.join(item.root, "config", "config.json")), false);
});

test("session hook persists only environment exports and emits no output", (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  const managed = path.join(item.root, "managed");
  assert.equal(run(["setup", "--root", managed, "--agents", "claude", "--json"], item.env).status, 0);
  const environmentFile = path.join(item.root, "session.env");
  const hooked = run(["hook", "session-start"], { ...item.env, CLAUDE_ENV_FILE: environmentFile });
  assert.equal(hooked.status, 0, hooked.stderr);
  assert.equal(hooked.stdout, "");
  for (let index = 0; index < 2; index += 1) {
    const repeated = run(["hook", "session-start"], { ...item.env, CLAUDE_ENV_FILE: environmentFile });
    assert.equal(repeated.status, 0, repeated.stderr);
  }
  const contents = fs.readFileSync(environmentFile, "utf8");
  assert.match(contents, /export PATH=/);
  assert.match(contents, /CLEAN_DEVELOPMENT_ACTIVE=/);
  assert.equal((contents.match(/# clean-development begin/g) || []).length, 1);
  assert.doesNotMatch(contents, /CLEAN_DEVELOPMENT_ROOT=/);
  assert.doesNotMatch(contents, /additionalContext|systemMessage|prompt/i);
  if (process.platform !== "win32") {
    const sourced = spawnSync("/bin/sh", ["-c", `. ${JSON.stringify(environmentFile)}; first=$PATH; . ${JSON.stringify(environmentFile)}; test "$PATH" = "$first"`], {
      env: { ...item.env, PATH: process.env.PATH || "/usr/bin:/bin" },
      encoding: "utf8"
    });
    assert.equal(sourced.status, 0, sourced.stderr);
  }
});

test("Claude invalid object shapes are preserved with launcher fallback", (t) => {
  for (const value of [[], { hooks: [] }, { hooks: { SessionStart: {} } }]) {
    const item = fixture();
    t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
    fs.mkdirSync(item.claude, { recursive: true });
    const file = path.join(item.claude, "settings.json");
    const original = `${JSON.stringify(value, null, 2)}\n`;
    fs.writeFileSync(file, original);
    const result = run(["setup", "--root", path.join(item.root, "managed"), "--agents", "claude", "--json"], item.env);
    assert.equal(result.status, 0, result.stderr);
    const integration = JSON.parse(result.stdout).integrations[0];
    assert.equal(integration.mode, "zero-context-launcher");
    assert.equal(fs.readFileSync(file, "utf8"), original);
  }
});

test("Codex explicit PATH policy is preserved and setup falls back to a launcher", (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  const codexDirectory = item.codex;
  fs.mkdirSync(codexDirectory, { recursive: true });
  const original = "model = \"example\"\n\n[shell_environment_policy.set]\nPATH = \"/custom/bin\"\nKEEP = \"yes\"\n";
  fs.writeFileSync(path.join(codexDirectory, "config.toml"), original);
  const result = run(["setup", "--root", path.join(item.root, "managed"), "--agents", "codex", "--json"], item.env);
  assert.equal(result.status, 0, result.stderr);
  const integration = JSON.parse(result.stdout).integrations[0];
  assert.equal(integration.mode, "zero-context-launcher");
  assert.match(integration.reason, /already sets/);
  assert.equal(fs.readFileSync(path.join(codexDirectory, "config.toml"), "utf8"), original);
});

test("Codex quoted or dotted TOML policy keys are preserved with launcher fallback", (t) => {
  const variants = [
    "[shell_environment_policy.set]\n\"PATH\" = \"/custom/bin\"\nKEEP = \"yes\"\n",
    "[\"shell_environment_policy\".\"set\"]\nPATH = \"/custom/bin\"\n"
  ];
  for (const original of variants) {
    const item = fixture();
    t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
    fs.mkdirSync(item.codex, { recursive: true });
    const file = path.join(item.codex, "config.toml");
    fs.writeFileSync(file, original);
    const result = run(["setup", "--root", path.join(item.root, "managed"), "--agents", "codex", "--json"], item.env);
    assert.equal(result.status, 0, result.stderr);
    const integration = JSON.parse(result.stdout).integrations[0];
    assert.equal(integration.mode, "zero-context-launcher");
    assert.equal(fs.readFileSync(file, "utf8"), original);
  }
});

test("a later integration failure leaves earlier edits receipted and uninstallable", (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(item.codex, "config.toml"), { recursive: true });
  const failed = run(["setup", "--root", path.join(item.root, "managed"), "--agents", "claude,codex", "--json"], item.env);
  assert.equal(failed.status, 1);
  const receipt = JSON.parse(fs.readFileSync(path.join(item.root, "data", "state", "integrations.json"), "utf8"));
  assert.equal(receipt.integrations.some((entry) => entry.agent === "claude" && entry.mode === "native-hook"), true);
  const settingsFile = path.join(item.claude, "settings.json");
  assert.equal(JSON.parse(fs.readFileSync(settingsFile, "utf8")).hooks.SessionStart.length, 1);

  const removed = run(["uninstall", "--json"], item.env);
  assert.equal(removed.status, 0, removed.stderr);
  assert.equal(JSON.parse(fs.readFileSync(settingsFile, "utf8")).hooks, undefined);
});

test("uninstall removes owned integration blocks and keeps data", (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  const managed = path.join(item.root, "managed");
  assert.equal(run(["setup", "--root", managed, "--agents", "claude,codex,grok", "--json"], item.env).status, 0);
  fs.writeFileSync(path.join(managed, "keep-me"), "retained");
  const removed = run(["uninstall", "--json"], item.env);
  assert.equal(removed.status, 0, removed.stderr);
  assert.equal(fs.readFileSync(path.join(managed, "keep-me"), "utf8"), "retained");
  assert.doesNotMatch(fs.readFileSync(path.join(item.codex, "config.toml"), "utf8"), /clean-development begin/);
  assert.doesNotMatch(fs.readFileSync(path.join(item.grok, "config.toml"), "utf8"), /clean-development begin/);
  const settings = JSON.parse(fs.readFileSync(path.join(item.claude, "settings.json"), "utf8"));
  assert.equal(settings.hooks, undefined);
  assert.equal(fs.existsSync(path.join(item.root, "data", "bin")), false);
  const staleEnvironmentFile = path.join(item.root, "stale-session.env");
  const staleHook = run(["hook", "session-start"], { ...item.env, CLAUDE_ENV_FILE: staleEnvironmentFile });
  assert.equal(staleHook.status, 0, staleHook.stderr);
  assert.equal(fs.existsSync(staleEnvironmentFile), false);
  const runtime = JSON.parse(fs.readFileSync(path.join(item.root, "data", "state", "runtime.json"), "utf8"));
  assert.equal(runtime.status, "uninstalled");
  assert.equal(fs.existsSync(path.join(item.root, "data", "bin")), false);
});

test("Claude setup and uninstall preserve unrelated hooks in the same SessionStart entry", (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  fs.mkdirSync(item.claude, { recursive: true });
  fs.writeFileSync(path.join(item.claude, "settings.json"), `${JSON.stringify({
    hooks: {
      SessionStart: [{
        matcher: "startup",
        hooks: [
          { type: "command", command: "/old/clean-development hook session-start" },
          { type: "command", command: "/usr/local/bin/keep-this-hook" }
        ]
      }],
      Stop: [{ matcher: "", hooks: [{ type: "command", command: "/usr/local/bin/also-keep" }] }]
    }
  }, null, 2)}\n`);

  const managed = path.join(item.root, "managed");
  const installed = run(["setup", "--root", managed, "--agents", "claude", "--json"], item.env);
  assert.equal(installed.status, 0, installed.stderr);
  let settings = JSON.parse(fs.readFileSync(path.join(item.claude, "settings.json"), "utf8"));
  assert.equal(settings.hooks.SessionStart.length, 2);
  assert.equal(settings.hooks.SessionStart[0].matcher, "startup");
  assert.deepEqual(settings.hooks.SessionStart[0].hooks, [
    { type: "command", command: "/old/clean-development hook session-start" },
    { type: "command", command: "/usr/local/bin/keep-this-hook" }
  ]);
  assert.equal(settings.hooks.Stop[0].hooks[0].command, "/usr/local/bin/also-keep");

  const removed = run(["uninstall", "--json"], item.env);
  assert.equal(removed.status, 0, removed.stderr);
  settings = JSON.parse(fs.readFileSync(path.join(item.claude, "settings.json"), "utf8"));
  assert.deepEqual(settings.hooks.SessionStart, [{
    matcher: "startup",
    hooks: [
      { type: "command", command: "/old/clean-development hook session-start" },
      { type: "command", command: "/usr/local/bin/keep-this-hook" }
    ]
  }]);
  assert.equal(settings.hooks.Stop[0].hooks[0].command, "/usr/local/bin/also-keep");
});

test("Claude setup and uninstall update a settings symlink referent without replacing the link", (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  const shared = path.join(item.root, "shared");
  const referent = path.join(shared, "claude-settings.json");
  const settingsLink = path.join(item.claude, "settings.json");
  fs.mkdirSync(shared, { recursive: true });
  fs.mkdirSync(item.claude, { recursive: true });
  fs.writeFileSync(referent, "{}\n");
  fs.symlinkSync(path.relative(item.claude, referent), settingsLink);

  const managed = path.join(item.root, "managed");
  const installed = run(["setup", "--root", managed, "--agents", "claude", "--json"], item.env);
  assert.equal(installed.status, 0, installed.stderr);
  assert.equal(fs.lstatSync(settingsLink).isSymbolicLink(), true);
  let settings = JSON.parse(fs.readFileSync(referent, "utf8"));
  assert.equal(settings.hooks.SessionStart.length, 1);

  const removed = run(["uninstall", "--json"], item.env);
  assert.equal(removed.status, 0, removed.stderr);
  assert.equal(fs.lstatSync(settingsLink).isSymbolicLink(), true);
  settings = JSON.parse(fs.readFileSync(referent, "utf8"));
  assert.equal(settings.hooks, undefined);
});

test("Codex setup and uninstall atomically follow a config symlink and preserve unrelated content", (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  const shared = path.join(item.root, "shared-codex");
  const referent = path.join(shared, "config.toml");
  const configLink = path.join(item.codex, "config.toml");
  fs.mkdirSync(shared, { recursive: true });
  fs.mkdirSync(item.codex, { recursive: true });
  fs.writeFileSync(referent, "model = \"keep-me\"\n", { mode: 0o640 });
  fs.symlinkSync(path.relative(item.codex, referent), configLink);

  const installed = run(["setup", "--root", path.join(item.root, "managed"), "--agents", "codex", "--json"], item.env);
  assert.equal(installed.status, 0, installed.stderr);
  assert.equal(fs.lstatSync(configLink).isSymbolicLink(), true);
  assert.match(fs.readFileSync(referent, "utf8"), /model = "keep-me"/);
  assert.match(fs.readFileSync(referent, "utf8"), /clean-development begin/);
  assert.equal(fs.statSync(referent).mode & 0o777, 0o640);

  const removed = run(["uninstall", "--json"], item.env);
  assert.equal(removed.status, 0, removed.stderr);
  assert.equal(fs.lstatSync(configLink).isSymbolicLink(), true);
  assert.match(fs.readFileSync(referent, "utf8"), /model = "keep-me"/);
  assert.doesNotMatch(fs.readFileSync(referent, "utf8"), /clean-development begin/);
  assert.equal(fs.statSync(referent).mode & 0o777, 0o640);
});

test("Codex setup and uninstall preserve unrelated TOML whitespace byte for byte", (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  fs.mkdirSync(item.codex, { recursive: true });
  const file = path.join(item.codex, "config.toml");
  const original = "model = \"gpt-5\"\n\n\n\n# unrelated spacing\napproval_policy = \"never\"";
  fs.writeFileSync(file, original);
  const setup = run(["setup", "--root", path.join(item.root, "managed"), "--agents", "codex", "--json"], item.env);
  assert.equal(setup.status, 0, setup.stderr);
  assert.ok(fs.readFileSync(file, "utf8").startsWith(original));
  const removed = run(["uninstall", "--json"], item.env);
  assert.equal(removed.status, 0, removed.stderr);
  assert.equal(fs.readFileSync(file, "utf8"), original);
});

test("uninstall fails visibly when the installation data home changed", (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  const setup = run(["setup", "--root", path.join(item.root, "managed"), "--agents", "claude", "--json"], item.env);
  assert.equal(setup.status, 0, setup.stderr);
  const launcher = path.join(item.root, "data", "bin", process.platform === "win32" ? "clean-development.cmd" : "clean-development");
  const changedData = path.join(item.root, "different-data-home");
  const removed = run(["uninstall", "--json"], { ...item.env, CLEAN_DEVELOPMENT_DATA_HOME: changedData });
  assert.equal(removed.status, 1);
  assert.match(removed.stderr, /No installation receipts.*same data-home settings/s);
  assert.equal(fs.existsSync(changedData), false);
  assert.equal(fs.existsSync(launcher), true);
});

test("uninstall rejects forged integration markers before editing agent files", (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  const setup = run(["setup", "--root", path.join(item.root, "managed"), "--agents", "codex", "--json"], item.env);
  assert.equal(setup.status, 0, setup.stderr);
  const configFile = path.join(item.codex, "config.toml");
  const original = fs.readFileSync(configFile, "utf8");
  const receiptFile = path.join(item.root, "data", "state", "integrations.json");
  const receipt = JSON.parse(fs.readFileSync(receiptFile, "utf8"));
  receipt.integrations[0].beginMarker = "# forged begin";
  receipt.integrations[0].endMarker = "# forged end";
  fs.writeFileSync(receiptFile, `${JSON.stringify(receipt, null, 2)}\n`);
  const removed = run(["uninstall", "--json"], item.env);
  assert.equal(removed.status, 1);
  assert.match(removed.stderr, /Invalid integration receipt/);
  assert.equal(fs.readFileSync(configFile, "utf8"), original);
  assert.equal(fs.existsSync(path.join(item.root, "data", "bin", process.platform === "win32" ? "clean-development.cmd" : "clean-development")), true);
});

test("uninstall rejects an integration receipt redirected to an arbitrary file", (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  const setup = run(["setup", "--root", path.join(item.root, "managed"), "--agents", "codex", "--json"], item.env);
  assert.equal(setup.status, 0, setup.stderr);

  const receiptFile = path.join(item.root, "data", "state", "integrations.json");
  const receipt = JSON.parse(fs.readFileSync(receiptFile, "utf8"));
  const entry = receipt.integrations[0];
  const victim = path.join(item.root, "victim.toml");
  const victimContent = [
    "keep = \"this file\"",
    entry.beginMarker,
    "PATH = \"forged\"",
    entry.endMarker,
    ""
  ].join("\n");
  fs.writeFileSync(victim, victimContent);
  entry.file = victim;
  entry.referent = fs.realpathSync(victim);
  fs.writeFileSync(receiptFile, `${JSON.stringify(receipt, null, 2)}\n`);

  const removed = run(["uninstall", "--json"], item.env);
  assert.equal(removed.status, 1);
  assert.match(removed.stderr, /Invalid integration receipt/);
  assert.equal(fs.readFileSync(victim, "utf8"), victimContent);
  assert.equal(fs.existsSync(path.join(item.root, "data", "bin", process.platform === "win32" ? "clean-development.cmd" : "clean-development")), true);
});

test("uninstall fails visibly when agent config homes changed", (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  const managed = path.join(item.root, "managed");
  const installed = run(["setup", "--root", managed, "--agents", "claude,codex,grok", "--json"], item.env);
  assert.equal(installed.status, 0, installed.stderr);

  const originalClaudeFile = path.join(item.claude, "settings.json");
  const originalClaude = JSON.parse(fs.readFileSync(originalClaudeFile, "utf8"));
  originalClaude.hooks.SessionStart[0].hooks.unshift({
    type: "command",
    command: "/someone-else/clean-development hook session-start"
  });
  fs.writeFileSync(originalClaudeFile, `${JSON.stringify(originalClaude, null, 2)}\n`);
  const originalCodexFile = path.join(item.codex, "config.toml");
  fs.appendFileSync(originalCodexFile, "\n# clean-development begin (codex)\n# unrelated lookalike\n# clean-development end (codex)\n");
  const originalGrokFile = path.join(item.grok, "config.toml");

  const alternateClaude = path.join(item.root, "alternate-claude");
  const alternateCodex = path.join(item.root, "alternate-codex");
  const alternateGrok = path.join(item.root, "alternate-grok");
  fs.mkdirSync(alternateClaude, { recursive: true });
  fs.mkdirSync(alternateCodex, { recursive: true });
  fs.mkdirSync(alternateGrok, { recursive: true });
  const alternateSettings = {
    hooks: {
      SessionStart: [{
        matcher: "startup",
        hooks: [{ type: "command", command: "/alternate/clean-development hook session-start" }]
      }]
    }
  };
  const alternateToml = "# clean-development begin (codex)\n# not ours\n# clean-development end (codex)\n";
  fs.writeFileSync(path.join(alternateClaude, "settings.json"), `${JSON.stringify(alternateSettings, null, 2)}\n`);
  fs.writeFileSync(path.join(alternateCodex, "config.toml"), alternateToml);
  fs.writeFileSync(path.join(alternateGrok, "config.toml"), alternateToml.replaceAll("codex", "grok"));

  const originalClaudeBytes = fs.readFileSync(originalClaudeFile, "utf8");
  const originalCodexBytes = fs.readFileSync(originalCodexFile, "utf8");
  const originalGrokBytes = fs.readFileSync(originalGrokFile, "utf8");
  const alternateClaudeBytes = fs.readFileSync(path.join(alternateClaude, "settings.json"), "utf8");
  const alternateCodexBytes = fs.readFileSync(path.join(alternateCodex, "config.toml"), "utf8");
  const alternateGrokBytes = fs.readFileSync(path.join(alternateGrok, "config.toml"), "utf8");

  const changedEnv = {
    ...item.env,
    CLAUDE_CONFIG_DIR: alternateClaude,
    CODEX_HOME: alternateCodex,
    GROK_HOME: alternateGrok
  };
  const removed = run(["uninstall", "--json"], changedEnv);
  assert.equal(removed.status, 1);
  assert.match(removed.stderr, /Invalid integration receipt/);
  assert.equal(fs.readFileSync(originalClaudeFile, "utf8"), originalClaudeBytes);
  assert.equal(fs.readFileSync(originalCodexFile, "utf8"), originalCodexBytes);
  assert.equal(fs.readFileSync(originalGrokFile, "utf8"), originalGrokBytes);
  assert.equal(fs.readFileSync(path.join(alternateClaude, "settings.json"), "utf8"), alternateClaudeBytes);
  assert.equal(fs.readFileSync(path.join(alternateCodex, "config.toml"), "utf8"), alternateCodexBytes);
  assert.equal(fs.readFileSync(path.join(alternateGrok, "config.toml"), "utf8"), alternateGrokBytes);
  assert.equal(fs.existsSync(path.join(item.root, "data", "bin", process.platform === "win32" ? "clean-development.cmd" : "clean-development")), true);
});

test("Grok integration keeps injected PATH keys before following TOML array tables", (t) => {
  const item = fixture();
  t.after(() => fs.rmSync(item.root, { recursive: true, force: true }));
  fs.mkdirSync(item.grok, { recursive: true });
  const original = [
    "[shell_environment_policy.set]",
    "KEEP = \"yes\"",
    "",
    "[[marketplace.sources]]",
    "name = \"community\"",
    "url = \"https://example.invalid/marketplace.json\"",
    ""
  ].join("\n");
  fs.writeFileSync(path.join(item.grok, "config.toml"), original);

  const result = run(["setup", "--root", path.join(item.root, "managed"), "--agents", "grok", "--json"], item.env);
  assert.equal(result.status, 0, result.stderr);
  const lines = fs.readFileSync(path.join(item.grok, "config.toml"), "utf8").split("\n");
  const arrayIndex = lines.indexOf("[[marketplace.sources]]");
  assert.ok(arrayIndex > 0);
  assert.ok(lines.findIndex((line) => line.startsWith("PATH = ")) < arrayIndex);
  assert.ok(lines.findIndex((line) => line.startsWith("CLEAN_DEVELOPMENT_ACTIVE = ")) < arrayIndex);
  assert.equal(lines.slice(arrayIndex + 1).some((line) => /^(?:PATH|CLEAN_DEVELOPMENT_ACTIVE)\s*=/.test(line)), false);
});
