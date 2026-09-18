import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const MANIFESTS = {
  cargo: ["Cargo.toml"],
  go: ["go.work", "go.mod"],
  npm: ["package.json"],
  npx: ["package.json"],
  pnpm: ["pnpm-workspace.yaml", "package.json"],
  yarn: ["package.json"],
  bun: ["package.json"],
  uv: ["pyproject.toml", "uv.lock"],
  pip: ["pyproject.toml", "requirements.txt", "setup.py"],
  pip3: ["pyproject.toml", "requirements.txt", "setup.py"],
  dotnet: ["global.json", "*.sln", "*.csproj"],
  composer: ["composer.json"]
};

function argumentValue(args, names) {
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--") break;
    for (const name of names) {
      if (argument === name && args[index + 1]) return args[index + 1];
      if (argument.startsWith(`${name}=`)) return argument.slice(name.length + 1);
    }
  }
  return null;
}

function commandCwd(tool, args, cwd) {
  if (tool === "cargo") {
    const manifest = argumentValue(args, ["--manifest-path"]);
    if (manifest) return path.dirname(path.resolve(cwd, manifest));
  }
  if (tool === "go") {
    const changed = argumentValue(args, ["-C"]);
    if (changed) return path.resolve(cwd, changed);
  }
  if (["npm", "npx", "pnpm", "yarn"].includes(tool)) {
    const prefix = argumentValue(args, ["--prefix", "--dir", "-C"]);
    if (prefix) return path.resolve(cwd, prefix);
  }
  return path.resolve(cwd);
}

function hasManifest(directory, patterns) {
  let names;
  try {
    names = fs.readdirSync(directory);
  } catch {
    return false;
  }
  return patterns.some((pattern) => {
    if (!pattern.startsWith("*.")) return names.includes(pattern);
    return names.some((name) => name.endsWith(pattern.slice(1)));
  });
}

function findRoot(start, patterns) {
  let current = path.resolve(start);
  let gitFallback = null;
  while (true) {
    if (patterns && hasManifest(current, patterns)) return current;
    if (!gitFallback && (fs.existsSync(path.join(current, ".git")))) gitFallback = current;
    const parent = path.dirname(current);
    if (parent === current) return gitFallback || path.resolve(start);
    current = parent;
  }
}

function isCargoWorkspaceManifest(file) {
  try {
    return /^\s*\[workspace\]\s*(?:#.*)?$/m.test(fs.readFileSync(file, "utf8"));
  } catch {
    return false;
  }
}

function findCargoRoot(start) {
  let current = path.resolve(start);
  let nearestManifest = null;
  let gitFallback = null;
  while (true) {
    const manifest = path.join(current, "Cargo.toml");
    if (fs.existsSync(manifest)) {
      nearestManifest ||= current;
      if (isCargoWorkspaceManifest(manifest)) return current;
    }
    if (!gitFallback && fs.existsSync(path.join(current, ".git"))) gitFallback = current;
    const parent = path.dirname(current);
    if (parent === current) return nearestManifest || gitFallback || path.resolve(start);
    current = parent;
  }
}

function safeRealpath(value) {
  try {
    return fs.realpathSync.native(value);
  } catch {
    return path.resolve(value);
  }
}

function slug(value) {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return cleaned || "workspace";
}

export function identifyWorkspace(tool, args = [], cwd = process.cwd()) {
  const effectiveCwd = commandCwd(tool, args, cwd);
  const root = safeRealpath(tool === "cargo" ? findCargoRoot(effectiveCwd) : findRoot(effectiveCwd, MANIFESTS[tool]));
  const digest = crypto.createHash("sha256").update(root).digest("hex").slice(0, 10);
  const id = `${slug(path.basename(root))}-${digest}`;
  return { id, root, effectiveCwd };
}
