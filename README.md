# clean-development

Keep new development caches and supported build output in one managed place.

`clean-development` is a local, open-source storage router for developers and coding agents. It gives supported tools a predictable cache or build directory without asking the model to remember cleanup rules on every turn.

```text
your agent or terminal
        |
 clean-development shims
        |
  ordinary cargo/go/npm/... commands
        |
  ~/Developer/.artifacts/
    caches/       shared downloads and compiler caches
    builds/       one directory per Cargo workspace or manifest root
    scratch/      reserved scratch space; not pruned in 0.1.0
```

The project is at `0.1.0` and should be treated as an early release. The npm and GitHub names were clear when this repository was prepared, but publication is a separate step.

## Install

After the package is published:

```sh
npm install --global clean-development
clean-development setup --root "$HOME/Developer/.artifacts" --agents all
clean-development doctor
```

Or run setup once with `npx`; setup copies the runtime to a durable application-data directory, so no hook points into npm's temporary `_npx` cache:

```sh
npx clean-development setup --root "$HOME/Developer/.artifacts" --agents all
```

An `npx` process has a temporary, project-influenced `PATH`. Clean Development refuses to save that PATH into Codex or Grok's global configuration and reports their stable launchers instead. Claude's absolute hook and the durable runtime are still installed. For native Codex/Grok activation, run the globally installed command from a fresh shell; otherwise use `clean-development-codex` or `clean-development-grok`.

For this source checkout:

```sh
npm install
npm test
node ./bin/clean-development.js setup --dry-run --root "$HOME/Developer/.artifacts"
```

`setup` is explicit. Installing the npm package does not edit agent settings, install hooks, or move existing files. If a host discovers the bundled Claude, OpenCode, or Pi integration before setup, activation stays dormant: it does not create the runtime, prepend shims, or change a command environment until an installed runtime receipt exists.

## Pick where managed files go

Set one root and get separate cache, build, and scratch areas:

```sh
clean-development setup --root /Volumes/DevCache/clean-development --agents all
```

```text
/Volumes/DevCache/clean-development/
  caches/
    go/build/
    go/modules/
    node/npm/
    python/uv/
    ...
  builds/
    my-app-a81f44c901/
      cargo/target/
  scratch/
```

You can split them when a fast or large volume should hold only build output:

```json
{
  "$schema": "https://raw.githubusercontent.com/magrathean-uk/clean-development/main/schemas/project-config.schema.json",
  "schemaVersion": 1,
  "root": "/Volumes/DevCache/clean-development",
  "buildRoot": "/Volumes/FastSSD/builds/my-app"
}
```

Save that as `.clean-development.json` in the project, or generate the basic file:

```sh
clean-development init --root /Volumes/DevCache/clean-development
clean-development prepare
```

`prepare` creates the effective project's cache/build/scratch base directories without changing user configuration. The direct parent of every external destination must already exist, which makes a missing mount fail instead of silently creating the path on another disk. Precedence is: command-line option, environment variable, project config, user config, platform default.

## Use it with an agent

The runtime activators and launchers do not add bootstrap instructions, MCP schemas, `AGENTS.md` text, or model calls. The optional management skill is explicit-only for Codex and for Claude when installed through the included marketplace manifest; it is not part of command routing. Do not load this repository or npm package root directly with `claude --plugin-dir` or `grok --plugin-dir`: direct-root loading bypasses the marketplace's selected skill/plugin root. Use the marketplace route or `clean-development setup`/the launchers instead.

```sh
clean-development agent codex
clean-development agent claude
clean-development agent grok

# Any other command works too
clean-development run -- my-agent --flag
```

The repository targets the same 13 agent families and 14 named surfaces documented by Superpowers 6.3.0. That describes packaging breadth, not 14 verified native integrations:

| Agent surface | Route included | Current status |
|---|---|---|
| Claude Code | `SessionStart`/`CwdChanged` activation and `clean-development-claude` launcher | Implemented; real-host acceptance pending |
| Antigravity | `clean-development-antigravity` launcher; Claude-compatible metadata | Launcher smoke passed with `agy` 1.2.6; model workflow pending |
| Codex App | `shell_environment_policy` activation; Codex plugin and marketplace metadata | Implemented; app restart/sandbox acceptance pending |
| Codex CLI | `shell_environment_policy` activation and `clean-development-codex` launcher | Config parsed and launcher smoke passed with 0.154.0; model workflow pending |
| Cursor | Cursor manifest and `clean-development-cursor` launcher | Launcher/package route only; acceptance pending |
| Devin CLI | Devin manifest and `clean-development-devin` launcher | Launcher/package route only; acceptance pending |
| Factory Droid | `clean-development-droid` launcher; Claude-compatible metadata | Launcher/package route only; acceptance pending |
| Gemini CLI | Context-free extension manifest and `clean-development-gemini` launcher | Launcher smoke passed with 0.54.4; model workflow pending |
| GitHub Copilot CLI | `clean-development-copilot` launcher; Claude-compatible metadata | Launcher smoke passed with 1.0.80; model workflow pending |
| Grok Build CLI | Shell-environment activation, plugin metadata, and `clean-development-grok` launcher | Config parsed, skill-free marketplace package installed, and launcher smoke passed with 1.0.34; model workflow pending |
| Kimi Code | Kimi manifest and `clean-development-kimi` launcher | Launcher/package route only; acceptance pending |
| OpenCode | `shell.env` plugin and `clean-development-opencode` launcher | Implemented but host-version-dependent; acceptance pending |
| Pi | Bash `spawnHook` extension and `clean-development-pi` launcher | Implemented; package acceptance pending |
| Hermes Agent | Hermes manifest and `clean-development-hermes` launcher | Launcher/package route only; acceptance pending |

Here, a zero-context launcher means a small local executable that prepends the shim directory to `PATH` and starts the CLI. It injects no prompt text. A manifest is distribution metadata only; it does not prove that a host installed the package or passed the environment to its shell. See [agent integrations](docs/agent-integrations.md) for exact routes and release gates.

## Supported tools

The current shims route only native cache/output settings that have a clear ownership boundary. Existing explicit environment values win unless `CLEAN_DEVELOPMENT_FORCE=1` is deliberately set.

| Command | Routed storage |
|---|---|
| `cargo` | Per-checkout `CARGO_TARGET_DIR` |
| `go` | Shared `GOCACHE` and `GOMODCACHE` |
| `npm`, `npx` | Shared npm cache |
| `pnpm` | Shared npm cache and pnpm store |
| `yarn` | Shared Yarn cache |
| `bun` | Shared Bun install cache |
| `uv` | Shared uv cache |
| `pip`, `pip3` | Shared pip cache |
| `dotnet` | Shared NuGet packages |
| `composer` | Shared Composer cache |
| `ccache`, `sccache` | Shared native compiler cache |

`node_modules`, Python virtual environments, final Go binaries, release archives, Xcode archives, installed Rust toolchains, credentials, and arbitrary framework output are not moved. Those paths can be semantically important. More adapters should be added only with compatibility tests.

## Commands

```sh
clean-development setup --dry-run --root /path/to/artifacts
clean-development setup --root /path/to/artifacts --agents claude,codex,grok
clean-development update --json
clean-development prepare --dry-run
clean-development prepare
clean-development status --json
clean-development status --sizes
clean-development doctor --json
clean-development env --tool npm --format sh
clean-development prune --older-than 30d --json
clean-development prune --older-than 30d --apply
clean-development pin my-app-a81f44c901
clean-development uninstall --dry-run
clean-development uninstall
```

`prune` is a dry run unless `--apply` is present. It considers only registered, direct children of a recorded managed build root, and skips active or pinned workspaces. Uninstall removes owned integrations and launchers but retains configuration and managed data. Run uninstall with the same `CLEAN_DEVELOPMENT_DATA_HOME`/XDG data location and the same `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, and `GROK_HOME` choices used by setup. A mismatch fails visibly before editing agent files instead of following a receipt to a different path or claiming that anything was removed.

`update` refreshes the durable runtime and re-applies the currently configured agent integrations. Without `--agents`, it preserves the agent selection recorded by setup; use `--agents` explicitly to change that selection.

An explicit `--agents` selection also deactivates previously owned native integrations for omitted agents, while preserving unrelated configuration. Shared runtime launchers remain available for later selection.

`env --tool` is for shared cache-only adapters. Cargo must run through the shim or `clean-development run -- cargo …` so its per-workspace directory has an ownership receipt and an active-build lease.

## What it does not promise

- It does not clean or adopt existing clutter during installation.
- It is routing, not a filesystem sandbox. An application can still write an absolute path elsewhere.
- It does not relocate mixed state such as `CARGO_HOME`, which may contain credentials, config, installed binaries, and caches together.
- It does not claim that every language or framework can move every build file safely.
- It does not promise zero total billed tokens without host-level measurement. The measurable contract is zero product-injected prompt content and zero extra model/tool calls in normal CLI mode.

Read [the master plan](docs/master-plan.md), [the architecture](docs/architecture.md), [storage and configuration](docs/configuration.md), [the safety model](docs/safety-model.md), and [current verification status](docs/verification.md) before extending or relying on an adapter.

## Contributing and security

This repository is MIT licensed. Contributions are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md), [GOVERNANCE.md](GOVERNANCE.md), and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

Please do not report deletion, path traversal, command injection, configuration corruption, or release-chain vulnerabilities in a public issue. Follow [SECURITY.md](SECURITY.md).

## Prior art and source material

The packaging approach was informed by [Superpowers](https://github.com/obra/superpowers), while deliberately avoiding its prompt-bootstrap design. Related tools include [xdg-ninja](https://github.com/b3nj5m1n/xdg-ninja), [antidot](https://github.com/doron-cohen/antidot), and [kondo](https://github.com/tbillington/kondo). Clean Development focuses on preventing new managed output from scattering, not scanning and deleting arbitrary existing directories.

Agent and tool behavior is based on primary documentation linked in [docs/research.md](docs/research.md).
