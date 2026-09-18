# Roadmap

## Before the first public release

- Run the npm tarball through isolated global and `npx` installation tests on macOS and Linux.
- Verify Claude Code, Codex CLI/App, Grok Build, OpenCode, Gemini CLI, and Pi using real processes.
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
