# Architecture

## Design rule

The runtime owns storage routing. Agent integrations only make the runtime available to child commands.

```text
agent integration or clean-development run
                    |
             managed shim PATH
                    |
        tool shim resolves current cwd
                    |
      explicit user override still wins
                    |
        real tool, unchanged argv/stdin/out
                    |
       shared cache or checkout build root
```

There is no MCP server. Routing does not need model judgment, a network service, or a new tool schema.

## Runtime components

- `src/config.js` resolves user, project, environment, and command configuration.
- `src/workspace.js` identifies the effective tool workspace and derives a readable stable ID from its canonical path.
- `src/adapters.js` maps a supported tool to documented environment variables.
- `src/runtime.js` materializes versioned shims, resolves the real executable outside the shim directory, and preserves child process semantics.
- `src/state.js` records owned workspace build roots and active process leases.
- `src/integrations.js` adds narrowly owned Claude, Codex, and Grok activation entries.
- `src/cli.js` exposes setup/update, launch, inspection, pinning, pruning, and uninstall commands.

## Why shims

A session can change directories and build several repositories. A static session variable such as `CARGO_TARGET_DIR` would send all of them into one target. A shim sees the actual command cwd and flags at execution time, then chooses the correct Cargo workspace or nearest manifest root.

The shim resolves the real executable from `PATH` while skipping its own directory. It spawns that absolute path without a shell, leaves the shim directory in the child `PATH` for nested supported commands, inherits stdio, forwards termination signals, and returns the child's status.

## Runtime installation

`setup` copies the current package's `bin/`, `src/`, and `package.json` into a versioned application-data directory. Stable launchers refer to that copy. Runtime and launcher receipts contain exact paths and SHA-256 digests, so setup refuses to overwrite an unowned or locally modified file and uninstall removes only unchanged files it recorded. This avoids persistent hooks pointing into a global npm version that may be replaced or an ephemeral `npx` directory that may disappear.

Setup and uninstall share an application-data lock. Runtime synchronization has its own lock, and each owned Cargo workspace has a lock shared by first-build creation, pinning, and prune. Lock, state, runtime, and launcher directories must be real directories at their canonical paths; collection symlinks fail closed. Integration receipts are schema-checked and bound to the agent config paths resolved from the current setup environment before they can authorize an edit. Concurrent setup calls converge on one integration receipt, overlapping Cargo processes receive separate leases, and setup cannot interleave its external config edits with uninstall.

Receipts for superseded runtime versions are archived. Uninstall checks every archived inventory and removes only exact, unchanged owned files. An explicit uninstall also leaves a tombstone so a stale automatic Claude/OpenCode/Pi activation cannot silently reinstall the runtime; a later explicit setup re-enables it.

There is no `postinstall` script. Merely installing or inspecting the npm package makes no configuration changes. Automatic Claude/OpenCode/Pi entry points require an already installed runtime receipt, so plugin discovery before explicit setup is an inert no-op.

## Ownership and pruning

State lives outside the disposable root. Before Cargo output is routed, the runtime atomically creates a direct child containing a random ownership ID. The same ID, source path, workspace ID, exact build root, managed path, last-used time, and pin state are recorded outside the disposable root. A running shim transfers its PID lease to the real child process, so killing the wrapper cannot make a live build look idle. Cache-only tools do not create build records.

Prune requires all of the following:

1. The record is old enough.
2. The workspace is not pinned.
3. No live lease uses the workspace ID.
4. The recorded build root is the build root currently selected by configuration.
5. The candidate is exactly one real directory below that root, without a symlink boundary.
6. Its on-disk marker matches the random ownership ID and workspace identity in state.
7. The same checks still pass immediately before deletion.
8. The user supplied `--apply`; otherwise the command only reports the plan.

Cache and scratch eviction are not implemented in `0.1.0`. Package-manager caches can have their own concurrency and integrity rules and should use native prune commands when an adapter is added.

## Failure behavior

- An existing explicit tool environment variable is preserved.
- An existing Codex or Grok `shell_environment_policy` PATH is not overwritten; setup reports a launcher fallback.
- Codex/Grok PATH persistence removes entries inside the setup cwd, active Python/Conda environments, package-runner bins, and temporary directories; npm/npx setup falls back to a launcher rather than snapshotting its ambient PATH.
- A missing external cache or build base produces a direct error. `setup` and `prepare` require its direct parent to exist; ordinary tool runs never recreate a missing base or select another drive.
- If the real tool cannot be found outside the shim directory, the shim fails with a direct error instead of recursively invoking itself.
- Unregistered directories are never inferred to be owned from names such as `target`, `build`, or `.cache`.
- Uninstall requires receipts at the currently resolved application-data location and the same Claude/Codex/Grok config-home choices used by setup. A changed data-home/XDG or agent config location is reported before any edit rather than followed or treated as an empty successful uninstall.

## Boundaries

This is not complete filesystem isolation. Tools that ignore the routed variable, scripts with absolute output paths, native applications, remote jobs, and unsupported build systems can write elsewhere. A future strict mode would require an actual sandbox, container, or VM with separately designed mount and artifact-export rules.
