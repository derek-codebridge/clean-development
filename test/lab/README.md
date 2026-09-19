# Offline fixture lab

Run from the repository with locally installed Node/npm, Cargo/Rust, and Go:

```sh
node scripts/run-fixture-lab.mjs
# Or choose a new directory whose parent already exists:
node scripts/run-fixture-lab.mjs --output /absolute/path/to/new-lab
```

The runner supports macOS and Linux. It copies these fixtures into separate baseline and routed projects under a fresh disposable directory. Each mode gets its own child-process home, temporary directory, package-manager configuration, and caches. The parent shell environment and installed agent settings are untouched. `--output` refuses an existing directory. Results remain available for inspection; remove the printed lab directory when finished.

| Fixture | Work performed | Storage assertions |
|---|---|---|
| Rust | Library plus CLI workspace; local path dependency; three arithmetic cases; CLI run | Baseline `target` is project-local; routed output is in a managed build directory and no project `target` appears |
| Node | Pack the bundled local dependency into a tarball, install offline, verify three cases, run app | Both npm caches contain content; routed cache uses the managed root; `node_modules` remains local; both tarballs have the same SHA-256 |
| Go | Standard-library-only module plus CLI; table-driven arithmetic tests; build and run executable | Build cache contains files and routed caches use managed paths; final executable stays in project `bin` |

The Node source files use `.mjs.fixture` in this repository so `node --test` cannot accidentally execute a fixture before its dependency has been packed. The runner removes the `.fixture` suffix while copying. The resulting project is an ordinary Node package.

Cargo uses offline mode, npm packs/installs only the local tarball with lifecycle scripts disabled, and Go uses `GOPROXY=off`, `GOSUMDB=off`, and `GOTOOLCHAIN=local`. No dependencies or toolchains are downloaded. Installed toolchain executables are reused; Rustup may read the existing `RUSTUP_HOME`, with automatic toolchain installation disabled. This is process/configuration isolation, not a VM or a network/filesystem sandbox.

`report.json` records tool paths and versions, exact argument arrays, working directories, isolated environment values, stdout/stderr, exits/signals, elapsed times, artifact locations, file counts, and checks. Missing tools produce explicit skipped cases and a failing overall exit status. A failure in one language does not hide results from the other languages. The standard-library-only Go fixture exercises the build cache and module-cache destination; it does not populate the module download cache.

For a later Codex, Grok, or Antigravity session, use a fresh copy of one of the materialized projects and the corresponding isolated environment from the report. Give the same small task to each host: add and test a `subtract` function, update the CLI to print `difference=2` for `7 - 5`, then run that project's normal tests and app command. Keep separate baseline and routed copies. Compare the command transcript, task result, exit status, and artifact locations against this runner's evidence. A host session must separately prove shell inheritance and routing; this runner launches no agents and does not establish host integration acceptance.

## Session-choice acceptance

Use a new evidence directory and a fresh project copy for each choice. Record the source manifest and installed tarball hash before running the v0.2.0 commands:

```sh
clean-development session --dry-run --json
clean-development run --session session-only -- cargo test --offline
clean-development run --session persist -- cargo test --offline
clean-development run --session skip -- cargo test --offline
```

Assert that dry-run changes nothing. Session-only must create no `.clean-development.json` and must place Cargo output under the managed build root. Persist must create exactly the JSON reviewed by dry-run; an existing file must remain byte-for-byte unchanged. Skip must use the direct tool environment, create no Clean Development runtime/storage, and leave any existing owned data intact. On the clean Rust fixture its target should match the direct baseline. Compare directories before and after each run so previously generated files cannot make a failing route appear successful.

Exercise the interactive decision through injected input/output or a choice function in automated tests; cover explicit choices, Enter/default, invalid input, EOF, and nested mode inheritance without timed pseudo-terminal input. Also launch the public CLI with noninteractive stdin to verify its session-only default. A manual terminal launch checks that the displayed plan and three choices are readable before the agent starts.

For real Codex acceptance, run as the existing isolated macOS `test` account with fresh project, configuration, state, cache, and artifact paths. Use the final installed package and an ephemeral model session. Record the actual Codex version/model, permitted sandbox roots, and configuration/authentication boundary; do not treat an isolated setup `CODEX_HOME` as proof that the model session read no account-level configuration. The previous successful sandbox allowed both application data/state and managed artifacts. The new session choice does not grant those sandbox permissions.

Start with `clean-development agent codex --session session-only -- ...` and the Rust task above; retain a terminal-choice transcript separately. Verify the actual shell command, `command -v cargo`, `CLEAN_DEVELOPMENT_ACTIVE`, `cargo metadata --no-deps --format-version 1`, tests, and absence of project-local `target`. Static cache variables should appear in the child environment for detected cache adapters, while `CARGO_TARGET_DIR` is selected by each Cargo shim invocation. A second working directory confirms Cargo is not pinned to the launch directory. Grok and Antigravity can reuse the same fixture and evidence format, with their host-specific lifecycle limitations recorded separately.
