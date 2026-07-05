# Changelog

All notable changes to **Agent Office 3D** are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [0.1.1] — 2026-07-05

The first public release. 🎉 A living 3D office that watches your Claude Code
sessions — no API key, no configuration, purely local.

### Added

- **Live 3D office** — a React + three.js panel that renders each Claude Code
  session as an animated voxel character in an isometric, multi-room office
  (server room, kitchen, meeting rooms, library, bathroom, lounge, glass rooms).
- **Agent characters** — they sit and type while working, stand up and wander
  the office through doors when idle, and return to their desk on a new task.
  Solid collision keeps characters and the camera out of walls and furniture.
- **Two camera modes** — an isometric observer and a first-person walk-around
  (`WASD` + mouse, `Esc` to exit).
- **Rich status** — six live states colour-coded on each character and its
  monitor: **working**, **thinking**, **collab** (sub-agents), **review**
  (permission / awaiting input), **blocked** (errors), **idle**. Floating
  labels show the current tool and file; unselected agents stay compact.
- **Model-aware context meter** — the token gauge sizes to the session's real
  context window, so 1M-context sessions read correctly.
- **Agent inspector** — task, tokens, role, and **Terminal** / **Move** /
  **Close** actions; move an agent to another desk (swap if occupied).
- **Sub-agents** — `Task`/`Agent` sub-agents appear as small characters beside
  the parent.
- **Layout editor** — place, drag, rotate and delete furniture on a grid,
  recolour the floor, undo/redo, export/import the layout as JSON, and load
  **external furniture packs** described in JSON (box/cylinder/cone/sphere).
  Saved to `~/.agent-office/layout.json`.
- **Standalone browser viewer** — `npx agent-office` (or `node dist/cli.js`)
  serves the same office over HTTP + WebSocket at `localhost:3100`, reusing the
  detection pipeline and the shared layout.
- **Two detection paths** — Claude Code **Hooks** (a local `127.0.0.1` hook
  server + installer) for reliable detection, and a **JSONL transcript** watcher
  as a fallback and for token usage. A top-bar badge shows which is live.
- **Sound notifications** with a mute toggle; **multi-root** folder picker and
  role presets on `+ Agent`; state retained across panel hide/reload.

### Security & privacy

- **Local only.** The extension never sees your Claude API key. It reads local
  transcripts under `~/.claude/projects` and, optionally, receives Claude Code
  hooks — nothing is sent anywhere.
- **Loopback-bound.** The hook server and the standalone viewer bind to
  `127.0.0.1` only and are never exposed to the network; the hook endpoint uses
  a random per-session bearer token.
- **No code execution of session data.** Asset packs and layouts are parsed as
  plain JSON (no `eval`); the extension runs no `child_process`.
- **Safe settings writes.** Hook installation into `~/.claude/settings.json`
  bails out (never overwrites) if the file can't be parsed, and writes
  atomically; stale prior-version hook entries are cleaned up on install.

[0.1.1]: https://github.com/SaidislomSaidazimovv/agent-office/releases/tag/v0.1.1
