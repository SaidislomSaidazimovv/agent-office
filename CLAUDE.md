<!--MAC-BLOCK:BEGIN-->

## 🚨 Multi-Agent Coordination

This project runs **4** Claude Code terminals in parallel. Coordination is enforced by three artifacts at the repo root: `active_tasks.md` (kanban), `active_files.md` (file locks), and `.multi-agent/config.json` (settings). The kanban + lock files are gitignored (live state); the config is committed so team members get the same settings on clone.

### Terminal roles

| Label | Role | Writes code? | Responsibilities |
| ----- | ---- | ------------ | ---------------- |
| `T1` | Developer | Yes | Implements tasks assigned to T1 |
| `T2` | Developer | Yes | Implements tasks assigned to T2 |
| `T3` | Developer | Yes | Implements tasks assigned to T3 |
| `P` | Planner | No | Plans, dispatches, reviews diffs, approves commits |

If unsure which terminal you are at session start, run `/agent-intro` or ask the user.

### File-lock protocol (mandatory before every edit)

Before editing **any** file:

1. Read `active_files.md`.
2. If the target path is listed by another terminal and the timestamp is fresher than **15 minutes**, wait 30s and re-check. Loop until the lock disappears.
3. If listed by another terminal but older than TTL: it's stale — per project policy (warn user before clearing).
4. If not listed: append `- <path> → T<N> @ <ISO-timestamp>` (developers) or `- <path> → P @ <ISO-timestamp>` (planner) and proceed.
5. Edit.
6. Remove your line from `active_files.md` immediately when done.

Read-only operations (`Read`, `Grep`, `git status`, `git diff`) do NOT need a lock.

### Shared kanban (`active_tasks.md`)

Four sections in order: 🟢 IN PROGRESS / TODO → 🟡 AWAITING REVIEW → 🟠 BLOCKED → ✅ DONE.

- **Planner** writes new tasks into TODO with full file lists, acceptance criteria, and an assignee (T1 / T2 / T3).
- **Developer** picks up the task, locks files, implements, runs verification, moves the task to AWAITING REVIEW with a status note.
- **STOP** at AWAITING REVIEW. Do NOT commit until the user relays planner approval.
- After approval: pull-rebase → `git add` specific files → commit → push → move to DONE with commit hash.

### Approval gate

**Enabled.** Developers must not run `git add` / `git commit` / `git push` until the Planner has reviewed the uncommitted diff and the user relays an explicit "approved" message. Developers signal readiness by moving the task to AWAITING REVIEW and saying so in chat. The Planner verifies via `git diff` + build + manual run, then approves or blocks. Exceptions: pure-docs / planning-file commits and explicit user-authorized hotfixes.

### Git workflow — Variant B (single integration branch)

Two-branch model. Daily commits go directly to the **`dev`** integration branch (no per-task feature branches — the Planner approval gate plays the code-review role). Promotion to production **`master`** happens via a release PR (`dev → master`) followed by a version tag. Before committing: `git fetch && git pull --rebase origin dev`, then `git add <specific-files>` (never `-A`), commit, and `git push origin dev`.

### Project verification commands

- **Typecheck / build:** `npm run build`
- **Tests:** `npm run build`

Run the build before moving any task to AWAITING REVIEW. (No dedicated test suite is configured yet — the Vite build is the verification gate.)

### Commit format

**Conventional Commits** — `<type>(<scope>): <description>` where `<type>` is one of `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`, `perf`. Keep the subject imperative and under ~72 chars.

### Reference

Full coordination protocol: load the `multi-agent-coordination` skill or read its references directly (`lock-protocol.md`, `approval-gate.md`, `git-workflow-variants.md`, `troubleshooting.md`).
<!--MAC-BLOCK:END-->

## 🔒 Security policy (this repo is public — enforce strictly)

This extension is **observation-only and fully local**. Every change MUST preserve that. Before every commit and release:

1. **No secrets in the repo, ever.** Never commit API keys, tokens, credentials, `.env` files, `~/.agent-office/server.json`, personal emails, or absolute paths containing a username (`C:\Users\<name>`, `/home/<name>`). Auth tokens must be generated at runtime (`crypto.randomBytes`), never hardcoded.
2. **Local only.** The extension must never read the user's Claude API key and never send data off the machine. It only reads `~/.claude/projects` transcripts and receives local hooks.
3. **Loopback-bound servers.** Any HTTP/WebSocket/hook server MUST bind `127.0.0.1` explicitly (never `0.0.0.0` / no host argument). The standalone CLI and the hook server both bind loopback only.
4. **No code execution of session/user data.** Parse asset packs, layouts, and transcripts with `JSON.parse` only — no `eval` / `new Function`. Do not spawn `child_process` on session data.
5. **Safe writes to user files.** Writing `~/.claude/settings.json` or `~/.agent-office/*` must bail out (never overwrite) if the existing file can't be parsed, and must write atomically (temp + rename).
6. **Keep private/build files out of Git.** `TESTING.md`, `*.tsbuildinfo`, `dist/`, `scratchpad/`, `_shot*.cjs`, `.vsix`, `active_*.md` are gitignored. `icon.png` stays tracked — it is required by `vsce package` and is already public on the Marketplace.

**Release security gate.** Before tagging a release, run and confirm CLEAN:
```bash
# secrets / personal data in tracked files
git grep -nIiE "secret|password|api[_-]?key|-----BEGIN|ghp_|sk-|C:\\\\Users|/home/|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}" -- . ':(exclude)*lock.json'
# servers must bind loopback
git grep -nE "\.listen\(" -- '*.ts'   # every listen() must pass "127.0.0.1"
```
