import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "clean-development-package-"));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  return result;
}

try {
  const packed = JSON.parse(run("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", temporary]).stdout)[0];
  const tarball = path.join(temporary, packed.filename);
  const names = new Set(packed.files.map((entry) => entry.path));
  for (const required of [
    ".agents/plugins/marketplace.json",
    ".claude-plugin/marketplace.json",
    ".claude-plugin/plugin.json",
    ".codex-plugin/plugin.json",
    ".cursor-plugin/plugin.json",
    ".devin-plugin/plugin.json",
    ".grok-plugin/marketplace.json",
    ".grok-plugin/plugin.json",
    ".hermes-plugin/plugin.yaml",
    ".kimi-plugin/plugin.json",
    ".opencode/plugins/clean-development.js",
    ".pi/extensions/clean-development.ts",
    "bin/clean-development.js",
    "claude-skills/clean-development/SKILL.md",
    "docs/agent-integrations.md",
    "docs/architecture.md",
    "docs/configuration.md",
    "docs/master-plan.md",
    "docs/safety-model.md",
    "docs/verification.md",
    "gemini-extension.json",
    "hooks/session-start",
    "integrations/claude/hooks.json",
    "src/cli.js",
    "plugin.json",
    "skills/clean-development/SKILL.md",
    "CHANGELOG.md",
    "CODE_OF_CONDUCT.md",
    "CONTRIBUTING.md",
    "GOVERNANCE.md",
    "LICENSE",
    "README.md",
    "RELEASING.md",
    "ROADMAP.md",
    "SECURITY.md",
    "SUPPORT.md"
  ]) {
    assert.ok(names.has(required), `tarball is missing ${required}`);
  }
  const prefix = path.join(temporary, "prefix");
  run("npm", ["install", "--prefix", prefix, "--ignore-scripts", "--no-audit", "--no-fund", tarball]);
  const binary = path.join(prefix, "node_modules", ".bin", process.platform === "win32" ? "clean-development.cmd" : "clean-development");
  const version = run(binary, ["--version"], { cwd: temporary }).stdout.trim();
  assert.equal(version, packageJson.version);
  const contract = run(process.execPath, ["--input-type=module", "--eval", [
    "const plugin = await import('clean-development');",
    "const api = await import('clean-development/api');",
    "if (typeof plugin.default !== 'function' || typeof api.resolveConfig !== 'function') process.exit(9);"
  ].join("\n")], { cwd: prefix });
  assert.equal(contract.status, 0);
  console.log(`Verified ${packed.filename} (${packed.files.length} files, ${packed.size} bytes).`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
