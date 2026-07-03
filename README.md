<h1 align="center">🏢 Agent Office 3D</h1>

<p align="center"><i>Watch your Claude Code agents come to life in a living, isometric 3D office.</i></p>

<div align="center">
    <img alt="VS Code" src="https://img.shields.io/badge/VS%20Code-1.84+-7d57c2?style=for-the-badge&logo=visual%20studio%20code&logoColor=white"/>
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178c6?style=for-the-badge&logo=typescript&logoColor=white"/>
    <img alt="React" src="https://img.shields.io/badge/React-20232a?style=for-the-badge&logo=react&logoColor=61dafb"/>
    <img alt="three.js" src="https://img.shields.io/badge/three.js-000000?style=for-the-badge&logo=three.js&logoColor=white"/>
    <img alt="License" src="https://img.shields.io/badge/License-MIT-249847?style=for-the-badge"/>
</div>

<br/>

<img style="width: 100%" src="https://raw.githubusercontent.com/SaidislomSaidazimovv/agent-office/main/media/office-iso.png" alt="Agent Office 3D banner"/>

## Introduction

**Agent Office 3D** turns your [Claude Code](https://claude.com/claude-code) sessions into an animated 3D office you can watch while you work. Every agent becomes a voxel character that sits at a desk and types while Claude is working, wanders the office when it's idle, and shows exactly what it's doing — the file it's reading, the command it's running, whether it's waiting on you, and how full its context window is.

It **observes, never runs** Claude Code — no API key, no credentials, nothing to configure. It reads your local session transcripts (and, optionally, Claude Code Hooks) and renders the activity live in a panel next to your editor.

> Inspired by [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents) — but rebuilt from scratch with a full **3D office** (React + three.js) instead of 2D pixel art.

<details open>
<summary><b>Features</b></summary>
<br/>
<p align="center">
    <img width="49%" src="https://raw.githubusercontent.com/SaidislomSaidazimovv/agent-office/main/media/office-rooms.png" alt="Multi-room office"/>
    &nbsp;
    <img width="49%" src="https://raw.githubusercontent.com/SaidislomSaidazimovv/agent-office/main/media/office-fpv.png" alt="First-person walk-around"/>
</p>
<p align="center">
    <img width="49%" src="https://raw.githubusercontent.com/SaidislomSaidazimovv/agent-office/main/media/characters.png" alt="Voxel agent characters"/>
</p>
</details>

## Highlights

- 🧑‍💻 **Live agent characters** — one voxel character per Claude Code session. They sit and type while working, stand up and **wander the office** (through doors, into rooms) when idle, and return to their desk when you give them a task.
- 🏢 **A whole company floor** — a large multi-room office: a server room, kitchen, meeting rooms, a library, a bathroom, a lounge, glass-walled rooms and an open work area — each a real room with walls, doors and its own floor.
- 🎥 **Two camera modes** — an **isometric** observer view (dollhouse cutaway) and a **first-person** walk-around mode (`WASD` + mouse) to explore the office from inside.
- 📊 **Rich status at a glance** — floating labels show the current tool and file (`Edit App.tsx`, `Read db.ts`, …), a colour-coded **context/token health-bar**, permission "🔔" bubbles, and a per-agent inspector panel.
- 🧩 **Sub-agents** — when an agent spawns a `Task`/`Agent` sub-agent, it appears as its own small character beside the parent.
- 🔔 **Sound + notifications** — subtle chimes when a turn finishes or a permission is requested.
- 🔌 **Two detection paths** — reliable **Claude Code Hooks** plus a **JSONL transcript** fallback, so it works whether or not hooks are installed.

## How It Works

```
   You + Claude Code
        │
        ├──► writes JSONL:  ~/.claude/projects/<project>/<session>.jsonl
        │                   (every message, tool call, token)
        │
        └──► fires Hooks (PreToolUse, Stop, Notification, …)  ──┐
                                                                 ▼
                    ┌───────────────────────────────────────────────┐
                    │  Extension host                                │
                    │  • FileWatcher (500 ms polling)                │
                    │  • local Hook server (127.0.0.1)               │
                    │  • state machine → AgentStateStore             │
                    └───────────────────────┬───────────────────────┘
                                            │  ServerMessage (postMessage)
                                            ▼
                       React + three.js webview → live 3D office
```

The extension **does not run** Claude — it only watches. When Hooks are delivering, they are authoritative and the JSONL heuristics stand down (JSONL still supplies token usage).

## Requirements

- **VS Code** 1.84 or newer
- **[Claude Code](https://claude.com/claude-code) CLI** installed and on your `PATH` (for the `+ Agent` button)

## Install

**From the packaged `.vsix`:**

```bash
code --install-extension agent-office-0.1.0.vsix
```

…or in VS Code: **Extensions** → `⋯` → **Install from VSIX…**

Then reload the window (`Ctrl+Shift+P` → *Developer: Reload Window*).

## Usage

1. Open the **Agent Office** panel from the bottom panel area, or run **`Agent Office: Show Panel`**.
2. Click **`+ Agent`** and pick a role — a new Claude Code terminal opens and a character appears. (Any Claude session you start in the workspace is auto-detected too.)
3. Give Claude a task and watch the character work; when it finishes, it gets up and wanders the office.
4. Toggle **🚶 Ichki / 🔭 Yuqori** to switch between the first-person and isometric camera. In first-person: click to look, `WASD` to walk, `Esc` to exit.
5. Click a character to open its inspector (task, tokens, **Terminal** / **Close**).

### Settings

| Setting | Default | Description |
| ------- | ------- | ----------- |
| `agent-office.hooksEnabled` | `true` | Use Claude Code Hooks for reliable detection (writes a hook into `~/.claude/settings.json`). |
| `agent-office.autoShowPanel` | `false` | Open the panel automatically on startup. |
| `agent-office.autoSpawnAgent` | `false` | Spawn one agent on startup if none are running. |

## Project Structure

| Path | Purpose |
| ---- | ------- |
| `extension/core/` | Message protocol, constants, path helpers |
| `extension/server/` | `AgentStateStore`, transcript state machine, file watcher, hook server/handler |
| `extension/vscode/` | Activation, webview provider, agent manager, hook installer |
| `webview-ui/` | React + three.js 3D office (transport → reducer → store → scene) |

## Build From Source

```bash
npm run install:all   # extension + webview dependencies
npm run build         # type-check + esbuild (host) + Vite (webview)
npm run package       # produce the .vsix
```

Press **F5** to launch an Extension Development Host for debugging.

## Roadmap

- Layout editor & persistence
- More character variety and animations
- Standalone CLI to view the office in a browser at `localhost`

## License

[MIT](LICENSE) © Agent Office
