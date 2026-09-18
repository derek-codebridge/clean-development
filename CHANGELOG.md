# Changelog

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Compatibility can still change during `0.x` releases.

## [Unreleased]

### Added

- Managed cache, build, and scratch roots with user, project, and environment configuration.
- Explicit `update` command for refreshing the durable runtime and configured agent integrations without changing the selected agent set.
- Per-checkout Cargo targets and shared caches for Go, Node package managers, Python package managers, .NET, Composer, ccache, and sccache.
- Zero-context agent launchers for 13 agent families and native adapters for Claude, Codex, Grok, OpenCode, and Pi.
- Active leases, workspace registry, pinning, and explicit dry-run-first pruning.
- Safe project-root preparation, mount-loss failure behavior, per-workspace mutation locks, and ownership-verified versioned uninstall receipts.
- Stable agent PATH activation with duplicate removal and npm/npx launcher fallback instead of persisting transient package-runner paths.
- Agent integration receipts bound to the exact config locations selected during setup, with fail-closed uninstall behavior.
- Explicit-only Claude and Codex management skills plus a skill-free Grok marketplace package.
- Portable, Codex, Claude-compatible, Cursor, Devin, Gemini, Grok, Kimi, Pi, OpenCode, and Hermes packaging metadata.
- Isolated tests, OSS governance, security, contribution, and release documentation.

### Fixed

- Explicit `setup --agents` selections now deactivate previously owned Claude, Codex, and Grok integrations that are no longer selected, while preserving unrelated configuration.
- Codex repo marketplace metadata now uses the current local `source` / `path` schema and is covered by the package check.
