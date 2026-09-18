# Launch posts

Use these only after the GitHub repository and npm package are public and the named integrations have passed real smoke tests. Replace any status sentence that is no longer true.

## Reddit post

### Title

I built clean-development because coding agents kept leaving Cargo, Go and npm rubbish everywhere

### Body

I got fed up with development tools quietly filling random bits of my machine.

Cargo targets in one repo, Go caches somewhere else, npm/npx caches growing in the background, then another agent session starts and adds more of the same.

So I built **clean-development**. It is an open-source npm CLI that routes new supported build output and caches into one managed root:

```sh
npm i -g clean-development
clean-development setup --root "$HOME/Developer/.artifacts" --agents all
```

That gives you separate `caches/`, `builds/` and `scratch/` folders. Shared downloads stay reusable, while mutable Cargo output is split per workspace/worktree so two projects do not trample each other.

The important bit for me: this is runtime code, not another instruction prompt. Normal use adds no prompt bootstrap, MCP tools, model calls or extra agent tool calls. The shims work out the actual cwd when `cargo`, `go`, `npm`, `uv`, etc. run.

It ships package or launch routes for the same 13 agent families / 14 surfaces currently listed by Superpowers, including Claude Code, Codex App/CLI, Grok Build, Cursor, Gemini, OpenCode and Pi. CLI hosts can use a zero-context launcher. Native hook paths are separate, and I am only calling a named host supported after its real process passes the acceptance tests.

It also does **not** scan and delete the mess you already have. I wanted prevention first. Pruning is limited to build directories the tool created and registered, it is a dry run by default, and active or pinned workspaces are skipped.

Repo: https://github.com/magrathean-uk/clean-development  
npm: https://www.npmjs.com/package/clean-development

It is early, MIT licensed, and I would genuinely like feedback on two things: which toolchain should get the next properly tested adapter, and which normal project workflow breaks when its build directory moves?

I built it, so yes, this is self-promotion. No signup, no paid tier, no telemetry.

## Short showcase-thread version

I built **clean-development**, an MIT-licensed npm CLI for keeping AI-assisted development caches and build output under one managed root.

It routes supported Cargo/Go/npm/pnpm/uv/etc. storage at runtime, keeps shared caches reusable, and separates mutable Cargo builds per workspace. It does not inject prompts or add MCP/model calls, and it does not scan/delete existing home-directory clutter.

```sh
npm i -g clean-development
clean-development setup --root "$HOME/Developer/.artifacts" --agents all
```

Repo: https://github.com/magrathean-uk/clean-development

I would love a real-world breakage report, especially from monorepos or multiple worktrees.

## X post

> coding agents are brilliant at building things — and leaving Cargo, Go and npm rubbish everywhere.
>
> I built clean-development: new build/cache files go under one managed root. no prompt injection, no MCP, no telemetry.
>
> MIT OSS: https://github.com/magrathean-uk/clean-development

This is 279 characters. Attach a short terminal clip showing setup, a Cargo build, the external target directory, and `clean-development status --sizes`.

## Where to post

Rules and current threads were checked on 18 September 2026. Recheck them on the day because weekly links and moderation rules change.

Best first choices:

1. [r/ClaudeCode weekly showcase](https://www.reddit.com/r/ClaudeCode/comments/1wg0ux6/weekly_showcase_thread_what_are_you_building_with/) — use the short version unless writing a substantial standalone technical post.
2. [r/codex weekly showcase](https://www.reddit.com/r/codex/comments/1wh7ty9/show_us_all_what_youve_been_building_with_codex/) — post after the Codex App/CLI smoke test and explain that integration specifically.
3. [r/ChatGPTCoding weekly self-promotion thread](https://www.reddit.com/r/ChatGPTCoding/comments/1wfx3k5/weekly_self_promotion_thread/) — state the problem, supported tools, affiliation, and feedback request.
4. [r/ClaudeAI created-with-Claude thread](https://www.reddit.com/r/ClaudeAI/comments/1w5q6dx/show_us_what_youve_created_with_claude/) — use the thread; its standalone showcase rules are stricter.
5. [r/npm](https://www.reddit.com/r/npm/) — use its self-promotion flair after the package is live.
6. [r/opensource](https://www.reddit.com/r/opensource/) — good for the MIT/safety design; participate normally rather than using the account as a link feed.
7. [r/SideProject](https://www.reddit.com/r/SideProject/) — use the requested plain title format and attach a real terminal demo.
8. [r/github self-promotion megathread](https://www.reddit.com/r/github/comments/1jy8rea/promote_your_projects_here_selfpromotion/) — safe, lower-signal fallback.
9. [r/grok](https://www.reddit.com/r/grok/comments/1w02dbc/updates_to_rgrok/) — only after Grok Build is proven, with a Grok-specific title and context.

Avoid a general launch in r/commandline, which currently bans generative-AI projects. Do not paste this draft into r/rust, r/golang, or Show HN: those communities currently restrict AI-written launch text, and the general product is not language-specific enough for the first two anyway. A later, personally written Cargo or Go benchmark can be appropriate if it is genuinely about that ecosystem.

Do not ask for stars or upvotes. Disclose that you built it and ask for one concrete kind of feedback.
