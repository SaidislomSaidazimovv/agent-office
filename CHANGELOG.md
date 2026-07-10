# Changelog

All notable changes to **Agent Office 3D** are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

Office-polish work toward the next release (not yet published).

### Added

- **Decorative rugs** under the furniture in the lounge, library and meeting rooms.
- A **wall clock** and two more framed paintings on the side walls.
- **Hanging pendant lights** over the open office that glow and cast light at night.
- **Soft contact shadows** beneath each agent so characters no longer look like they float.

### Changed

- Agent **monitor screens glow brighter at night** so desks read as lit-up in the dark.

## [0.1.4] — 2026-07-11

The office came alive — dynamic walls, self-organising agents, deeper insight,
and three languages. 🌆

### Added

- **Dynamic dollhouse walls** — the two walls between you and the interior fade
  out as you rotate (Sims/Habbo-style cutaway), so the office is always readable;
  the far walls stay solid as a backdrop.
- **Automatic roles** — you no longer pick a role. Each agent's role is inferred
  from what it actually does (edited file types, shell commands, tools) and shown
  on its label, so agents in the same repo are finally distinguishable.
- **Settings panel** (⚙) — with **language** selection (**O'zbekcha / Русский /
  English**) plus day-night and sound toggles, persisted locally.
- **Full localisation** — the whole UI is available in Uzbek, Russian and English.
- **Cost estimate** — per-agent and total estimated spend using official Claude
  prices (cache reads/writes accounted for).
- **Git awareness** — the inspector shows each agent's branch and changed-file
  count.
- **Tool history** — a collapsible list of an agent's recent tool calls.
- **Lifelike animation** — elbow/ankle joints, blinking, occasional glances, and
  a distance-locked stride (no foot-skating).

### Changed

- Agent labels now show the detected **role** instead of the repository folder
  name (which was identical on every agent).
- Sound and day-night toggles moved into the settings panel.
- Doors open nearly flat against the wall (no more clipping through an open leaf).

### Fixed

- Corrected several backwards fixtures (bathroom stalls, library bookshelves, TV).
- Wall-standing and wall-hung fixtures now sit flush against their walls.
- Social meetings keep space and face each other; removed meeting deadlocks and
  a case where an agent emoted alone.
- Solid collision between agents, and for doors, lamps and plants.
- Glasses accessory now faces forward over the eyes.

### Performance

- Off-screen agent rigs and plant sway are frozen (frustum culling).
- Shadow-map updates are throttled to reduce stutter with many agents.

## [0.1.3] — 2026-07-06

A "livelier office" release — more characters, more life, more insight, and a
brand-new icon. 🎨

### Added

- **Character variety** — same-role agents now look distinct: each gets a
  deterministic accessory (glasses, headphones, or a cap) and a subtle per-agent
  hair/clothing colour shift.
- **Smart idle** — idle agents no longer loiter in walkways; they head into
  rooms that fit their role (research → library, backend → server room, everyone
  → kitchen/lounge), and take a coffee break the first trip after finishing work.
- **Animation polish** — standing-idle agents periodically stretch, and thinking
  agents rest a hand near the chin.
- **Visual effects** — agent monitors cast a soft status-coloured glow, and
  potted plants sway gently.
- **Session stats** — the inspector shows per-agent **turns**, **tool calls**
  and **active time** (ticking live).
- **Activity feed** — a 📜 panel logs recent events: tool runs, permission
  prompts, blocks, sub-agent hires, and agents joining/leaving.
- **Native notifications** — when the panel is hidden, permission requests and
  errors raise a VS Code toast with a **Show** action (setting:
  `agent-office.notifications`).
- **Office themes** — five one-click palettes (Warm, Cool, Night, Forest, Rose)
  recolour the floor and all walls; a standalone wall-colour picker is included,
  and `wallColor` persists with the layout.
- **Accessibility** — arrow keys cycle the selected agent (Esc deselects),
  a focus-visible outline is shown on all controls, emoji-only buttons get ARIA
  labels, and the activity feed is a polite live region.
- **New icon.** 🎨

### Changed

- **Sub-agent visualization** — spawning a `Task`/`Agent` sub-agent now shows a
  "hiring" bubble over the agent and logs it in the feed; helpers pop in as
  smaller "Yordamchi" characters and stay visible at least 6 s so fast
  (background) sub-agents no longer flash by unseen.

### Fixed

- Meeting-table and desk chairs faced away from their table/monitor — they now
  face inward.
- Room doors could open inward; every door now swings toward the central hallway
  and its leaf fits the opening.
- The sub-agent "hiring" bubble could stick on screen indefinitely.

## [0.1.2] — 2026-07-05

### Fixed

- **Security:** the standalone browser viewer (`node dist/cli.js` /
  `npx agent-office`) now binds to `127.0.0.1` only. It previously listened on
  all network interfaces, which could expose your session activity (agent names
  and file labels) to other machines on the same network. The VS Code hook
  server was already loopback-bound and is unaffected.

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

[0.1.3]: https://github.com/SaidislomSaidazimovv/agent-office/releases/tag/v0.1.3
[0.1.2]: https://github.com/SaidislomSaidazimovv/agent-office/releases/tag/v0.1.2
[0.1.1]: https://github.com/SaidislomSaidazimovv/agent-office/releases/tag/v0.1.1
