---
name: clean-development
description: Configure, inspect, diagnose, or explicitly prune storage managed by clean-development. Use for clean-development setup and storage questions, not for ordinary builds, tests, or package installs.
---

# Clean Development

Use the deterministic `clean-development` CLI. Do not add storage instructions to project guidance, rewrite arbitrary shell commands, or invoke this skill during ordinary development.

- For setup or a changed storage destination, run `clean-development setup --dry-run` first, show the resolved cache/build/scratch roots, then run setup only when the user requested the change.
- For diagnosis, start with `clean-development status --json` and `clean-development doctor --json`. Preserve explicit user environment overrides.
- For cleanup, run `clean-development prune --json` first. Only add `--apply` when the user explicitly asked to remove the listed managed build directories.
- Never delete outside paths registered by clean-development. Treat source, credentials, toolchains, release deliverables, and unregistered directories as externally owned.
- Use `clean-development run -- <agent>` or `clean-development agent <name>` when a host lacks a verified environment adapter. Do not inject prompt bootstrap text as a substitute.
