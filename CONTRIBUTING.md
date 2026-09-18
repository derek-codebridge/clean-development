# Contributing

Thanks for improving Clean Development.

## Before coding

Open an issue for a new ecosystem adapter, destructive behavior, configuration format change, or public CLI change. Small bug fixes and documentation corrections can go straight to a pull request.

An adapter needs evidence that its environment variable or flag is supported by the upstream tool and that moving the path does not change build semantics. Do not classify a mixed config/credential/toolchain home as disposable storage.

## Local checks

Use Node 20.12 or newer:

```sh
npm install
npm run check
npm test
npm pack --dry-run --json
```

Tests must use temporary homes, roots, fixtures, and fake toolchains. Do not run setup or prune against a contributor's real home directory from the test suite.

## Pull requests

- Keep changes focused and explain the storage behavior being changed.
- Add behavior tests for routing, ownership, concurrency, or failure handling.
- Preserve argv, cwd, stdio, TTY behavior, signals, and exit status in launchers.
- Preserve explicit user environment and unrelated agent configuration.
- Update the README, schema, changelog, and agent matrix when the public contract changes.
- Never add postinstall configuration mutation, prompt bootstrap text, telemetry, command recording, or an automatic deletion schedule.

Use a private security report for vulnerabilities. See [SECURITY.md](SECURITY.md).

## Licensing

By submitting a contribution, you agree that it is licensed under this repository's MIT License. Contributors retain copyright in their work. No CLA or DCO is required at this stage.
