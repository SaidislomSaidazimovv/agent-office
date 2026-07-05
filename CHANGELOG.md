# Changelog

All notable changes to **Agent Office 3D** are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [0.1.0] — 2026-07-04

The first release. 🎉

### Added

- **Live 3D office** — a React + three.js webview panel that renders your
  Claude Code sessions as animated voxel characters in an isometric office.
- **Agent characters** — one character per session; they sit and type while
  working, and stand up and wander the office (through doors, into rooms)
  when idle, returning to their desk when given a task.
- **Multi-room office** — a large company floor with a server room, kitchen,
  meeting rooms, a library, a bathroom, a lounge, glass-walled rooms and an
  open central work area, each with walls, doors and its own floor colour.
- **Two camera modes** — an isometric observer (dollhouse cutaway) and a
  first-person walk-around mode (`WASD` + mouse look, `Esc` to exit).
- **Status & activity** — floating labels with the current tool and file,
  a colour-coded context/token health-bar, permission bubbles and per-turn
  "Done" / "Waiting for input" states.
- **Agent inspector** — click a character for its task, tokens and role,
  with **Terminal** (focus) and **Close** actions.
- **Sub-agents** — `Task`/`Agent` sub-agents appear as their own small
  characters beside the parent.
- **Sound notifications** — chimes on turn-done and permission requests, with a mute toggle.
- **Layout editor** — place, drag, rotate and delete furniture on a grid, recolour the floor, undo/redo, and export/import the layout as JSON; persisted to `~/.agent-office/layout.json`.
- **Standalone browser viewer** — `npx agent-office` serves the same 3D office over HTTP + WebSocket at `localhost:3100`, reusing the detection pipeline and shared layout.
- **Detection** — two paths that run together: Claude Code **Hooks** (a
  local hook server + installer) for reliable, precise detection, and a
  **JSONL transcript** watcher as a fallback and for token usage.
- **`+ Agent`** — spawns a new Claude Code terminal; workspace sessions are
  also auto-detected. Closing the terminal (or the inspector's Close button)
  removes the agent.
- **State retention** — the office keeps its state when the panel is hidden
  and re-synchronises on reload, so agents don't reset when you switch away.
- Packaged as a compact `.vsix` (~360 KB).

[0.1.0]: https://github.com/SaidislomSaidazimovv/agent-office/releases/tag/v0.1.0
