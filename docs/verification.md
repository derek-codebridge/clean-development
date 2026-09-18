# Verification status

Snapshot: 18 September 2026 on macOS 27.0, Apple silicon.

## Passed locally

- The automated Node suite currently passes 80 tests covering config precedence, workspace identity, explicit overrides, all 14 declared adapter destinations, npm default-cache handling, dormant pre-setup plugins, durable runtime setup/update, PATH persistence safety, state/runtime symlink containment, receipt validation and path binding, idempotent Claude/Codex/Grok integration, explicit agent-selection deactivation, byte-preserving config removal, concurrent setup/builds/preparation, uninstall preservation, child-process ownership leases, prune containment, top-level run routing, real executable resolution, arguments, and exit status.
- Real no-network tool smoke fixtures:
  - Cargo 1.98.1: `cargo check` wrote no project-local `target` and used the managed checkout target.
  - Go 1.27.1: `go test ./...` used the managed build cache.
  - npm 11.19.1: a package script ran and `npm config get cache` resolved to the managed cache.
  - uv 0.12.12: `uv cache dir` resolved to the managed cache.
- `npm pack` file-list inspection of 55 files, install into an empty prefix, packaged executable version check, and import checks for both package exports.
- Generated Codex TOML parsed successfully with Codex CLI 0.154.0 (`config.load=ok`), and generated Grok TOML parsed with Grok 1.0.34. These are configuration parser checks, not model-backed workflow acceptance.
- The repo-local Codex marketplace passed an isolated Codex CLI 0.154.0 add/install/list flow with the current `source: local` / `path: ./` marketplace schema. This does not prove desktop plugin-browser entitlement or model-backed workflow acceptance.
- The packed Grok marketplace route passed an isolated Grok 1.0.34 add/install/list/details flow; its installed plugin reported zero skill, command, and agent directories.
- Version/argv/exit launcher smoke passed against installed Antigravity (`agy` 1.2.6), Codex 0.154.0, Gemini 0.54.4, Copilot 1.0.80, and Grok 1.0.34. OpenCode exited 137 both directly and through the launcher, so it is not counted as accepted.
- Plugin Creator validation of `.codex-plugin/plugin.json` and Skill Creator validation of the explicit-only management skill.
- No npm runtime dependencies and `npm audit` reported zero vulnerabilities for the lockfile.

Run the core automated repository checks with:

```sh
npm run check
npm test
npm run smoke:tools
npm run test:package
npm run benchmark:overhead
```

The plugin/skill validators and dependency audit are separate checks:

```sh
python3 /path/to/plugin-creator/scripts/validate_plugin.py .
python3 /path/to/skill-creator/scripts/quick_validate.py skills/clean-development
npm audit --omit=dev --audit-level=low
```

The named agent parser and launcher observations above are host-specific manual smoke checks, not part of the npm scripts.

## Not yet proven

- A real process acceptance run for every advertised agent surface.
- Codex App restart/shell snapshot behavior and sandbox writable-root interaction.
- Claude subagents, resume, fork, and CwdChanged behavior outside isolated hook fixtures.
- Grok's actual shell process after config changes and a model-backed workflow.
- OpenCode variants that currently do not apply `shell.env` to their development Bash tool.
- Pi package installation against a released npm tarball.
- Claude, Cursor, Devin, Droid, Kimi, OpenCode, Pi, and Hermes launcher/package smoke runs.
- Linux and Windows behavior, concurrent real worktrees, external-volume loss, symlink races, and disk-full conditions.
- Host-level model request captures needed to certify billed-token neutrality.

These gaps are release gates, not hidden behind a generic "supported" badge. The launcher and package files exist for the full Superpowers-sized matrix; native behavior is advertised separately.
