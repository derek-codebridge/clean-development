---
name: clean-development
description: Configure, inspect, diagnose, or explicitly prune storage managed by clean-development. Use for clean-development setup and storage questions, not for ordinary builds, tests, or package installs.
---

# Clean Development

Use the deterministic `clean-development` CLI. Do not add storage instructions to project guidance, rewrite arbitrary shell commands, or invoke this skill during ordinary development.

- On the first use for a repository, run `clean-development session --dry-run --json`. This is read-only. Show the detected tools, managed destinations, preserved overrides, conflicts, and the exact proposed `.clean-development.json`, then ask the user to choose **session only**, **save project settings**, or **skip**.
- Treat an installed native integration's default `CLEAN_DEVELOPMENT_SESSION_MODE=skip` as consent pending, not as a previous user decision. Do not switch it to routing until the user answers the first-use choice above. An effective project setting of `enabled: false` remains skip without another prompt.
- Do not treat permission to edit application source as permission to save Clean Development settings. After approval, use `clean-development session --session persist --json` only for the save choice. The standalone `session` command can prepare storage but cannot change the environment of an already-running agent.
- Session-only may create managed directories outside the repository but must not write repository files. Persist may create only the exact reviewed `.clean-development.json`; it must not edit `.env`, `.envrc`, `.gitignore`, manifests, build files, or guidance. Skip performs no setup and means Clean Development should not be used for that task.
- For work inside the current agent, execute development commands as routed children with `clean-development run --session session-only -- COMMAND...`, or relaunch the agent through `clean-development agent NAME`. For skip, use the same wrapper with `--session skip` or leave Clean Development out of the task. After saving project settings, current-agent commands still need the routed wrapper or a relaunch.
- When starting an agent through `clean-development agent`, the launcher performs the same prompt. Noninteractive launches default to session-only and never infer permission to persist.
- For setup or a changed storage destination, run `clean-development setup --dry-run` first, show the resolved cache/build/scratch roots, then run setup only when the user requested the change.
- For diagnosis, start with `clean-development status --json` and `clean-development doctor --json`. Preserve explicit user environment overrides.
- For cleanup, run `clean-development prune --json` first. Only add `--apply` when the user explicitly asked to remove the listed managed build directories.
- Never delete outside paths registered by clean-development. Treat source, credentials, toolchains, release deliverables, and unregistered directories as externally owned.
- Use `clean-development run -- <agent>` or `clean-development agent <name>` when a host lacks a verified environment adapter. Do not inject prompt bootstrap text as a substitute.
