# Roadmap

## v0.2 follow-up

- Keep the v0.2.0 session acceptance matrix current: read-only plan, terminal choices, noninteractive session-only default, exact reviewed project-file persistence, skip without routing, and static cache/dynamic Cargo behavior.
- Repeat isolated test-account Codex and Grok acceptance when their host versions change. Final v0.2.0 source/package evidence is recorded in [verification](docs/verification.md).
- Run public-registry global and `npx` installation checks after the first npm publication.
- Complete real-process verification for Claude Code, Codex App, OpenCode, Gemini CLI, and Pi. Earlier Codex CLI and short Antigravity workflows passed. Grok 1.0.34 passed model-shell routing after the owned command prefix repaired login-PATH replacement; its broader session/resume coverage remains open.
- Capture model-facing requests where the host permits it and confirm that normal runtime activation adds no prompt content or tool calls.
- Benchmark shim overhead, cold/warm cache reuse, concurrent worktrees, and external-volume failure behavior.
- Enable GitHub private vulnerability reporting and npm trusted publishing.

## Later adapters

- SwiftPM scratch paths and Xcode DerivedData with separate treatment for archives and release evidence.
- Maven, Gradle, CMake, Bazel, Ruby, Elixir, Dart, and framework-specific output only after upstream-compatible proofs.
- Windows process, path, signal, and agent integration verification.
- Optional idle maintenance after safe active-process and offline behavior is demonstrated.

## Non-goals

- Scanning and deleting arbitrary existing home-directory clutter.
- Replacing language package managers or build systems.
- Treating hooks or PATH shims as a complete filesystem sandbox.
