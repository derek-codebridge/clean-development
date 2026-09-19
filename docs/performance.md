# Performance and token contract

## Runtime targets

These are release gates, not measured claims:

- no network, package installation, model call, full filesystem scan, or toolchain probe on a shim invocation;
- no daemon in the initial release;
- p95 shim dispatch overhead at or below 75 ms on named reference hardware, with 50 ms as the optimization target;
- median warm-build slowdown at or below 2% for builds longer than five seconds;
- a second identical build reuses the tool's ordinary warm cache;
- short commands are measured separately because process startup dominates them.

Benchmarks should record platform, filesystem, Node version, toolchain version, cold/warm state, elapsed time, bytes downloaded, storage growth, and concurrency. Compare direct tool invocation with the shim using the same workspace and arguments.

## Session planning cost

Version 0.2.0 adds one local plan at the `session`, `agent`, or `run` boundary. Detection walks ancestor directories and reads selected manifest metadata; it does not recursively scan source, execute project code, probe toolchains, or contact a model. Interactive choice time belongs to session startup and must be reported separately from shim dispatch. Noninteractive `agent`, `run`, and stable launcher calls use `session-only` unless a choice is supplied or inherited; native integration entry points default to `skip`.

Detected shared-cache variables are overlaid once for the child session. Supported commands still pass through shims, and Cargo retains dynamic workspace selection and ownership/lease checks on every command. The static overlay does not remove shim process overhead or establish a new speedup claim. Hooks and shims do not prompt. Native shims may remain on PATH in `skip` mode, where they pass through to the real tool; a fresh skipped launcher creates no runtime or routing. `session --dry-run` stops after the read-only plan.

## Token contract

Healthy CLI and native environment operation adds:

- zero prompt or `additionalContext` text;
- zero MCP tools or schemas;
- zero model calls;
- zero extra agent tool calls;
- no `AGENTS.md`, `CLAUDE.md`, or `GEMINI.md` instruction changes.

This does not by itself prove identical billed tokens. A host can serialize environment, paths, plugin metadata, or tool results differently. Certification requires capturing model-facing requests for a named host/version and comparing the same deterministic scenario with and without activation.

The explicit-only management skill is outside the runtime path and consumes context only when the host loads or invokes it under that host's skill rules.

The session choice is printed to the local terminal before the agent starts. It adds no product-authored instructions to the agent prompt. If a user explicitly asks an agent to run `session` and read its output, that requested command output can enter the model's context like any other tool result.

## Development measurement

Historical no-op shim benchmarks are recorded in [benchmarks/m3-pro-2026-09-18.md](benchmarks/m3-pro-2026-09-18.md). The benchmark calculates percentiles from paired routed-minus-direct samples. Four corrected 100-iteration macOS arm64 development runs measured 50.23–52.10 ms added median and 52.32–59.27 ms added p95. The final v0.2.0 source measured 57.96 ms added median and 67.28 ms added p95 across 100 pairs on macOS arm64 with Node 26.8.2. This passed the provisional 75 ms p95 ceiling while the 50 ms optimization target remained unmet; broader supported-Node and variance testing remains follow-up work. Earlier added-overhead values used differences between independent distribution percentiles and are retained only as historical output. Ordinary shell commands are not wrapped; the cost applies only when a supported build/package command crosses a shim.
