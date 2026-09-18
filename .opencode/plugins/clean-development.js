import { resolveConfig } from "../../src/config.js";
import { environmentValue, prependUniquePath, setEnvironmentValue } from "../../src/platform.js";
import { ensureRuntime } from "../../src/runtime.js";

function environment(cwd, existing) {
  const config = resolveConfig({ cwd, env: existing });
  const runtime = ensureRuntime(config, { automatic: true });
  if (!runtime) return {};
  return {
    CLEAN_DEVELOPMENT_ACTIVE: "1",
    PATH: prependUniquePath(environmentValue(existing, "PATH"), runtime.binDir)
  };
}

export const CleanDevelopmentPlugin = async ({ directory }) => ({
  "shell.env": async (input, output) => {
    output.env ||= {};
    const activated = environment(input.cwd || directory || process.cwd(), { ...process.env, ...output.env });
    if (activated.PATH) {
      setEnvironmentValue(output.env, "PATH", activated.PATH);
      delete activated.PATH;
    }
    Object.assign(output.env, activated);
  }
});

export default CleanDevelopmentPlugin;
