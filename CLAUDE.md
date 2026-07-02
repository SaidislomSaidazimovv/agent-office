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
