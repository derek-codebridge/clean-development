import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "bin", "clean-development.js");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "clean-development-smoke-"));
const managed = path.join(temporary, "managed");
for (const name of ["caches", "builds", "scratch"]) fs.mkdirSync(path.join(managed, name), { recursive: true });
const env = {
  ...process.env,
  CLEAN_DEVELOPMENT_HOME: path.join(temporary, "home"),
  CLEAN_DEVELOPMENT_DATA_HOME: path.join(temporary, "data"),
  CLEAN_DEVELOPMENT_CONFIG_HOME: path.join(temporary, "config"),
  CLEAN_DEVELOPMENT_ROOT: managed
};

function available(command) {
  return spawnSync("sh", ["-c", `command -v ${command}`], { env, stdio: "ignore" }).status === 0;
}

function runTool(command, args, cwd) {
  const result = spawnSync(process.execPath, [cli, "run", "--", command, ...args], { cwd, env, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command} failed:\n${result.stdout}\n${result.stderr}`);
  return result;
}

const results = [];
try {
  if (available("cargo")) {
    const project = path.join(temporary, "rust-smoke");
    fs.mkdirSync(path.join(project, "src"), { recursive: true });
    fs.writeFileSync(path.join(project, "Cargo.toml"), "[package]\nname = \"clean-development-smoke\"\nversion = \"0.0.0\"\nedition = \"2024\"\n");
    fs.writeFileSync(path.join(project, "src", "main.rs"), "fn main() {}\n");
    runTool("cargo", ["check", "--quiet"], project);
    assert.equal(fs.existsSync(path.join(project, "target")), false);
    assert.ok(fs.existsSync(path.join(managed, "builds")));
    results.push("cargo");
  }

  if (available("go")) {
    const project = path.join(temporary, "go-smoke");
    fs.mkdirSync(project, { recursive: true });
    fs.writeFileSync(path.join(project, "go.mod"), "module example.invalid/clean-development-smoke\n\ngo 1.22\n");
    fs.writeFileSync(path.join(project, "main_test.go"), "package smoke\nimport \"testing\"\nfunc TestSmoke(t *testing.T) {}\n");
    runTool("go", ["test", "./..."], project);
    assert.ok(fs.existsSync(path.join(managed, "caches", "go", "build")));
    results.push("go");
  }

  if (available("npm")) {
    const project = path.join(temporary, "npm-smoke");
    fs.mkdirSync(project, { recursive: true });
    fs.writeFileSync(path.join(project, "package.json"), JSON.stringify({ name: "clean-development-smoke", private: true, scripts: { check: "node -e \"\"" } }));
    runTool("npm", ["run", "check", "--silent"], project);
    const result = runTool("npm", ["config", "get", "cache"], project);
    assert.match(result.stdout, /managed[/\\]caches[/\\]node[/\\]npm/);
    results.push("npm");
  }

  if (available("uv")) {
    const project = path.join(temporary, "uv-smoke");
    fs.mkdirSync(project, { recursive: true });
    const result = runTool("uv", ["cache", "dir"], project);
    assert.match(result.stdout, /managed[/\\]caches[/\\]python[/\\]uv/);
    results.push("uv");
  }

  console.log(`Real-tool smoke checks passed: ${results.length ? results.join(", ") : "none available"}.`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
