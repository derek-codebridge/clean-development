# Safety model

Clean Development changes paths used by compilers and package managers and can delete old managed build directories when explicitly asked. The design therefore treats ownership evidence as more important than convenient discovery.

## Assets to protect

- source code and Git metadata;
- credentials, package-manager configuration, signing material, and toolchains;
- final release artifacts and QA evidence;
- unrelated agent settings and hooks;
- active builds and long-running development servers;
- command arguments, prompts, transcripts, and private repository names.

## Trust boundaries

The local user chooses the managed root and runs setup. Tool shims execute with that user's permissions. Project configuration is repository-controlled and therefore untrusted until the project itself is trusted. Agent plugin packages and the npm/GitHub release chain are supply-chain boundaries.

## Controls

- Broad roots such as `/` and the home directory are rejected.
- Prune candidates come from state created during an actual routed Cargo build, not a filesystem name scan or cache-only command.
- A candidate must be a real direct child of the currently configured build root, and its random on-disk ownership marker must match the state receipt.
- Ownership, age, pin, and active-lease checks are repeated immediately before deletion.
- Active PID leases and pins block pruning.
- Prune defaults to reporting; deletion requires `--apply`.
- Existing tool variables and agent PATH policies are preserved by default.
- Codex/Grok PATH snapshots omit the current project, active virtual/Conda environments, temporary paths, and `node_modules/.bin` entries; npm/npx setup falls back to stable launchers instead of persisting a package-runner PATH.
- Setup and uninstall share a stale-recoverable lock; runtime synchronization and per-workspace mutation are also serialized, while concurrent first builds use atomic directory publication.
- State collections, lock directories, runtime roots, and launcher directories reject symlinks and non-canonical paths. Unknown lease and archived-receipt files are retained rather than interpreted or deleted.
- Missing managed base roots are not recreated during ordinary builds, reducing the risk of filling the wrong disk when an external volume disappears.
- Runtime uninstall verifies exact path and SHA-256 receipts and leaves modified or unrelated files in place.
- Agent integration receipts are schema-checked, ownership-marker-checked, and bound to the Claude/Codex/Grok config path resolved from the setup environment. A changed config home fails closed before any agent file is edited.
- Plugin lifecycle entry points remain dormant until explicit setup has installed a runtime receipt; the management skill is user-invoked only in Claude and Codex metadata.
- Child tools are spawned without a shell; argv is not joined or reparsed.
- State contains paths, IDs, timestamps, tool names, and PIDs—not command bodies or prompts.
- npm installation has no lifecycle mutation.
- GitHub Actions use least-privilege permissions and commit-pinned actions.

## Residual risks

A compromised local project can execute arbitrary package scripts with the user's existing permissions. A malicious tool can ignore its cache variable. PID reuse can make a stale lease appear active, which causes retention rather than deletion. A user can place valuable files inside a product-owned managed build directory; explicit prune can then remove them. Same-user adversarial filesystem races, disk-full interruption, and hostile network filesystems still need broader testing before a stable release.

Report vulnerabilities through [SECURITY.md](../SECURITY.md).
