#!/usr/bin/env node
import { resolveConfig } from "../src/config.js";
import { runTool } from "../src/runtime.js";

const [tool, ...args] = process.argv.slice(2);
if (!tool) {
  console.error("clean-development shim: missing tool name");
  process.exitCode = 2;
} else {
  try {
    process.exitCode = await runTool(tool, args, { config: resolveConfig() });
  } catch (error) {
    console.error(`clean-development: ${error.message}`);
    process.exitCode = 1;
  }
}
