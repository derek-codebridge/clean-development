import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";
import { resolveConfig } from "../src/config.js";
import { ensureRuntime } from "../src/runtime.js";
import { isolatedEnvironment, summarizeOverhead } from "./harness-utils.mjs";

const iterations = Number(process.env.BENCHMARK_ITERATIONS || 100);
if (!Number.isSafeInteger(iterations) || iterations < 1) throw new Error("BENCHMARK_ITERATIONS must be a positive integer");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "clean-development-benchmark-"));
const fakeBin = path.join(temporary, "fake-bin");
const project = path.join(temporary, "project");
fs.mkdirSync(fakeBin, { recursive: true });
fs.mkdirSync(project, { recursive: true });
for (const name of ["caches", "builds", "scratch"]) fs.mkdirSync(path.join(temporary, "managed", name), { recursive: true });
fs.writeFileSync(path.join(project, "Cargo.toml"), "[package]\nname='benchmark'\nversion='0.0.0'\n");
fs.writeFileSync(path.join(project, ".clean-development.json"), '{"schemaVersion":1}\n');
const fakeCargo = path.join(fakeBin, "cargo");
fs.writeFileSync(fakeCargo, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
fs.chmodSync(fakeCargo, 0o755);

const env = {
  ...isolatedEnvironment(temporary),
  PATH: fakeBin
};

function sample(command, childEnv) {
  const start = performance.now();
  const result = spawnSync(command, [], { cwd: project, env: childEnv, stdio: "ignore" });
  if (result.status !== 0) throw new Error(`${command} returned ${result.status}`);
  return performance.now() - start;
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
    ...summarizeOverhead(direct, routed)
  };
  console.log(JSON.stringify(result, null, 2));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
