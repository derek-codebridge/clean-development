# Clean Development master plan

Status reviewed 19 September 2026. `[x]` means implemented and evidenced, `[~]` means partially evidenced or still a release gate, and `[ ]` means deferred or incomplete.

## Core product

- [x] Route new supported caches and mutable Cargo output into explicit managed roots.
- [x] Keep shared caches reusable and Cargo builds separate by canonical workspace.
- [x] Leave existing clutter, credentials, toolchains, release evidence, and unregistered output alone.
- [x] Keep routing outside MCP, prompts, model calls, and ordinary agent context.

## CLI and safety

- [x] `setup`, `update`, `prepare`, `init`, `run`, `agent`, `env`, `status`, `doctor`, `prune`, `pin`, `unpin`, and uninstall flows.
- [x] v0.2.0 session planning is implemented and source-verified: read-only `session --dry-run`, bounded manifest detection, interactive session-only/persist/skip choices, a noninteractive session-only default for `agent`/`run`/stable launchers, native default-skip pass-through, reviewed project-file persistence, static cache overlay, and dynamic Cargo routing.
- [x] Versioned runtime, stable launchers, atomic integration edits, receipts, locks, leases, symlink checks, and fail-closed uninstall.
- [x] Cargo, Go, npm/npx, pnpm, Yarn, Bun, uv, pip, .NET, Composer, ccache, and sccache adapters.
- [x] Prune only registered Cargo build directories; dry-run by default; active and pinned workspaces retained.

## Agent coverage

- [~] Claude remains fixture-tested. Codex CLI 0.154.0 passed isolated Terra-high Rust and 914-test Auditex workflows when its sandbox could write both the application data/state root and managed artifacts; subagent, resume, and desktop acceptance remain.
- [x] Grok 1.0.34 parser, marketplace, argv, and model-shell routing passed after the owned command prefix repaired its captured login PATH.
- [~] Antigravity `agy` 1.2.7 passed routing and a short model workflow with managed Cargo output; its print mode cancels automatically backgrounded long commands before `--print-timeout`.
- [~] OpenCode and Pi native routes: implemented; host/package acceptance remains.
- [~] Other advertised agents: launcher or metadata routes only until real native acceptance exists.

## Release gates

- [x] MIT license, copyright, SECURITY.md, governance, contribution, release, support, CI, CodeQL, Dependabot, and launch docs.
- [x] Isolated npm package verification, fresh skip/setup/status/uninstall, v0.1.0 upgrade, real Cargo/Go/npm/uv smoke checks, plugin/skill validators, and npm audit pass for v0.2.0. Final counts and hashes are recorded in [verification](verification.md) and `.release/`.
- [~] Performance: the final 100-pair no-op run measured 57.96 ms added median and 67.28 ms added p95, below the provisional 75 ms ceiling. Broader supported-Node and variance coverage remains follow-up work, and the 50 ms optimization target is not met.
- [ ] Capture baseline/enabled host model requests to verify token neutrality.
- [~] Debian 13 ARM64 passes the v0.2.0 source suite and installed-package gate on exact Node 20.12.2 and 20.19.2. Windows, native Apple/Xcode/SwiftPM, and full host acceptance remain.
- [ ] Add native cache eviction and scratch expiry; scratch is currently reserved and retained.
- [x] The v0.2.0 release candidate is independently reviewed, verified, committed, tagged, and pushed.
- [~] npm publication and public-registry verification remain separate because the package name has not yet been published.

See [verification](verification.md), [agent integrations](agent-integrations.md), [safety model](safety-model.md), [performance](performance.md), and the [audit record](audit-2026-09-18.md). This file is the repository's authoritative acceptance ledger; the longer work-session design notes are not required for installation or operation.
