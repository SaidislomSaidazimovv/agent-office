# Agent Office 3D

Sizning Claude Code agentlaringiz **realistik 3D ofisда** jonli personajlar sifatida
ishlaydigan VS Code kengaytmasi (extension). [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents)
kabi ishlaydi — lekin 2D pixel-art o'rniga **React + three.js** bilan 3D ofis.

Agentlarни **ishlatmaydi — kuzatadi**: Claude Code transcriptlarini (`~/.claude/projects/*.jsonl`)
o'qib, faoliyatni 3D ofis hodisalariga o'giradi. API key kerak emas.

## Arxitektura

```
Claude Code ──JSONL yozadi──► FileWatcher (500ms polling)
(o'zgarmaydi)                       │
                          transcriptParser (state machine)
                                    │
                          AgentStateStore (EventEmitter)
                                    │ broadcast(ServerMessage)
                          OfficeViewProvider (webview)
                                    │ postMessage
                          useExtensionMessages (reducer) ──► store ──► 3D sahna
```

## Papka tuzilishi

| Papka | Vazifa | Build |
| ----- | ------ | ----- |
| `extension/core/` | Protokol: `messages`, `constants`, `paths` | |
| `extension/server/` | `AgentStateStore`, `transcriptParser`, `fileWatcher` | esbuild |
| `extension/vscode/` | `extension.ts`, `OfficeViewProvider`, `agentManager` | → `dist/extension.js` |
| `webview-ui/` | React + R3F 3D ofis (transport → reducer → store → sahna) | Vite → `dist/webview/` |
| `webview-ui/public/models/` | GLB modellar + PBR teksturalar | |

## Ishga tushirish

```bash
npm run install:all   # extension + webview bog'liqliklari
npm run build         # tsc + esbuild + vite
```

So'ng VS Code'да loyihани ochib **F5** bosing (Extension Development Host).
Pastki panelда **"Agent Office"** tabини oching → **+Agent** bosing.

## Holat (yo'l xaritasi)

- ✅ **M1** — extension skeleti: JSONL kuzatuvchi + 3D sahna + `+Agent` (rol tanlash)
- ⏳ **M2** — 3D GLB personajlar (rigged/animatsiyali) + boy PBR ofis (mebel, dekor)
- ⏳ **M3** — Claude Hooks rejimi (Fastify) — ishonchliroq aniqlash
- ⏳ **M4** — token health-bar, speech bubble, ovoz, sub-agent bog'langan personajlar
