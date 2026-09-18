# Clean Development master plan

Status reviewed 18 September 2026. `[x]` means implemented and evidenced, `[~]` means partially evidenced or still a release gate, and `[ ]` means deferred or incomplete.

## Core product

- [x] Route new supported caches and mutable Cargo output into explicit managed roots.
- [x] Keep shared caches reusable and Cargo builds separate by canonical workspace.
- [x] Leave existing clutter, credentials, toolchains, release evidence, and unregistered output alone.
- [x] Keep routing outside MCP, prompts, model calls, and ordinary agent context.

## CLI and safety

- [x] `setup`, `update`, `prepare`, `init`, `run`, `agent`, `env`, `status`, `doctor`, `prune`, `pin`, `unpin`, and uninstall flows.
- [x] Versioned runtime, stable launchers, atomic integration edits, receipts, locks, leases, symlink checks, and fail-closed uninstall.
- [x] Cargo, Go, npm/npx, pnpm, Yarn, Bun, uv, pip, .NET, Composer, ccache, and sccache adapters.
- [x] Prune only registered Cargo build directories; dry-run by default; active and pinned workspaces retained.

## Agent coverage

- [~] Claude and Codex native routes: fixture-tested; real subagent/resume/desktop acceptance remains.
- [~] Grok native route: configuration/launcher tested; Grok 1.0.34 skill-free marketplace install verified; child-process/model acceptance remains.
- [~] OpenCode and Pi native routes: implemented; host/package acceptance remains.
- [~] Other advertised agents: launcher or metadata routes only until real native acceptance exists.

## Release gates

- [x] MIT license, copyright, SECURITY.md, governance, contribution, release, support, CI, CodeQL, Dependabot, and launch docs.
- [x] Isolated npm package verification, real Cargo/Go/npm/uv smoke checks, 79 automated tests, plugin/skill validators, and npm audit.
- [~] Performance: latest no-op run measured 54.96 ms added median and 74.05 ms p95, but prior runs reached 145.14 ms p95; the provisional 75 ms p95 ceiling is not consistently met.
- [ ] Capture baseline/enabled host model requests to verify token neutrality.
- [ ] Complete Linux/Windows, native Apple/Xcode/SwiftPM, and full host acceptance.
- [ ] Add native cache eviction and scratch expiry; scratch is currently reserved and retained.
- [~] Commit, create the GitHub remote, publish npm with provenance, and run public release checks; requires explicit external authorization.

See [verification](verification.md), [agent integrations](agent-integrations.md), [safety model](safety-model.md), and [performance](performance.md). This file is the repository's authoritative acceptance ledger; the longer work-session design notes are not required for installation or operation.
