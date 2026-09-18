# Agent integrations

Clean Development follows Superpowers' 13-family, 14-surface repository shape but not its prompt-bootstrap strategy. Coverage in this document means that a distribution or launch route is present. It does not mean that every host has passed end-to-end acceptance.

## Support levels

- **Native activation code:** the host has a documented environment mechanism implemented here. Every such route is still experimental until the named host/version passes the acceptance fixture.
- **Zero-context launcher:** `clean-development agent NAME` starts the CLI with the shim path. It adds environment variables, not prompt text, MCP tools, or model calls. A shipped launcher is not a claim that the host executable has been smoke-tested.
- **Package metadata:** a manifest is present for that host or a documented compatibility format. Discovery alone does not prove installation, activation, or shell inheritance.

| Family / surface | Native activation code | Zero-context launcher | Package metadata | Evidence boundary |
|---|---|---|---|---|
| Claude Code | Shipped: `SessionStart`; plugin also uses `CwdChanged` | `clean-development-claude` | Claude plugin | Isolated fixtures pass; real-host acceptance pending |
| Antigravity | None | `clean-development-antigravity` | Claude-compatible | Launcher smoke passed with `agy` 1.2.6; model workflow pending |
| Codex App | Shipped: `shell_environment_policy` | Not applicable to the GUI | Codex plugin and repo marketplace | Restart, sandbox, and shell snapshot acceptance pending |
| Codex CLI | Shipped: `shell_environment_policy` | `clean-development-codex` | Codex plugin and repo marketplace | Config parser and launcher smoke passed with 0.154.0; model workflow pending |
| Cursor | None | `clean-development-cursor` | Cursor manifest | Launcher/package route only; acceptance pending |
| Devin CLI | None | `clean-development-devin` | Devin manifest | Launcher/package route only; acceptance pending |
| Factory Droid | None | `clean-development-droid` | Claude-compatible | Launcher/package route only; acceptance pending |
| Gemini CLI | None | `clean-development-gemini` | Gemini extension without context or hooks | Launcher smoke passed with 0.54.4; model workflow pending |
| GitHub Copilot CLI | None | `clean-development-copilot` | Claude-compatible | Launcher smoke passed with 1.0.80; model workflow pending |
| Grok Build CLI | Shipped: shell-environment policy | `clean-development-grok` | Claude-compatible plugin and Grok marketplace | Config parser, skill-free marketplace install, and launcher smoke passed with 1.0.34; model workflow pending |
| Kimi Code | None | `clean-development-kimi` | Kimi manifest | Launcher/package route only; acceptance pending |
| OpenCode | Shipped: `shell.env` | `clean-development-opencode` | npm/OpenCode plugin | Host-version-dependent; real-host acceptance pending |
| Pi | Shipped: Bash `spawnHook` | `clean-development-pi` | npm/Pi extension | Source fixture only; package acceptance pending |
| Hermes Agent | None | `clean-development-hermes` | Hermes manifest | Launcher/package route only; acceptance pending |

## Setup behavior

```sh
clean-development setup --agents claude,codex,grok
```

Installing or enabling plugin metadata alone does not activate routing. Claude, OpenCode, and Pi lifecycle code first checks for the runtime receipt created by explicit setup and otherwise returns without creating files or changing `PATH`.

- Claude: merges one owned SessionStart hook into `~/.claude/settings.json`, preserving unrelated hooks.
- Codex: adds a marked block to `~/.codex/config.toml` only when it can do so without replacing an explicit PATH policy.
- Grok: applies the same conservative block to `~/.grok/config.toml`.
- Every selected CLI family receives a stable `clean-development-AGENT` launcher in the application-data `bin` directory. The `codex` launcher is for Codex CLI, not the Codex App GUI.

Codex and Grok require a complete PATH value in their TOML environment policy. Setup removes duplicate shim entries, the current project and its descendants, active virtual/Conda environments, temporary directories, and `node_modules/.bin` paths before persisting it. When setup is itself running under npm/npx, it does not write a native PATH block at all because the package runner's PATH is transient and can be project-controlled; it returns the stable launcher route instead. Run a global installation from a fresh shell when native activation is wanted.

Running setup again is idempotent. Uninstall removes only marked or recognizably owned entries, and retains storage/configuration.

When `--agents` is supplied explicitly, it is a selection: previously owned native integrations for agents omitted from the list are removed safely, while unrelated configuration remains. The shared runtime launchers remain available for later selection.

Setup updates and uninstall must resolve the same agent configuration locations used by the original setup. If `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, or `GROK_HOME` changes, the receipt is rejected before any agent file is edited. Rerun the command with the original values; this binding prevents a modified receipt from redirecting removal to an arbitrary file.

## Skills and token use

The management skill is narrowly scoped to setup, status, diagnosis, and explicit pruning. Codex uses `skills/clean-development` with an `agents/openai.yaml` policy that disables implicit invocation. The Claude marketplace explicitly replaces root skill discovery with `claude-skills/`, whose copy uses `disable-model-invocation: true`, so Claude does not place its description in normal model context. The Grok marketplace points at the dedicated `.grok-plugin/` package, which intentionally contains no skills directory; management stays CLI-only there. The skill is not needed for routing, is never invoked by a shim, and does not tell an agent how to build software.

The Codex plugin manifest must include a `defaultPrompt` field for the host schema. Its only entry is explicitly worded as an opt-in UX suggestion (`Use Clean Development only when explicitly requested.`); it is not a startup hook, session bootstrap, or normal routing context.

The npm CLI path uses no skill at all. For the advertised token-neutral plugin routes, install Claude and Grok through their included marketplace manifests. Do not point `claude --plugin-dir` or `grok --plugin-dir` at the repository or npm package root: direct-root loading bypasses the marketplace's selected skill/plugin root and may discover the root Codex management skill. Other plugin hosts may catalogue bundle metadata according to their own rules; if even catalogue metadata is unacceptable, use only the npm CLI and launcher.

### Codex desktop access errors

If the Codex desktop plugin browser reports `access_programs` is not enabled for the organization, the failure is in the signed-in workspace's plugin entitlement, not in this package. OpenAI documents plugin availability as a workspace control for desktop surfaces, while Codex CLI has its own local marketplace browser. There is no package-side switch that can bypass the organization gate.

Use the npm/launcher route while that entitlement is unavailable. From this checkout:

```sh
node ./bin/clean-development.js setup --root /absolute/path/to/managed-artifacts --agents codex
```

After the package is published, the equivalent is `npx clean-development setup --root /absolute/path/to/managed-artifacts --agents codex`.

For a checkout, the Codex CLI route is independent of the desktop browser:

```sh
codex plugin marketplace add /absolute/path/to/clean-development
codex plugin add clean-development@clean-development-dev
```

The second route installs the local plugin without adding prompt text or making model calls. A workspace owner/admin must enable plugin access if the desktop marketplace is required.

## Acceptance status

The repository includes isolated adapter tests, but real host acceptance and model-request captures remain release gates. See [ROADMAP.md](../ROADMAP.md). Until a named host/version passes those gates, describe both its launcher and native route as shipped but unverified; prefer the launcher when a CLI is available because it does not depend on host plugin lifecycle behavior.
