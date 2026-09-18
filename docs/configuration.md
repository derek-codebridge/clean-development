# Storage and configuration

## User setup

```sh
clean-development setup --root /absolute/path/to/clean-development --agents all
```

User configuration is written to:

- macOS: `~/Library/Application Support/clean-development/config.json`
- Linux: `${XDG_CONFIG_HOME:-~/.config}/clean-development/config.json`
- Windows: `%APPDATA%\clean-development\config.json`

Runtime/state and disposable storage are separate. Platform data, config, and cache locations can be overridden with `CLEAN_DEVELOPMENT_DATA_HOME`, `CLEAN_DEVELOPMENT_CONFIG_HOME`, and `CLEAN_DEVELOPMENT_ROOT`.
Every override must be a non-empty absolute path. Application data/config overrides also refuse the filesystem root and the home directory itself.

Keep the data-home and agent-config choices available for setup updates and uninstall. Receipts that identify owned runtime files and agent edits live in the data home and are bound to the resolved Claude, Codex, and Grok config files. If `CLEAN_DEVELOPMENT_DATA_HOME`, `XDG_DATA_HOME`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `GROK_HOME`, or an equivalent platform location changes, rerun with the original value. A newly resolved empty state location or mismatched agent path is an error, not a successful removal.

## Project configuration

Place `.clean-development.json` at or above the working directory:

```json
{
  "$schema": "https://raw.githubusercontent.com/magrathean-uk/clean-development/main/schemas/project-config.schema.json",
  "schemaVersion": 1,
  "root": "/Volumes/DevCache/clean-development",
  "cacheRoot": "/Volumes/DevCache/caches",
  "buildRoot": "/Volumes/FastSSD/builds/my-app",
  "scratchRoot": "/Volumes/DevCache/scratch",
  "retention": {
    "buildDays": 30
  },
  "tools": {
    "cargo": true,
    "yarn": false
  }
}
```

`retention.buildDays` applies only to registered managed build directories. The scratch root is reserved for explicitly disposable work, but `0.1.0` does not create, register, or prune scratch entries automatically.

All configured paths must be absolute. Filesystem roots and the home directory itself are refused as managed roots.

After adding or changing project paths, prepare their base directories from that project:

```sh
clean-development prepare --dry-run
clean-development prepare
```

`prepare` reads the effective project configuration and does not rewrite user configuration. It creates only each configured leaf and the default children below an already available root. For a split destination such as `/Volumes/FastSSD/builds/my-app`, create and mount `/Volumes/FastSSD/builds` first. Requiring the direct parent prevents a missing external volume from being replaced by a newly created local directory tree.

## Precedence

From highest to lowest:

1. Command options such as `setup --root`.
2. `CLEAN_DEVELOPMENT_ROOT`, `CLEAN_DEVELOPMENT_CACHE_ROOT`, `CLEAN_DEVELOPMENT_BUILD_ROOT`, and `CLEAN_DEVELOPMENT_SCRATCH_ROOT`.
3. The nearest `.clean-development.json` found from the command cwd upward.
4. User configuration.
5. Platform defaults.

Tool variables such as `CARGO_TARGET_DIR`, `GOCACHE`, or `npm_config_cache` have a separate rule: an already-set value is preserved. `CLEAN_DEVELOPMENT_FORCE=1` opts into replacing it for that process.

## Workspace IDs

A Cargo build directory uses the nearest enclosing Cargo workspace root, or the nearest `Cargo.toml` when there is no workspace manifest. Its ID is the root basename plus the first ten hexadecimal characters of a SHA-256 digest of its canonical path, for example `my-app-a81f44c901`. Members of one Cargo workspace share a target tree; separate worktrees get separate mutable output even when their repository and branch names match.

The ID does not include the session, current commit, or branch. Warm builds remain reusable across agent sessions and commits, while the underlying compiler still performs its normal invalidation.

## Moving the root

Run setup again with the new root. New routed work uses the new destination. Existing data is not migrated, adopted, or deleted automatically. This avoids treating unknown prior files as product-owned.

If the root is on an external volume, mount it before running `setup` or `prepare` and before starting the agent. A missing or unwritable volume is an error; normal tool runs never recreate a missing cache or build base and there is no hidden fallback that starts filling the home directory.
