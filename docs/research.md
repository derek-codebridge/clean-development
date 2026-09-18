# Research and primary sources

Research was refreshed on 18 September 2026. Links can change; release validation should pin host versions.

## Multi-agent packaging

- [Superpowers 6.3.0 source snapshot](https://github.com/obra/superpowers/tree/b36e0829c6d0140e93cfef2ca599b1b07d4a7797)
- [Superpowers installation matrix](https://github.com/obra/superpowers/blob/b36e0829c6d0140e93cfef2ca599b1b07d4a7797/README.md)
- [Superpowers repository marketplace manifest](https://github.com/obra/superpowers/blob/b36e0829c6d0140e93cfef2ca599b1b07d4a7797/.agents/plugins/marketplace.json)
- [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins)
- [Claude Code plugins](https://code.claude.com/docs/en/plugins)
- [Claude Code hooks and `CLAUDE_ENV_FILE`](https://code.claude.com/docs/en/hooks#persist-environment-variables)
- [Grok Build plugins](https://docs.x.ai/build/features/skills-plugins-marketplaces)
- [Grok Build hooks](https://github.com/xai-org/grok-build/blob/a28ee2b2063426e8816e380ccea528b9de95e5da/crates/codegen/xai-grok-pager/docs/user-guide/10-hooks.md)
- [Gemini CLI extension reference](https://geminicli.com/docs/extensions/reference/)
- [OpenCode plugin documentation](https://opencode.ai/v2/docs/plugins)
- [Pi package documentation](https://github.com/earendil-works/pi/blob/e4ce7b449f4d91589c8760d6fbfa6eaaf82b05fe/packages/coding-agent/docs/packages.md)
- [Pi Bash spawnHook example](https://github.com/earendil-works/pi/blob/e4ce7b449f4d91589c8760d6fbfa6eaaf82b05fe/packages/coding-agent/examples/extensions/bash-spawn-hook.ts)

## Tool storage contracts

- [Cargo home contents](https://doc.rust-lang.org/cargo/guide/cargo-home.html)
- [Cargo build cache and target directory](https://doc.rust-lang.org/cargo/reference/build-cache.html)
- [Go command environment](https://go.dev/cmd/go/)
- [npm package folders](https://docs.npmjs.com/cli/v11/configuring-npm/folders/)
- [npm package `bin`](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#bin)
- [uv cache behavior](https://docs.astral.sh/uv/concepts/cache/)

## OSS and release practice

- [MIT license text](https://spdx.org/licenses/MIT)
- [GitHub community health files](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/creating-a-default-community-health-file)
- [GitHub private vulnerability reporting](https://docs.github.com/en/code-security/concepts/vulnerability-reporting-and-management/repository-security-advisories)
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [npm provenance](https://docs.npmjs.com/generating-provenance-statements/)
- [OpenSSF Scorecard checks](https://github.com/ossf/scorecard/blob/main/docs/checks.md)

## Related projects

- [xdg-ninja](https://github.com/b3nj5m1n/xdg-ninja): detects home-directory clutter and documents relocations.
- [antidot](https://github.com/doron-cohen/antidot): moves dotfiles into XDG paths.
- [kondo](https://github.com/tbillington/kondo): finds and removes build artifacts across project trees.

Clean Development differs by routing newly created, explicitly supported storage from the start and keeping retention limited to registered ownership.
