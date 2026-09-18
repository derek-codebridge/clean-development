# Performance and token contract

## Runtime targets

These are release gates, not measured claims:

- no network, package installation, model call, full filesystem scan, or toolchain probe on a shim invocation;
- no daemon in the initial release;
- p95 shim dispatch overhead at or below 75 ms on named reference hardware for `0.1.x`, with 50 ms as the optimization target;
- median warm-build slowdown at or below 2% for builds longer than five seconds;
- a second identical build reuses the tool's ordinary warm cache;
- short commands are measured separately because process startup dominates them.

Benchmarks should record platform, filesystem, Node version, toolchain version, cold/warm state, elapsed time, bytes downloaded, storage growth, and concurrency. Compare direct tool invocation with the shim using the same workspace and arguments.

## Token contract

Healthy CLI and native environment operation adds:

- zero prompt or `additionalContext` text;
- zero MCP tools or schemas;
- zero model calls;
- zero extra agent tool calls;
- no `AGENTS.md`, `CLAUDE.md`, or `GEMINI.md` instruction changes.

This does not by itself prove identical billed tokens. A host can serialize environment, paths, plugin metadata, or tool results differently. Certification requires capturing model-facing requests for a named host/version and comparing the same deterministic scenario with and without activation.

The explicit-only management skill is outside the runtime path and consumes context only when the host loads or invokes it under that host's skill rules.

## Development measurement

Local no-op shim benchmarks are recorded in [benchmarks/m3-pro-2026-09-18.md](benchmarks/m3-pro-2026-09-18.md). Four additional 100-iteration runs measured 56.72–59.33 ms added median and 75.96–97.73 ms p95; the full recorded sample range is 44.96–73.50 ms median and 47.07–145.14 ms p95. The samples show enough variance that the provisional 75 ms p95 ceiling is not met consistently; the 50 ms optimization target is also not met. Ordinary shell commands are not wrapped; the cost applies only when a supported build/package command crosses a shim.
