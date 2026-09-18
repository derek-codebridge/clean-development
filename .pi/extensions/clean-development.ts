import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createBashTool } from "@earendil-works/pi-coding-agent";
import { resolveConfig } from "../../src/config.js";
import { environmentValue, prependUniquePath, setEnvironmentValue } from "../../src/platform.js";
import { ensureRuntime } from "../../src/runtime.js";

export default function cleanDevelopment(pi: ExtensionAPI) {
  const bashTool = createBashTool(process.cwd(), {
    spawnHook: ({ command, cwd, env }) => {
      const config = resolveConfig({ cwd, env });
      const runtime = ensureRuntime(config, { automatic: true });
      if (!runtime) return { command, cwd, env };
      const childEnv = {
        ...env,
        CLEAN_DEVELOPMENT_ACTIVE: "1"
      };
      setEnvironmentValue(childEnv, "PATH", prependUniquePath(environmentValue(env, "PATH"), runtime.binDir));
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
