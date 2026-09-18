import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { environmentForTool } from "./adapters.js";
import { resolveConfig } from "./config.js";
import { SHIM_TOOLS, SUPPORTED_AGENTS, VERSION } from "./constants.js";
import { acquireDirectoryLockSync, ensureRealDirectory, readJson, writeJsonAtomic } from "./io.js";
import { canonicalizePotentialPath, environmentValue, isPathInside, prependUniquePath, setEnvironmentValue } from "./platform.js";
import { acquireWorkspaceLock, createLease, recordWorkspace, workspaceRecord } from "./state.js";
import { identifyWorkspace } from "./workspace.js";

const RUNTIME_MARKER = ".clean-development-runtime.json";
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export function packageRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function quoteSh(value) {
  return `'${String(value).replaceAll("'", `'\"'\"'`)}'`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function fileHash(file) {
  return sha256(fs.readFileSync(file));
}

function copyRuntime(source, destination, installationId) {
  const temporary = `${destination}.tmp-${process.pid}-${crypto.randomUUID()}`;
  fs.mkdirSync(temporary);
  for (const entry of ["bin", "src", "package.json"]) {
    fs.cpSync(path.join(source, entry), path.join(temporary, entry), { recursive: true });
  }
  writeJsonAtomic(path.join(temporary, RUNTIME_MARKER), {
    schemaVersion: 1,
    owner: "clean-development",
    version: VERSION,
    installationId,
    createdAt: new Date().toISOString()
  });
  try {
    fs.renameSync(temporary, destination);
    return true;
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true });
    if (error.code !== "EEXIST" && error.code !== "ENOTEMPTY") throw error;
    return false;
  }
}

function walkFiles(root) {
  const files = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Refusing symlink in owned runtime: ${target}`);
      if (entry.isDirectory()) pending.push(target);
      else if (entry.isFile()) files.push(target);
      else throw new Error(`Refusing special file in owned runtime: ${target}`);
    }
  }
  return files.sort();
}

function runtimeInventory(source, versionRoot) {
  const records = [];
  for (const entry of ["bin", "src", "package.json"]) {
    const sourcePath = path.join(source, entry);
    const sourceFiles = fs.statSync(sourcePath).isDirectory() ? walkFiles(sourcePath) : [sourcePath];
    for (const file of sourceFiles) {
      const relative = path.relative(source, file);
      const installed = path.join(versionRoot, relative);
      if (!fs.existsSync(installed) || fs.lstatSync(installed).isSymbolicLink() || fileHash(installed) !== fileHash(file)) {
        throw new Error(`Installed runtime does not match package content: ${installed}`);
      }
      records.push({ path: installed, sha256: fileHash(installed) });
    }
  }
  const marker = path.join(versionRoot, RUNTIME_MARKER);
  records.push({ path: marker, sha256: fileHash(marker) });
  return records;
}

function validInventoryRecord(record) {
  return record
    && typeof record.path === "string"
    && path.isAbsolute(record.path)
    && typeof record.sha256 === "string"
    && /^[0-9a-f]{64}$/i.test(record.sha256);
}

function sourceRuntimeRecords(source, versionRoot) {
  const records = [];
  for (const entry of ["bin", "src", "package.json"]) {
    const sourcePath = path.join(source, entry);
    const sourceFiles = fs.statSync(sourcePath).isDirectory() ? walkFiles(sourcePath) : [sourcePath];
    for (const file of sourceFiles) {
      records.push({ path: path.join(versionRoot, path.relative(source, file)), sha256: fileHash(file) });
    }
  }
  return records;
}

function runtimeReceipt(config) {
  const file = path.join(config.locations.stateDir, "runtime.json");
  if (!fs.existsSync(file)) return null;
  ensureRealDirectory(config.locations.stateDir, { label: "State directory" });
  const details = fs.lstatSync(file);
  if (!details.isFile() || details.isSymbolicLink()) throw new Error(`Runtime receipt is not a real file: ${file}`);
  const receipt = readJson(file, null);
  if (
    receipt?.schemaVersion !== 2
    || typeof receipt.version !== "string"
    || !SEMVER.test(receipt.version)
    || !["installed", "uninstalled"].includes(receipt.status)
    || typeof receipt.installationId !== "string"
    || !receipt.installationId
    || typeof receipt.versionRoot !== "string"
    || typeof receipt.binDir !== "string"
    || typeof receipt.node !== "string"
    || !path.isAbsolute(receipt.node)
    || typeof receipt.source !== "string"
    || !path.isAbsolute(receipt.source)
    || typeof receipt.binDirectoryCreated !== "boolean"
    || !Array.isArray(receipt.ownedFiles)
    || !Array.isArray(receipt.runtimeFiles)
    || !receipt.ownedFiles.every(validInventoryRecord)
    || !receipt.runtimeFiles.every(validInventoryRecord)
  ) throw new Error(`Invalid runtime receipt: ${file}`);

  const versionRoot = path.resolve(config.locations.runtimeDir, receipt.version);
  if (
    !isPathInside(config.locations.runtimeDir, versionRoot)
    || path.resolve(receipt.versionRoot) !== versionRoot
    || path.resolve(receipt.binDir) !== path.resolve(config.locations.binDir)
  ) {
    throw new Error(`Runtime receipt paths do not match this installation: ${file}`);
  }
  const ownedPaths = receipt.ownedFiles.map((entry) => path.resolve(entry.path));
  const runtimePaths = receipt.runtimeFiles.map((entry) => path.resolve(entry.path));
  if (new Set(ownedPaths).size !== ownedPaths.length || new Set(runtimePaths).size !== runtimePaths.length) {
    throw new Error(`Runtime receipt contains duplicate inventory entries: ${file}`);
  }
  const allowedLaunchers = new Set(launcherSpecifications(versionRoot, config.locations.binDir).specifications.map((entry) => path.resolve(entry.path)));
  if (ownedPaths.some((entry) => !allowedLaunchers.has(entry))) {
    throw new Error(`Runtime receipt contains an unknown launcher path: ${file}`);
  }
  const markerPath = path.join(versionRoot, RUNTIME_MARKER);
  if (!runtimePaths.includes(markerPath) || runtimePaths.some((entry) => entry !== markerPath && !isPathInside(versionRoot, entry))) {
    throw new Error(`Runtime receipt contains an unsafe runtime inventory: ${file}`);
  }

  if (receipt.version === VERSION) {
    const expectedLaunchers = launcherSpecifications(versionRoot, config.locations.binDir).specifications;
    const expectedLauncherMap = new Map(expectedLaunchers.map((entry) => [path.resolve(entry.path), entry.sha256]));
    if (receipt.ownedFiles.length !== expectedLauncherMap.size || receipt.ownedFiles.some((entry) => expectedLauncherMap.get(path.resolve(entry.path)) !== entry.sha256)) {
      throw new Error(`Runtime receipt launcher inventory does not match ${VERSION}: ${file}`);
    }
    const expectedRuntime = sourceRuntimeRecords(packageRoot(), versionRoot);
    const expectedRuntimeMap = new Map(expectedRuntime.map((entry) => [path.resolve(entry.path), entry.sha256]));
    const nonMarker = receipt.runtimeFiles.filter((entry) => path.resolve(entry.path) !== markerPath);
    if (nonMarker.length !== expectedRuntimeMap.size || nonMarker.some((entry) => expectedRuntimeMap.get(path.resolve(entry.path)) !== entry.sha256)) {
      throw new Error(`Runtime receipt file inventory does not match ${VERSION}: ${file}`);
    }
  }
  return receipt;
}

function validateRuntimeRoot(versionRoot, installationId = null, expectedVersion = VERSION) {
  if (!fs.existsSync(versionRoot)) throw new Error(`Runtime is missing: ${versionRoot}`);
  const stat = fs.lstatSync(versionRoot);
  if (!stat.isDirectory() || stat.isSymbolicLink() || fs.realpathSync.native(versionRoot) !== path.resolve(versionRoot)) {
    throw new Error(`Runtime is not a real directory: ${versionRoot}`);
  }
  const markerFile = path.join(versionRoot, RUNTIME_MARKER);
  if (!fs.existsSync(markerFile) || fs.lstatSync(markerFile).isSymbolicLink()) throw new Error(`Refusing unowned runtime directory: ${versionRoot}`);
  const marker = readJson(markerFile, null);
  if (marker?.owner !== "clean-development" || marker?.version !== expectedVersion || !marker?.installationId) {
    throw new Error(`Refusing unowned runtime directory: ${versionRoot}`);
  }
  if (installationId && marker.installationId !== installationId) throw new Error(`Runtime ownership receipt does not match: ${versionRoot}`);
  return marker;
}

function archiveRuntimeReceipt(config, receipt) {
  if (!receipt?.version || !receipt?.installationId || receipt.version === VERSION) return null;
  const safeVersion = String(receipt.version).replace(/[^A-Za-z0-9._-]/g, "-");
  const safeId = String(receipt.installationId).replace(/[^A-Za-z0-9._-]/g, "-");
  const directory = path.join(config.locations.stateDir, "runtime-receipts");
  ensureRealDirectory(directory, { create: true, label: "Runtime receipt directory" });
  const file = path.join(directory, `${safeVersion}-${safeId}.json`);
  writeJsonAtomic(file, receipt);
  return file;
}

function archivedReceiptName(receipt) {
  const safeVersion = String(receipt.version).replace(/[^A-Za-z0-9._-]/g, "-");
  const safeId = String(receipt.installationId).replace(/[^A-Za-z0-9._-]/g, "-");
  return `${safeVersion}-${safeId}.json`;
}

function readArchivedRuntimeReceipt(file) {
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) return null;
  const receipt = readJson(file, null);
  const validFiles = Array.isArray(receipt?.runtimeFiles) && receipt.runtimeFiles.every((entry) => (
    entry
    && typeof entry.path === "string"
    && path.isAbsolute(entry.path)
    && typeof entry.sha256 === "string"
    && /^[0-9a-f]{64}$/i.test(entry.sha256)
  ));
  if (
    receipt?.schemaVersion !== 2
    || typeof receipt.version !== "string"
    || !receipt.version
    || typeof receipt.installationId !== "string"
    || !receipt.installationId
    || typeof receipt.versionRoot !== "string"
    || !path.isAbsolute(receipt.versionRoot)
    || !validFiles
    || path.basename(file) !== archivedReceiptName(receipt)
  ) return null;
  return receipt;
}

function runtimeReceiptDirectory(config, { create = false } = {}) {
  const directory = path.join(config.locations.stateDir, "runtime-receipts");
  return ensureRealDirectory(directory, { create, label: "Runtime receipt directory" }) ? directory : null;
}

function verifyInventory(records, versionRoot) {
  for (const record of records) {
    const file = path.resolve(record.path);
    if (!isPathInside(versionRoot, file) || !fs.existsSync(file)) throw new Error(`Owned runtime file is missing or unsafe: ${file}`);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || fileHash(file) !== record.sha256) {
      throw new Error(`Owned runtime file was modified: ${file}`);
    }
  }
}

function writeExecutable(file, contents) {
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomUUID()}`;
  fs.writeFileSync(temporary, contents, { mode: 0o755 });
  fs.chmodSync(temporary, 0o755);
  fs.renameSync(temporary, file);
}

function launcherSpecifications(versionRoot, binDir) {
  const cli = path.join(versionRoot, "bin", "clean-development.js");
  const shim = path.join(versionRoot, "bin", "clean-development-shim.js");
  const specifications = [];
  const add = (name, contents) => specifications.push({ path: path.join(binDir, name), contents, sha256: sha256(contents) });
  if (process.platform === "win32") {
    add("clean-development.cmd", `@echo off\r\n"${process.execPath}" "${cli}" %*\r\n`);
    for (const tool of SHIM_TOOLS) add(`${tool}.cmd`, `@echo off\r\n"${process.execPath}" "${shim}" ${tool} %*\r\n`);
  } else {
    add("clean-development", `#!/bin/sh\nexec ${quoteSh(process.execPath)} ${quoteSh(cli)} "$@"\n`);
    for (const tool of SHIM_TOOLS) {
      add(tool, `#!/bin/sh\nexec ${quoteSh(process.execPath)} ${quoteSh(shim)} ${quoteSh(tool)} "$@"\n`);
    }
  }
  for (const agent of Object.keys(SUPPORTED_AGENTS)) {
    const filename = process.platform === "win32" ? `clean-development-${agent}.cmd` : `clean-development-${agent}`;
    if (process.platform === "win32") add(filename, `@echo off\r\n"${process.execPath}" "${cli}" agent ${agent} -- %*\r\n`);
    else add(filename, `#!/bin/sh\nexec ${quoteSh(process.execPath)} ${quoteSh(cli)} agent ${quoteSh(agent)} -- "$@"\n`);
  }
  return { cli, specifications };
}

function ensureRuntimeUnlocked(config, { automatic = false } = {}) {
  const receiptFile = path.join(config.locations.stateDir, "runtime.json");
  const previous = runtimeReceipt(config);
  if (automatic && previous?.status !== "installed") return null;
  archiveRuntimeReceipt(config, previous);
  const versionRoot = path.join(config.locations.runtimeDir, VERSION);
  let installationId = previous?.version === VERSION ? previous.installationId : null;
  ensureRealDirectory(config.locations.runtimeDir, { create: true, label: "Runtime directory" });
  if (!fs.existsSync(versionRoot)) {
    installationId = crypto.randomUUID();
    if (!copyRuntime(packageRoot(), versionRoot, installationId)) installationId = null;
  }
  const marker = validateRuntimeRoot(versionRoot, installationId);
  installationId = marker.installationId;
  const runtimeFiles = previous?.installationId === installationId && Array.isArray(previous.runtimeFiles)
    ? previous.runtimeFiles
    : runtimeInventory(packageRoot(), versionRoot);
  verifyInventory(runtimeFiles, versionRoot);
  const binExisted = fs.existsSync(config.locations.binDir);
  ensureRealDirectory(config.locations.binDir, { create: true, label: "Runtime bin directory" });
  const { cli, specifications } = launcherSpecifications(versionRoot, config.locations.binDir);
  const previousFiles = new Map((previous?.ownedFiles || []).map((entry) => [path.resolve(entry.path), entry.sha256]));
  for (const specification of specifications) {
    if (!fs.existsSync(specification.path)) continue;
    const stat = fs.lstatSync(specification.path);
    const priorHash = previousFiles.get(path.resolve(specification.path));
    if (!stat.isFile() || stat.isSymbolicLink() || !priorHash || fileHash(specification.path) !== priorHash) {
      throw new Error(`Refusing to overwrite unowned or modified runtime file: ${specification.path}`);
    }
  }
  for (const specification of specifications) {
    if (fs.existsSync(specification.path) && fileHash(specification.path) === specification.sha256) {
      fs.chmodSync(specification.path, 0o755);
      continue;
    }
    writeExecutable(specification.path, specification.contents);
  }
  const ownedFiles = specifications.map(({ path: file, sha256: digest }) => ({ path: file, sha256: digest }));
  writeJsonAtomic(receiptFile, {
    schemaVersion: 2,
    version: VERSION,
    status: "installed",
    installationId,
    node: process.execPath,
    source: packageRoot(),
    versionRoot,
    binDir: config.locations.binDir,
    binDirectoryCreated: previous?.binDirectoryCreated === true || !binExisted,
    ownedFiles,
    runtimeFiles,
    installedAt: new Date().toISOString()
  });
  return { versionRoot, binDir: config.locations.binDir, cli };
}

export function ensureRuntime(config, options = {}) {
  if (options.automatic) {
    const receiptFile = path.join(config.locations.stateDir, "runtime.json");
    if (!fs.existsSync(receiptFile)) return null;
    if (runtimeReceipt(config)?.status !== "installed") return null;
  }
  const releaseLock = acquireDirectoryLockSync(path.join(config.locations.stateDir, "runtime.lock"));
  try {
    return ensureRuntimeUnlocked(config, options);
  } finally {
    releaseLock();
  }
}

function removeMatchingFile(record, allowedParent, removed, retained) {
  const file = path.resolve(record.path);
  if (!isPathInside(allowedParent, file) || !fs.existsSync(file)) return;
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || fileHash(file) !== record.sha256) {
    retained.push(file);
    return;
  }
  fs.unlinkSync(file);
  removed.push(file);
}

function removeEmptyOwnedDirectories(root, records) {
  const directories = new Set(records.map((record) => path.dirname(path.resolve(record.path))));
  directories.add(path.resolve(root));
  for (const directory of [...directories].sort((left, right) => right.length - left.length)) {
    if (directory !== path.resolve(root) && !isPathInside(root, directory)) continue;
    try {
      fs.rmdirSync(directory);
    } catch (error) {
      if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error.code)) throw error;
    }
  }
}

export function runtimeRemovalPlan(config) {
  const current = runtimeReceipt(config);
  const files = [];
  if (current) files.push(...(current.ownedFiles || []).map((entry) => entry.path), ...(current.runtimeFiles || []).map((entry) => entry.path));
  const archivedReceipts = [];
  const archiveDirectory = runtimeReceiptDirectory(config);
  let names = [];
  if (archiveDirectory) {
    try {
      names = fs.readdirSync(archiveDirectory).filter((name) => name.endsWith(".json"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  for (const name of names) {
    const archiveFile = path.join(archiveDirectory, name);
    const receipt = readArchivedRuntimeReceipt(archiveFile);
    if (!receipt) continue;
    files.push(...(receipt.runtimeFiles || []).map((entry) => entry.path));
    archivedReceipts.push(archiveFile);
  }
  return {
    files: [...new Set(files)],
    archivedReceipts,
    retained: [config.root, config.locations.configPath, config.locations.stateDir]
  };
}

function removeRuntimeUnlocked(config) {
  const receiptFile = path.join(config.locations.stateDir, "runtime.json");
  const receipt = runtimeReceipt(config);
  const result = { removed: [], retained: [] };
  if (!receipt) return result;
  if (fs.existsSync(config.locations.binDir)) {
    ensureRealDirectory(config.locations.binDir, { label: "Runtime bin directory" });
  }
  if (fs.existsSync(config.locations.runtimeDir)) {
    ensureRealDirectory(config.locations.runtimeDir, { label: "Runtime directory" });
  }
  for (const record of receipt.ownedFiles || []) removeMatchingFile(record, config.locations.binDir, result.removed, result.retained);
  if (receipt.binDirectoryCreated) {
    try {
      fs.rmdirSync(config.locations.binDir);
    } catch (error) {
      if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error.code)) throw error;
    }
  }
  removeVersionedRuntime(config, receipt, result);
  const archiveDirectory = runtimeReceiptDirectory(config);
  let archiveNames = [];
  if (archiveDirectory) {
    try {
      archiveNames = fs.readdirSync(archiveDirectory).filter((name) => name.endsWith(".json"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  for (const name of archiveNames) {
    const archiveFile = path.join(archiveDirectory, name);
    const archived = readArchivedRuntimeReceipt(archiveFile);
    if (!archived) continue;
    if (removeVersionedRuntime(config, archived, result)) fs.unlinkSync(archiveFile);
  }
  if (archiveDirectory) {
    try {
      fs.rmdirSync(archiveDirectory);
    } catch (error) {
      if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error.code)) throw error;
    }
  }
  writeJsonAtomic(receiptFile, { ...receipt, status: "uninstalled", removedAt: new Date().toISOString(), retainedFiles: result.retained });
  return result;
}

export function removeRuntime(config) {
  const releaseLock = acquireDirectoryLockSync(path.join(config.locations.stateDir, "runtime.lock"));
  try {
    return removeRuntimeUnlocked(config);
  } finally {
    releaseLock();
  }
}

function removeVersionedRuntime(config, receipt, result) {
  const versionRoot = path.resolve(receipt.versionRoot || path.join(config.locations.runtimeDir, receipt.version || VERSION));
  if (!isPathInside(config.locations.runtimeDir, versionRoot)) {
    result.retained.push(`${versionRoot} (unsafe path)`);
    return false;
  }
  if (!fs.existsSync(versionRoot)) return true;
  try {
    validateRuntimeRoot(versionRoot, receipt.installationId, receipt.version || VERSION);
    const runtimeFiles = [...(receipt.runtimeFiles || [])].sort((left, right) => right.path.length - left.path.length);
    for (const record of runtimeFiles) removeMatchingFile(record, versionRoot, result.removed, result.retained);
    removeEmptyOwnedDirectories(versionRoot, runtimeFiles);
    return !fs.existsSync(versionRoot);
  } catch (error) {
    if (error.code !== "ENOENT") result.retained.push(`${versionRoot} (${error.message})`);
    return error.code === "ENOENT";
  }
}

function candidateNames(executable, env) {
  if (process.platform !== "win32") return [executable];
  const extension = path.extname(executable);
  if (extension) return [executable];
  const pathExt = (environmentValue(env, "PATHEXT") || ".EXE;.CMD;.BAT;.COM").split(";");
  return [executable, ...pathExt.map((item) => `${executable}${item.toLowerCase()}`), ...pathExt.map((item) => `${executable}${item.toUpperCase()}`)];
}

function sameFile(left, right) {
  try {
    const a = fs.statSync(left);
    const b = fs.statSync(right);
    return a.dev === b.dev && a.ino === b.ino;
  } catch {
    return false;
  }
}

function isGeneratedShim(file) {
  try {
    const contents = fs.readFileSync(file, "utf8").slice(0, 4096);
    return contents.includes("clean-development-shim.js")
      || (contents.includes("import { runTool }") && contents.includes("import { resolveConfig }"));
  } catch {
    return false;
  }
}

export function resolveExecutable(executable, env, excludedDirectory) {
  if (executable.includes(path.sep) || (path.sep === "\\" && executable.includes("/"))) return path.resolve(executable);
  const excluded = excludedDirectory ? canonicalizePotentialPath(excludedDirectory) : null;
  const directories = (environmentValue(env, "PATH") || "").split(path.delimiter).filter(Boolean);
  for (const directory of directories) {
    if (excluded && canonicalizePotentialPath(directory) === excluded) continue;
    for (const name of candidateNames(executable, env)) {
      const candidate = path.join(directory, name);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        if (excluded && isPathInside(excluded, candidate)) continue;
        if (excluded && sameFile(candidate, path.join(excluded, name))) continue;
        if (isGeneratedShim(candidate)) continue;
        return candidate;
      } catch {
        // Keep searching PATH.
      }
    }
  }
  return null;
}

export function spawnInherited(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd || process.cwd(), env: options.env || process.env, stdio: "inherit", windowsHide: false });
    try {
      options.onSpawn?.(child);
    } catch (error) {
      child.once("error", () => {});
      try {
        child.kill();
      } catch {
        // The child may not have reached a running state.
      }
      reject(error);
      return;
    }
    const forward = (signal) => {
      try {
        child.kill(signal);
      } catch {
        // The process may have exited between signal receipt and forwarding.
      }
    };
    process.once("SIGINT", forward);
    process.once("SIGTERM", forward);
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      process.removeListener("SIGINT", forward);
      process.removeListener("SIGTERM", forward);
      const signalNumber = signal ? os.constants.signals[signal] : null;
      resolve(signal ? 128 + (signalNumber || 1) : (code ?? 1));
    });
  });
}

export async function runTool(tool, args, { config, cwd = process.cwd(), env = process.env } = {}) {
  const workspace = identifyWorkspace(tool, args, cwd);
  const effectiveConfig = workspace.effectiveCwd === path.resolve(cwd)
    ? config
    : resolveConfig({ cwd: workspace.effectiveCwd, env });
  const executable = resolveExecutable(tool, env, effectiveConfig.locations.binDir);
  if (!executable) throw new Error(`Cannot find the real '${tool}' executable outside ${effectiveConfig.locations.binDir}`);
  const releaseWorkspaceLock = tool === "cargo"
    ? await acquireWorkspaceLock(effectiveConfig, workspace.id, effectiveConfig.buildRoot)
    : () => {};
  let lease = null;
  let execution = null;
  let routed;
  try {
    const existingBuildRecord = tool === "cargo"
      ? workspaceRecord(effectiveConfig, workspace.id, effectiveConfig.buildRoot).value
      : null;
    routed = environmentForTool(tool, args, { config: effectiveConfig, cwd, env, create: true, existingBuildRecord });
    if (routed.ownedBuild) {
      recordWorkspace(effectiveConfig, routed.workspace, routed.ownedBuild);
    }
    if (tool === "cargo") {
      lease = createLease(effectiveConfig, routed.workspace, tool);
      execution = spawnInherited(executable, args, {
        cwd,
        env: routed.env,
        onSpawn: (child) => lease.updatePid(child.pid)
      });
    }
  } finally {
    releaseWorkspaceLock();
  }
  execution ||= spawnInherited(executable, args, { cwd, env: routed.env });
  try {
    return await execution;
  } finally {
    lease?.release();
  }
}

export async function runWithShims(command, args, { config, cwd = process.cwd(), env = process.env } = {}) {
  const runtime = ensureRuntime(config);
  const childEnv = { ...env, CLEAN_DEVELOPMENT_ACTIVE: "1" };
  setEnvironmentValue(childEnv, "PATH", prependUniquePath(environmentValue(childEnv, "PATH"), runtime.binDir));
  if (SHIM_TOOLS.includes(command)) return runTool(command, args, { config, cwd, env: childEnv });
  const executable = resolveExecutable(command, childEnv, runtime.binDir);
  if (!executable) throw new Error(`Cannot find executable: ${command}`);
  return spawnInherited(executable, args, { cwd, env: childEnv });
}
