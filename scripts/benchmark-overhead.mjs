import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";
import { resolveConfig } from "../src/config.js";
import { ensureRuntime } from "../src/runtime.js";

const iterations = Number(process.env.BENCHMARK_ITERATIONS || 100);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "clean-development-benchmark-"));
const fakeBin = path.join(temporary, "fake-bin");
const project = path.join(temporary, "project");
fs.mkdirSync(fakeBin, { recursive: true });
fs.mkdirSync(project, { recursive: true });
for (const name of ["caches", "builds", "scratch"]) fs.mkdirSync(path.join(temporary, "managed", name), { recursive: true });
fs.writeFileSync(path.join(project, "Cargo.toml"), "[package]\nname='benchmark'\nversion='0.0.0'\n");
const fakeCargo = path.join(fakeBin, "cargo");
fs.writeFileSync(fakeCargo, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
fs.chmodSync(fakeCargo, 0o755);

const env = {
  ...process.env,
  CLEAN_DEVELOPMENT_HOME: path.join(temporary, "home"),
  CLEAN_DEVELOPMENT_DATA_HOME: path.join(temporary, "data"),
  CLEAN_DEVELOPMENT_CONFIG_HOME: path.join(temporary, "config"),
  CLEAN_DEVELOPMENT_ROOT: path.join(temporary, "managed"),
  PATH: fakeBin
};

function sample(command, childEnv) {
  const start = performance.now();
  const result = spawnSync(command, [], { cwd: project, env: childEnv, stdio: "ignore" });
  if (result.status !== 0) throw new Error(`${command} returned ${result.status}`);
  return performance.now() - start;
}

function percentile(values, fraction) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)];
}

try {
  const config = resolveConfig({ cwd: project, env });
  const runtime = ensureRuntime(config);
  const shim = path.join(runtime.binDir, "cargo");
  for (let index = 0; index < 5; index += 1) {
    sample(fakeCargo, env);
    sample(shim, { ...env, PATH: `${runtime.binDir}${path.delimiter}${fakeBin}` });
  }
  const direct = [];
  const routed = [];
  for (let index = 0; index < iterations; index += 1) {
    direct.push(sample(fakeCargo, env));
    routed.push(sample(shim, { ...env, PATH: `${runtime.binDir}${path.delimiter}${fakeBin}` }));
  }
  const result = {
    platform: `${process.platform}-${process.arch}`,
    node: process.version,
    iterations,
    directMedianMs: Number(percentile(direct, 0.5).toFixed(2)),
    routedMedianMs: Number(percentile(routed, 0.5).toFixed(2)),
    addedMedianMs: Number((percentile(routed, 0.5) - percentile(direct, 0.5)).toFixed(2)),
    addedP95Ms: Number((percentile(routed, 0.95) - percentile(direct, 0.95)).toFixed(2))
  };
  console.log(JSON.stringify(result, null, 2));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
