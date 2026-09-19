import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createBashTool } from "@earendil-works/pi-coding-agent";
import { resolveConfig } from "../../src/config.js";
import { environmentValue } from "../../src/platform.js";
import { ensureRuntime } from "../../src/runtime.js";
import { nativeSessionEnvironment, normalizeSessionMode, SESSION_MODE_ENV } from "../../src/session.js";

export default function cleanDevelopment(pi: ExtensionAPI) {
  const bashTool = createBashTool(process.cwd(), {
    spawnHook: ({ command, cwd, env }) => {
      const inheritedMode = normalizeSessionMode(environmentValue(env, SESSION_MODE_ENV));
      let config;
      if (inheritedMode && inheritedMode !== "skip") config = resolveConfig({ cwd, env });
      else {
        try {
          config = resolveConfig({ cwd, env });
        } catch {
          config = resolveConfig({ cwd, env, includeProject: false });
        }
      }
      const sessionMode = config.enabled === false
        ? "skip"
        : inheritedMode || "skip";
      if (config.enabled === false) {
        return { command, cwd, env: nativeSessionEnvironment(env, { binDir: config.locations.binDir }) };
      }
      const runtime = ensureRuntime(config, { automatic: true });
      const childEnv = nativeSessionEnvironment(env, {
        mode: sessionMode,
        binDir: runtime?.binDir || config.locations.binDir,
        includeRuntime: Boolean(runtime)
      });
      return {
        command,
        cwd,
        env: childEnv
      };
    }
  });

  pi.registerTool({
    ...bashTool,
    execute: async (id, params, signal, onUpdate, _context) => bashTool.execute(id, params, signal, onUpdate)
  });
}
