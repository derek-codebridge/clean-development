import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { SUPPORTED_AGENTS } from "./constants.js";
import { ensureRealDirectory, readJson, writeJsonAtomic, writeJsonAtomicFollowingLeafSymlink, writeTextAtomicFollowingLeafSymlink } from "./io.js";
import { canonicalizePotentialPath, environmentValue, isPathInside, prependUniquePath } from "./platform.js";

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\"'\"'`)}'`;
}

function claudeSettingsPath(config, env = process.env) {
  return env.CLAUDE_CONFIG_DIR
    ? path.join(path.resolve(env.CLAUDE_CONFIG_DIR), "settings.json")
    : path.join(config.locations.home, ".claude", "settings.json");
}

function agentConfigPath(config, env, agent) {
  const override = agent === "codex" ? env.CODEX_HOME : env.GROK_HOME;
  return path.join(override ? path.resolve(override) : path.join(config.locations.home, `.${agent}`), "config.toml");
}

function hookCommand(runtime, ownershipId) {
  if (process.platform === "win32") return `\"${process.execPath}\" \"${runtime.cli}\" hook session-start --owner \"${ownershipId}\"`;
  return `${shellQuote(process.execPath)} ${shellQuote(runtime.cli)} hook session-start --owner ${shellQuote(ownershipId)}`;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validOwnershipId(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function validateIntegrationEntry(config, entry, env, enforcePaths) {
  if (!isObject(entry) || !Object.hasOwn(SUPPORTED_AGENTS, entry.agent) || typeof entry.mode !== "string") return false;
  if (entry.mode === "zero-context-launcher") {
    const expected = path.join(config.locations.binDir, `clean-development-${entry.agent}${process.platform === "win32" ? ".cmd" : ""}`);
    return typeof entry.command === "string" && path.resolve(entry.command) === expected;
  }
  if (entry.mode === "native-hook") {
    const expectedFile = claudeSettingsPath(config, env);
    return entry.agent === "claude"
      && validOwnershipId(entry.ownershipId)
      && typeof entry.file === "string"
      && path.isAbsolute(entry.file)
      && (!enforcePaths || path.resolve(entry.file) === path.resolve(expectedFile))
      && typeof entry.referent === "string"
      && path.isAbsolute(entry.referent)
      && typeof entry.command === "string"
      && entry.command.includes(`${path.sep}bin${path.sep}clean-development.js`)
      && entry.command.includes(config.locations.runtimeDir)
      && entry.command.includes(" hook session-start --owner ")
      && entry.command.includes(entry.ownershipId);
  }
  if (entry.mode === "native-shell-environment") {
    const expectedFile = ["codex", "grok"].includes(entry.agent) ? agentConfigPath(config, env, entry.agent) : null;
    if (
      !["codex", "grok"].includes(entry.agent)
      || !validOwnershipId(entry.ownershipId)
      || typeof entry.file !== "string"
      || !path.isAbsolute(entry.file)
      || (enforcePaths && path.resolve(entry.file) !== path.resolve(expectedFile))
      || typeof entry.referent !== "string"
      || !path.isAbsolute(entry.referent)
      || entry.ownedBlock !== true
      || ![undefined, "", "\n", "\n\n"].includes(entry.leadingSeparator)
    ) return false;
    const markers = tomlMarkers(entry.agent, entry.ownershipId);
    return entry.beginMarker === markers.begin && entry.endMarker === markers.end;
  }
  return false;
}

function readIntegrationReceipt(config, env = process.env, { enforcePaths = false } = {}) {
  const file = path.join(config.locations.stateDir, "integrations.json");
  if (!fs.existsSync(file)) return { schemaVersion: 1, integrations: [] };
  ensureRealDirectory(config.locations.stateDir, { label: "State directory" });
  const details = fs.lstatSync(file);
  if (!details.isFile() || details.isSymbolicLink()) throw new Error(`Integration receipt is not a real file: ${file}`);
  const receipt = readJson(file, null);
  if (receipt?.schemaVersion !== 1 || !Array.isArray(receipt.integrations) || !receipt.integrations.every((entry) => validateIntegrationEntry(config, entry, env, enforcePaths))) {
    throw new Error(`Invalid integration receipt: ${file}`);
  }
  return receipt;
}

function stripRecordedClaudeHooks(entries, commands) {
  const remainingByCommand = new Map();
  for (const command of commands) {
    if (typeof command === "string" && command) {
      remainingByCommand.set(command, (remainingByCommand.get(command) || 0) + 1);
    }
  }
  let removed = 0;
  const remaining = entries.map((entry) => Array.isArray(entry?.hooks) ? { ...entry, hooks: [...entry.hooks] } : entry);
  for (let entryIndex = remaining.length - 1; entryIndex >= 0; entryIndex -= 1) {
    const entry = remaining[entryIndex];
    if (!Array.isArray(entry?.hooks)) continue;
    for (let hookIndex = entry.hooks.length - 1; hookIndex >= 0; hookIndex -= 1) {
      const hook = entry.hooks[hookIndex];
      const command = hook?.type === "command" ? String(hook.command || "") : "";
      const count = remainingByCommand.get(command) || 0;
      if (count === 0) continue;
      entry.hooks.splice(hookIndex, 1);
      remainingByCommand.set(command, count - 1);
      removed += 1;
    }
    if (entry.hooks.length === 0) remaining.splice(entryIndex, 1);
  }
  return { entries: remaining, removed };
}

function installClaudeHook(config, runtime, env = process.env, previousEntries = []) {
  const file = claudeSettingsPath(config, env);
  const previousForFile = previousEntries.filter((entry) => entry.agent === "claude" && entry.mode === "native-hook" && entry.file === file);
  const settings = readJson(file, {});
  if (!isObject(settings)) return launcherIntegration("claude", runtime, `${file} is not a JSON object`, file);
  if (settings.hooks === undefined) settings.hooks = {};
  else if (!isObject(settings.hooks)) return launcherIntegration("claude", runtime, `${file} hooks is not a JSON object`, file);
  if (settings.hooks.SessionStart === undefined) settings.hooks.SessionStart = [];
  else if (!Array.isArray(settings.hooks.SessionStart)) {
    return launcherIntegration("claude", runtime, `${file} hooks.SessionStart is not an array`, file);
  }
  settings.hooks.SessionStart = stripRecordedClaudeHooks(
    settings.hooks.SessionStart,
    previousForFile.map((entry) => entry.command)
  ).entries;
  const ownershipId = previousForFile.find((entry) => entry.ownershipId)?.ownershipId || randomUUID();
  const command = hookCommand(runtime, ownershipId);
  settings.hooks.SessionStart.push({
    matcher: "startup|resume|clear|compact",
    hooks: [{ type: "command", command }]
  });
  writeJsonAtomicFollowingLeafSymlink(file, settings);
  return {
    agent: "claude",
    mode: "native-hook",
    file,
    referent: fs.realpathSync(file),
    ownershipId,
    command
  };
}

function sectionRange(lines, sectionName) {
  const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const header = new RegExp(`^\\s*\\[${escaped}\\]\\s*(?:#.*)?$`);
  const start = lines.findIndex((line) => header.test(line));
  if (start === -1) return null;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\s*(?:\[[^\[\]]+\]|\[\[[^\[\]]+\]\])\s*(?:#.*)?$/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return { start, end };
}

function tomlKeyUse(line, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^\\s*(?:${escaped}|"${escaped}"|'${escaped}')\\s*(?:=|\\.)`).test(line);
}

function policySyntax(line) {
  return /^\s*\[{1,2}\s*(?:shell_environment_policy|"shell_environment_policy"|'shell_environment_policy')(?=\s*[.\]])/.test(line)
    || tomlKeyUse(line, "shell_environment_policy");
}

function supportedPolicyHeader(line) {
  return /^\s*\[shell_environment_policy(?:\.set)?\]\s*(?:#.*)?$/.test(line);
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function tomlMarkers(agent, ownershipId) {
  if (!ownershipId) {
    return {
      begin: `# clean-development begin (${agent})`,
      end: `# clean-development end (${agent})`
    };
  }
  return {
    begin: `# clean-development begin (${agent}) owner=${ownershipId}`,
    end: `# clean-development end (${agent}) owner=${ownershipId}`
  };
}

function receiptTomlMarkers(entry) {
  if (entry.beginMarker && entry.endMarker) {
    return { begin: entry.beginMarker, end: entry.endMarker };
  }
  return tomlMarkers(entry.agent, entry.ownershipId);
}

function removeTomlBlockText(original, begin, end, leadingSeparator = "") {
  const start = original.indexOf(begin);
  const finish = original.indexOf(end, start + begin.length);
  if (start === -1 || finish < start) return { content: original, removed: false };
  let before = start;
  if (leadingSeparator && original.slice(start - leadingSeparator.length, start) === leadingSeparator) {
    before -= leadingSeparator.length;
  }
  let after = finish + end.length;
  if (original.startsWith("\r\n", after)) after += 2;
  else if (original.startsWith("\n", after)) after += 1;
  const content = `${original.slice(0, before)}${original.slice(after)}`;
  return { content, removed: true };
}

function launcherIntegration(agent, runtime, reason, configFile) {
  return {
    agent,
    mode: "zero-context-launcher",
    command: path.join(runtime.binDir, `clean-development-${agent}${process.platform === "win32" ? ".cmd" : ""}`),
    ...(configFile ? { configFile } : {}),
    reason
  };
}

function packageRunnerEnvironment(env) {
  return Boolean(
    environmentValue(env, "npm_execpath")
    || environmentValue(env, "npm_lifecycle_event")
    || ["exec", "run-script"].includes(String(environmentValue(env, "npm_command") || "").toLowerCase())
  );
}

function persistentPath(pathValue, runtimeBin, { cwd, env, home }) {
  const temporaryRoot = canonicalizePotentialPath(os.tmpdir());
  const canonicalHome = canonicalizePotentialPath(home);
  const unsafeRoots = [cwd, environmentValue(env, "VIRTUAL_ENV"), environmentValue(env, "CONDA_PREFIX")]
    .filter((value) => typeof value === "string" && value && path.isAbsolute(value))
    .map(canonicalizePotentialPath)
    .filter((value) => value !== path.parse(value).root && value !== canonicalHome);
  const seen = new Set();
  const entries = [];
  for (const entry of String(pathValue || "").split(path.delimiter).filter(Boolean)) {
    if (!path.isAbsolute(entry)) continue;
    const canonical = canonicalizePotentialPath(entry);
    const normalized = canonical.split(path.sep).join("/").toLowerCase();
    if (normalized.endsWith("/node_modules/.bin") || normalized.includes("/_npx/")) continue;
    if (canonical === temporaryRoot || isPathInside(temporaryRoot, canonical)) continue;
    if (unsafeRoots.some((root) => canonical === root || isPathInside(root, canonical))) continue;
    const key = process.platform === "win32" ? canonical.toLowerCase() : canonical;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
  }
  return prependUniquePath(entries.join(path.delimiter), runtimeBin);
}

function installShellEnvironment(config, runtime, agent, file, env = process.env, previousEntries = [], cwd = process.cwd()) {
  if (packageRunnerEnvironment(env)) {
    return launcherIntegration(
      agent,
      runtime,
      "Refusing to persist npm/npx's transient PATH; use this launcher or rerun setup from a fresh shell",
      file
    );
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let original = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const previousForFile = previousEntries.filter((entry) => entry.agent === agent && entry.mode === "native-shell-environment" && entry.file === file);
  for (const entry of previousForFile) {
    const markers = receiptTomlMarkers(entry);
    original = removeTomlBlockText(original, markers.begin, markers.end, entry.leadingSeparator || "").content;
  }
  const ownershipId = previousForFile.find((entry) => entry.ownershipId)?.ownershipId || randomUUID();
  const { begin, end } = tomlMarkers(agent, ownershipId);
  const pathValue = persistentPath(environmentValue(env, "PATH"), runtime.binDir, {
    cwd,
    env,
    home: config.locations.home
  });
  if (pathValue === runtime.binDir) {
    return launcherIntegration(agent, runtime, "No stable absolute PATH entries were available to persist", file);
  }
  const blockFor = (includeParent) => [
    begin,
    ...(includeParent ? ["[shell_environment_policy.set]"] : []),
    `PATH = ${tomlString(pathValue)}`,
    `CLEAN_DEVELOPMENT_ACTIVE = \"1\"`,
    end
  ];
  const fullBlock = () => [
    begin,
    "[shell_environment_policy]",
    `inherit = \"all\"`,
    "",
    "[shell_environment_policy.set]",
    `PATH = ${tomlString(pathValue)}`,
    `CLEAN_DEVELOPMENT_ACTIVE = \"1\"`,
    end
  ];

  let content = original;
  const lines = original.split(/\r?\n/);
  const policyLines = lines.filter(policySyntax);
  const parentHeaders = lines.filter((line) => /^\s*\[shell_environment_policy\]\s*(?:#.*)?$/.test(line));
  const setHeaders = lines.filter((line) => /^\s*\[shell_environment_policy\.set\]\s*(?:#.*)?$/.test(line));
  if (policyLines.some((line) => !supportedPolicyHeader(line)) || parentHeaders.length > 1 || setHeaders.length > 1) {
    return launcherIntegration(agent, runtime, `${file} uses an unsupported quoted, dotted, inline, or repeated shell_environment_policy form`, file);
  }
  const setRange = sectionRange(lines, "shell_environment_policy.set");
  let leadingSeparator = "";
  if (setRange) {
    const section = lines.slice(setRange.start + 1, setRange.end);
    if (section.some((line) => tomlKeyUse(line, "PATH") || tomlKeyUse(line, "CLEAN_DEVELOPMENT_ACTIVE"))) {
      return launcherIntegration(agent, runtime, `${file} already sets shell_environment_policy.set.PATH`, file);
    }
    lines.splice(setRange.end, 0, ...blockFor(false));
    content = lines.join("\n");
  } else {
    const parent = sectionRange(lines, "shell_environment_policy");
    if (parent) {
      const section = lines.slice(parent.start + 1, parent.end);
      if (section.some((line) => tomlKeyUse(line, "set"))) {
        return launcherIntegration(agent, runtime, `${file} already has an inline shell_environment_policy.set table`, file);
      }
      lines.splice(parent.end, 0, ...blockFor(true));
      content = lines.join("\n");
    } else {
      leadingSeparator = original && !original.endsWith("\n") ? "\n\n"
        : original && !original.endsWith("\n\n") ? "\n"
          : "";
      content = `${original}${leadingSeparator}${fullBlock().join("\n")}\n`;
    }
  }
  writeTextAtomicFollowingLeafSymlink(file, content.endsWith("\n") ? content : `${content}\n`);
  return {
    agent,
    mode: "native-shell-environment",
    file,
    referent: fs.realpathSync(file),
    ownershipId,
    beginMarker: begin,
    endMarker: end,
    leadingSeparator,
    ownedBlock: true
  };
}

export function installAgentIntegrations(config, runtime, agents, env = process.env, cwd = process.cwd()) {
  const receiptFile = path.join(config.locations.stateDir, "integrations.json");
  const previous = readIntegrationReceipt(config, env, { enforcePaths: true });
  const previousEntries = Array.isArray(previous.integrations) ? previous.integrations : [];
  let installed = deactivateUnselectedEntries(config, env, previousEntries, agents);
  const persist = () => {
    installed.sort((left, right) => {
      return left.agent.localeCompare(right.agent) || String(left.file || "").localeCompare(String(right.file || ""));
    });
    writeJsonAtomic(receiptFile, {
      schemaVersion: 1,
      installedAt: new Date().toISOString(),
      integrations: installed
    });
  };
  for (const agent of agents) {
    if (!Object.hasOwn(SUPPORTED_AGENTS, agent)) throw new Error(`Unsupported agent: ${agent}`);
    let integration;
    if (agent === "claude") integration = installClaudeHook(config, runtime, env, previousEntries);
    else if (agent === "codex") integration = installShellEnvironment(config, runtime, agent, agentConfigPath(config, env, agent), env, previousEntries, cwd);
    else if (agent === "grok") integration = installShellEnvironment(config, runtime, agent, agentConfigPath(config, env, agent), env, previousEntries, cwd);
    else {
      integration = {
        agent,
        mode: "zero-context-launcher",
        command: path.join(runtime.binDir, `clean-development-${agent}${process.platform === "win32" ? ".cmd" : ""}`)
      };
    }
    installed = installed.filter((entry) => {
      if (entry.agent !== agent) return true;
      if (!entry.file) return false;
      if (integration.file) return entry.file !== integration.file;
      return Boolean(entry.file);
    });
    installed.push(integration);
    persist();
  }
  if (agents.length === 0) persist();
  return installed;
}

function removeOwnedTomlBlock(entry) {
  const { file } = entry;
  if (typeof file !== "string" || !path.isAbsolute(file)) return false;
  if (!fs.existsSync(file)) return false;
  if (entry.referent) {
    try {
      if (fs.realpathSync(file) !== entry.referent) return false;
    } catch {
      return false;
    }
  }
  const { begin, end } = receiptTomlMarkers(entry);
  const original = fs.readFileSync(file, "utf8");
  const result = removeTomlBlockText(original, begin, end, entry.leadingSeparator || "");
  if (!result.removed) return false;
  writeTextAtomicFollowingLeafSymlink(file, result.content);
  return true;
}

function receiptEntries(config, env = process.env) {
  return readIntegrationReceipt(config, env, { enforcePaths: true }).integrations;
}

function removeRecordedClaudeHooks(entries) {
  const file = entries[0]?.file;
  if (typeof file !== "string" || !path.isAbsolute(file)) return { changed: false, removed: 0 };
  for (const entry of entries) {
    if (!entry.referent) continue;
    try {
      if (fs.realpathSync(file) !== entry.referent) return { changed: false, removed: 0 };
    } catch {
      return { changed: false, removed: 0 };
    }
  }
  const settings = readJson(file, null);
  if (!settings?.hooks?.SessionStart || !Array.isArray(settings.hooks.SessionStart)) return { changed: false, removed: 0 };
  const stripped = stripRecordedClaudeHooks(settings.hooks.SessionStart, entries.map((entry) => entry.command));
  if (stripped.removed === 0) return { changed: false, removed: 0 };
  settings.hooks.SessionStart = stripped.entries;
  if (settings.hooks.SessionStart.length === 0) delete settings.hooks.SessionStart;
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  writeJsonAtomicFollowingLeafSymlink(file, settings);
  return { changed: true, removed: stripped.removed };
}

function removeClaudeEntries(entries) {
  const byFile = new Map();
  for (const entry of entries) {
    if (entry.agent !== "claude" || entry.mode !== "native-hook" || typeof entry.file !== "string" || typeof entry.command !== "string") continue;
    const values = byFile.get(entry.file) || [];
    values.push(entry);
    byFile.set(entry.file, values);
  }
  let removed = false;
  for (const values of byFile.values()) removed = removeRecordedClaudeHooks(values).changed || removed;
  return removed;
}

function deactivateUnselectedEntries(config, env, entries, agents) {
  const selected = new Set(agents);
  const stale = entries.filter((entry) => !selected.has(entry.agent));
  const removedEntries = new Set();
  const retained = [];

  // Zero-context launchers are materialized as part of the shared runtime. They
  // have no agent-owned file to edit; dropping their receipt entry is enough to
  // make the configured integration set truthful.
  for (const entry of stale) {
    if (entry.mode === "zero-context-launcher") removedEntries.add(entry);
  }

  const claudeByFile = new Map();
  for (const entry of stale) {
    if (entry.mode !== "native-hook") continue;
    const values = claudeByFile.get(entry.file) || [];
    values.push(entry);
    claudeByFile.set(entry.file, values);
  }
  for (const values of claudeByFile.values()) {
    if (!values[0]?.file || !fs.existsSync(values[0].file)) {
      for (const entry of values) removedEntries.add(entry);
      continue;
    }
    const removed = removeRecordedClaudeHooks(values);
    if (removed.removed === values.length) {
      for (const entry of values) removedEntries.add(entry);
    } else {
      throw new Error(`Cannot deactivate owned Claude integration safely in ${values[0].file}; the recorded hook was changed or removed`);
    }
  }

  for (const entry of stale) {
    if (entry.mode !== "native-shell-environment") continue;
    if (!entry.file || !fs.existsSync(entry.file)) {
      removedEntries.add(entry);
      continue;
    }
    if (removeOwnedTomlBlock(entry)) removedEntries.add(entry);
    else throw new Error(`Cannot deactivate owned ${entry.agent} integration safely in ${entry.file}; the recorded block was changed or removed`);
  }

  for (const entry of stale) {
    if (!removedEntries.has(entry)) retained.push(entry);
  }
  if (retained.length > 0) {
    throw new Error(`Cannot deactivate selected agent integrations: ${retained.map((entry) => entry.agent).join(", ")}`);
  }
  return entries.filter((entry) => selected.has(entry.agent) || !stale.includes(entry));
}

export function removeOwnedAgentIntegrations(config, env = process.env) {
  const entries = receiptEntries(config, env);
  const result = { claude: false, codex: false, grok: false };
  const removedEntries = new Set();
  const claudeByFile = new Map();
  for (const entry of entries) {
    if (entry.agent !== "claude" || entry.mode !== "native-hook") continue;
    const values = claudeByFile.get(entry.file) || [];
    values.push(entry);
    claudeByFile.set(entry.file, values);
  }
  for (const values of claudeByFile.values()) {
    const removed = removeRecordedClaudeHooks(values);
    result.claude = removed.changed || result.claude;
    if (removed.removed === values.length) for (const entry of values) removedEntries.add(entry);
  }
  for (const entry of entries) {
    if (!["codex", "grok"].includes(entry.agent) || entry.mode !== "native-shell-environment") continue;
    const removed = removeOwnedTomlBlock(entry);
    result[entry.agent] = removed || result[entry.agent];
    if (removed) removedEntries.add(entry);
  }
  const remaining = entries.filter((entry) => {
    if (removedEntries.has(entry)) return false;
    return ["native-hook", "native-shell-environment"].includes(entry.mode);
  });
  writeJsonAtomic(path.join(config.locations.stateDir, "integrations.json"), {
    schemaVersion: 1,
    uninstalledAt: new Date().toISOString(),
    integrations: remaining
  });
  result.retained = remaining.length;
  return result;
}

export function removeClaudeHook(config, env = process.env) {
  return removeClaudeEntries(receiptEntries(config, env));
}

export function applyClaudeSessionEnvironment(config, runtime, env = process.env) {
  const environmentFile = env.CLAUDE_ENV_FILE;
  if (!environmentFile) return { applied: false, reason: "CLAUDE_ENV_FILE is not set" };
  const begin = "# clean-development begin";
  const end = "# clean-development end";
  const block = [
    begin,
    `_clean_development_bin=${shellQuote(runtime.binDir)}`,
    "case \":${PATH:-}:\" in",
    "  *\":${_clean_development_bin}:\"*) ;;",
    "  *) export PATH=\"${_clean_development_bin}${PATH:+:${PATH}}\" ;;",
    "esac",
    "unset _clean_development_bin",
    "export CLEAN_DEVELOPMENT_ACTIVE=1",
    end
  ].join("\n");
  fs.mkdirSync(path.dirname(environmentFile), { recursive: true });
  const original = fs.existsSync(environmentFile) ? fs.readFileSync(environmentFile, "utf8") : "";
  const start = original.indexOf(begin);
  const finish = original.indexOf(end, start + begin.length);
  if ((start === -1) !== (finish === -1)) throw new Error(`Refusing malformed clean-development block in ${environmentFile}`);
  const content = start === -1
    ? `${original}${original && !original.endsWith("\n") ? "\n" : ""}${block}\n`
    : `${original.slice(0, start)}${block}${original.slice(finish + end.length)}`;
  writeTextAtomicFollowingLeafSymlink(environmentFile, content.endsWith("\n") ? content : `${content}\n`);
  return { applied: true, environmentFile, binDir: runtime.binDir };
}

export function integrationStatus(config, env = process.env, options = {}) {
  return readIntegrationReceipt(config, env, options);
}
