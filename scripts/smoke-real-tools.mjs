import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isolatedEnvironment } from "./harness-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "bin", "clean-development.js");
const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "clean-development-smoke-")));
const managed = path.join(temporary, "managed");
for (const name of ["caches", "builds", "scratch"]) fs.mkdirSync(path.join(managed, name), { recursive: true });
fs.writeFileSync(path.join(temporary, ".clean-development.json"), '{"schemaVersion":1}\n');
const env = {
  ...isolatedEnvironment(temporary),
  CARGO_NET_OFFLINE: "true",
  GOENV: "off",
  GOWORK: "off",
  GOTOOLCHAIN: "local",
  GOPROXY: "off",
  GOSUMDB: "off"
};

function available(command) {
  return spawnSync("sh", ["-c", `command -v ${command}`], { env, stdio: "ignore" }).status === 0;
}

function runTool(command, args, cwd) {
  const result = spawnSync(process.execPath, [cli, "run", "--", command, ...args], { cwd, env, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command} failed:\n${result.stdout}\n${result.stderr}`);
  return result;
}

function filesBelow(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(file) : entry.isFile() ? [file] : [];
  });
}

function assertManagedArtifact(file, directory) {
  const relative = path.relative(directory, fs.realpathSync(file));
  assert.ok(relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), `Artifact escaped ${directory}: ${file}`);
  assert.ok(fs.statSync(file).size > 0, `Artifact is empty: ${file}`);
}

const results = [];
try {
  if (available("cargo")) {
    const project = path.join(temporary, "rust-smoke");
    fs.mkdirSync(path.join(project, "src"), { recursive: true });
    fs.writeFileSync(path.join(project, "Cargo.toml"), "[package]\nname = \"clean-development-smoke\"\nversion = \"0.0.0\"\nedition = \"2024\"\n");
    fs.writeFileSync(path.join(project, "src", "lib.rs"), "pub fn answer() -> u32 { 42 }\n");
    const result = runTool("cargo", ["check", "--quiet", "--offline", "--message-format=json"], project);
    assert.equal(fs.existsSync(path.join(project, "target")), false);
    const artifacts = result.stdout.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line))
      .filter((entry) => entry.reason === "compiler-artifact").flatMap((entry) => entry.filenames);
    assert.ok(artifacts.length > 0, "Cargo reported no compiler artifacts");
    for (const artifact of artifacts) assertManagedArtifact(artifact, path.join(managed, "builds"));
    results.push("cargo");
  }

  if (available("go")) {
    const project = path.join(temporary, "go-smoke");
    fs.mkdirSync(project, { recursive: true });
    fs.writeFileSync(path.join(project, "go.mod"), "module example.invalid/clean-development-smoke\n\ngo 1.22\n");
    fs.writeFileSync(path.join(project, "main_test.go"), "package smoke\nimport \"testing\"\nfunc TestSmoke(t *testing.T) {}\n");
    runTool("go", ["test", "./..."], project);
    const cache = path.join(managed, "caches", "go", "build");
    const artifacts = filesBelow(cache).filter((file) => /[a-f0-9]{64}-[ad]$/.test(path.basename(file)) && fs.statSync(file).size > 0);
    assert.ok(artifacts.length > 0, "Go produced no managed compiler cache entries");
    for (const artifact of artifacts) assertManagedArtifact(artifact, cache);
    results.push("go");
  }

  if (available("npm")) {
    const project = path.join(temporary, "npm-smoke");
    fs.mkdirSync(project, { recursive: true });
    fs.writeFileSync(path.join(project, "package.json"), JSON.stringify({ name: "clean-development-smoke", version: "0.0.0", private: true, scripts: { check: "node -e \"\"" } }));
    fs.writeFileSync(path.join(project, "index.js"), "module.exports = 42;\n");
    runTool("npm", ["run", "check", "--silent"], project);
    const result = runTool("npm", ["config", "get", "cache"], project);
    const cache = path.join(managed, "caches", "node", "npm");
    assert.equal(fs.realpathSync(result.stdout.trim()), cache);
    const packed = JSON.parse(runTool("npm", ["pack", "--json", "--offline", "--ignore-scripts"], project).stdout)[0];
    runTool("npm", ["cache", "add", path.join(project, packed.filename), "--offline", "--ignore-scripts"], project);
    const artifacts = filesBelow(path.join(cache, "_cacache", "content-v2"));
    assert.ok(artifacts.length > 0, "npm produced no managed package cache content");
    for (const artifact of artifacts) assertManagedArtifact(artifact, cache);
    results.push("npm");
  }

  if (available("uv")) {
    assert.ok(available("python3"), "The uv smoke check requires an installed python3 to create its local wheel");
    const project = path.join(temporary, "uv-smoke");
    fs.mkdirSync(project, { recursive: true });
    const result = runTool("uv", ["cache", "dir", "--no-config"], project);
    const cache = path.join(managed, "caches", "python", "uv");
    assert.equal(fs.realpathSync(result.stdout.trim()), cache);
    const wheel = path.join(project, "clean_development_smoke-0.0.0-py3-none-any.whl");
    const module = "VALUE = 42\n";
    const generated = spawnSync("python3", ["-I", "-c", [
      "import sys, zipfile",
      "with zipfile.ZipFile(sys.argv[1], 'w') as wheel:",
      "    wheel.writestr('clean_development_smoke.py', 'VALUE = 42\\n')",
      "    wheel.writestr('clean_development_smoke-0.0.0.dist-info/METADATA', 'Metadata-Version: 2.1\\nName: clean-development-smoke\\nVersion: 0.0.0\\n')",
      "    wheel.writestr('clean_development_smoke-0.0.0.dist-info/WHEEL', 'Wheel-Version: 1.0\\nGenerator: clean-development-smoke\\nRoot-Is-Purelib: true\\nTag: py3-none-any\\n')",
      "    wheel.writestr('clean_development_smoke-0.0.0.dist-info/RECORD', '')"
    ].join("\n"), wheel], { cwd: project, env, encoding: "utf8" });
    assert.equal(generated.status, 0, generated.stderr || generated.error?.message);
    const installed = path.join(project, "installed");
    runTool("uv", ["pip", "install", "--python", "python3", "--target", installed, "--offline", "--no-index", "--no-deps", "--no-config", "--no-python-downloads", "--no-managed-python", wheel], project);
    assert.equal(fs.readFileSync(path.join(installed, "clean_development_smoke.py"), "utf8"), module);
    const artifacts = filesBelow(cache).filter((file) => path.basename(file) === "clean_development_smoke.py");
    assert.ok(artifacts.length > 0, "uv produced no managed wheel cache content");
    for (const artifact of artifacts) {
      assertManagedArtifact(artifact, cache);
      assert.equal(fs.readFileSync(artifact, "utf8"), module);
    }
    results.push("uv");
  }

  assert.ok(results.length > 0, "No real tools were available; smoke checks did not run");
  console.log(`Real-tool smoke checks passed: ${results.join(", ")}.`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
