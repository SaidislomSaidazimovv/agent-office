<!--MAC-BLOCK:BEGIN-->

## 🚨 Coordination & git workflow

Day-to-day this project is worked on by **one developer with one Claude Code session**. The multi-agent tooling is still installed and its artifacts stay in use: `active_tasks.md` (kanban), `active_files.md` (file locks) — both gitignored live state — and `.multi-agent/config.json` (committed). If parallel terminals are started, the roles below apply.

### Terminal roles (when running in parallel)

| Label | Role | Writes code? | Responsibilities |
| ----- | ---- | ------------ | ---------------- |
| `T1` | Developer | Yes | Implements tasks assigned to T1 (the default label for a solo session) |
| `T2` | Developer | Yes | Implements tasks assigned to T2 |
| `T3` | Developer | Yes | Implements tasks assigned to T3 |
| `P` | Planner | No | Plans, dispatches, reviews diffs |

If unsure which terminal you are at session start, run `/agent-intro` or ask the user.

### File-lock protocol (before every edit)

1. Read `active_files.md`.
2. If the target path is listed by another terminal and the timestamp is fresher than **15 minutes**, wait 30s and re-check.
3. If listed but older than the TTL it is stale — warn the user before clearing it.
4. Otherwise append `- <path> → T<N> @ <ISO-timestamp>` (planner: `P`) and proceed.
5. Edit, then remove your line immediately.

Read-only operations (`Read`, `Grep`, `git status`, `git diff`) need no lock.

### Shared kanban (`active_tasks.md`)

Sections in order: 🟢 IN PROGRESS / TODO → 🟡 AWAITING REVIEW → 🟠 BLOCKED → ✅ DONE. Record finished work in DONE with the commit hashes.

### Git workflow — feature branches off `main`, the user pushes

- `main` is the only long-lived branch; it is what is released. There is **no `dev` or `master`** (a stale local `dev` may exist — ignore it).
- Work happens on topic branches created from `main` (`fix/…`, `feat/…`, `chore/…`, `docs/…`). When one piece of work depends on another unpushed branch, branch from that branch (stacked) and say so.
- **One small change = one commit**, Conventional Commits. Run the verification commands first and commit only if they pass. Stage specific files (never `git add -A`).
- **Claude never pushes, merges, or opens PRs.** The user pushes branches and merges them. Never `git push` without the user's explicit permission in the current conversation.
- **No release without the user's explicit go:** no version bump, no `CHANGELOG` date, no tag, no `.vsix`. Do **not** run `npm run package` before the version is bumped — it overwrites the previous release's `.vsix` of the same version. Collect notes under `## [Unreleased]` in `CHANGELOG.md`.
- Real users run the Marketplace build: keep behaviour backward-compatible (existing `~/.agent-office/*` files, existing hook entries in `~/.claude/settings.json`).

### Project verification commands

- **Typecheck:** `npm run check-types` (host) — the webview is type-checked by its build.
- **Tests:** `npm test` (esbuild-bundled suite in `test/run.ts`).
- **Build:** `npm run build` (type-check + esbuild host bundles + Vite webview).

Run all three before every commit.

- **3D perf check (any change to the scene / webview rendering):** `npm run build`, then `node scripts/perf-baseline.cjs --check` (needs `npm i --no-save puppeteer-core` once and Chrome/Edge; `CHROME_PATH` if not in a standard location). It fails if the steady per-frame draw calls exceed the baseline in `scripts/perf-budget.json` by more than 8% (first person varies ~4% run to run). When a change intentionally lowers the numbers, refresh the baseline with `--write-baseline` and commit it together with that change. Draw calls are reported as min (scene) – max (scene + shadow pass); FPS is not measured headless.

### Release checklist (only when the user says so)

Bump `package.json` version → date the `[Unreleased]` section and add its link reference → run the security gate below → `npm run package` → commit → the user pushes and tags. Before tagging, smoke-test the `.vsix` in a real VS Code window (F5 / install from VSIX).

### Commit format

**Conventional Commits** — `<type>(<scope>): <description>`, type ∈ `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`, `perf`, `build`, `ci`. Imperative subject, under ~72 chars.

### Reference

Multi-agent protocol details: the `multi-agent-coordination` skill (`lock-protocol.md`, `approval-gate.md`, `git-workflow-variants.md`, `troubleshooting.md`).
<!--MAC-BLOCK:END-->

## 🔒 Security policy (this repo is public — enforce strictly)

This extension is **observation-only and fully local**. Every change MUST preserve that. Before every commit and release:

1. **No secrets in the repo, ever.** Never commit API keys, tokens, credentials, `.env` files, `~/.agent-office/server.json`, personal emails, or absolute paths containing a username (`C:\Users\<name>`, `/home/<name>`). Auth tokens must be generated at runtime (`crypto.randomBytes`), never hardcoded.
2. **Local only.** The extension must never read the user's Claude API key and never send data off the machine. It only reads `~/.claude/projects` transcripts and receives local hooks.
3. **Loopback-bound servers.** Any HTTP/WebSocket/hook server MUST bind `127.0.0.1` explicitly (never `0.0.0.0` / no host argument). The standalone CLI and the hook server both bind loopback only.
4. **No code execution of session/user data.** Parse asset packs, layouts, and transcripts with `JSON.parse` only — no `eval` / `new Function`. Do not spawn `child_process` on session data.
5. **Safe writes to user files.** Writing `~/.claude/settings.json` or `~/.agent-office/*` must bail out (never overwrite) if the existing file can't be parsed, and must write atomically (temp + rename).
6. **Browser-facing surfaces stay locked down.** The webview keeps its strict Content-Security-Policy (`extension/vscode/webviewHtml.ts`: no network, nonce'd scripts, no `unsafe-eval`). The standalone CLI's HTTP/WebSocket server accepts only its own Host and Origin (any website can reach `127.0.0.1`).
7. **Forward the minimum.** The hook script sends only the whitelisted fields (`extension/core/hookPayload.ts`) — never tool output, prompts or replies — and files holding the hook token are written 0600.
8. **Keep private/build files out of Git.** `TESTING.md`, `*.tsbuildinfo`, `dist/`, `scratchpad/`, `_shot*.cjs`, `.vsix`, `active_*.md` are gitignored. `icon.png` stays tracked — it is required by `vsce package` and is already public on the Marketplace.

**Release security gate.** Before tagging a release, run and confirm CLEAN:
```bash
# secrets / personal data in tracked files
git grep -nIiE "secret|password|api[_-]?key|-----BEGIN|ghp_|sk-|C:\\\\Users|/home/|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}" -- . ':(exclude)*lock.json'
# servers must bind loopback
git grep -nE "\.listen\(" -- '*.ts'   # every listen() must pass "127.0.0.1"
```
