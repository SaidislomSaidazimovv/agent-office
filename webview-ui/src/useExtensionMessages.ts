import { useEffect } from "react";
import { useLayout } from "./layoutStore";
import { playDone, playPermission, unlockAudio } from "./notificationSound";
import type { ServerMessage } from "./protocol";
import { useOffice } from "./store";
import { onMessage, send } from "./transport";

// ── Xabar → holat ko'prigi ───────────────────────────────────
// Server xabarlarini store amallariga tarjima qiladi. Mount bo'lganda
// webviewReady yuboradi (extension boot ketma-ketligini boshlaydi).

export function useExtensionMessages(): void {
  useEffect(() => {
    const store = useOffice.getState();

    const off = onMessage((msg: ServerMessage) => {
      switch (msg.type) {
        case "agentCreated":
          store.addAgent(msg);
          break;
        case "agentClosed":
          store.removeAgent(msg.id);
          break;
        case "existingAgents":
          for (const id of msg.agents) {
            store.addAgent({
              id,
              folderName: msg.folderNames[id],
              role: msg.roles[id],
            });
          }
          break;
        case "agentSelected":
          store.select(msg.id);
          break;
        case "agentStatus": {
          // Faqat active→waiting O'TISHIDA chime — snapshot/reload'da bo'sh
          // (idle) agentlar uchun N ta chime chalinmasin.
          const wasActive = useOffice.getState().agents[msg.id]?.active;
          if (msg.status === "waiting" && wasActive && useOffice.getState().soundEnabled) playDone();
          store.setActive(msg.id, msg.status === "active", msg.awaitingInput);
          break;
        }
        case "agentToolStart":
          store.setTool(msg.id, msg.toolName, msg.status);
          break;
        case "agentRoleDetected":
          store.setRole(msg.id, msg.role);
          break;
        case "agentToolDone":
          store.toolDone(msg.id);
          break;
        case "agentToolsClear":
          store.clearTools(msg.id);
          break;
        case "agentToolPermission":
          if (useOffice.getState().soundEnabled) playPermission();
          store.setPermission(msg.id, true);
          break;
        case "agentToolPermissionClear":
          store.setPermission(msg.id, false);
          break;
        case "agentBlocked":
          store.setBlocked(msg.id, msg.blocked);
          break;
        case "agentStuck":
          store.setStuck(msg.id, msg.stuck);
          break;
        case "subagentToolStart":
          store.addSubagent(msg.id, msg.parentToolId, { label: msg.label, kind: msg.kind });
          break;
        case "subagentToolDone":
        case "subagentClear":
          store.clearSubagent(msg.id, msg.parentToolId);
          break;
        case "agentTokenUsage":
          store.setTokens(msg.id, msg.inputTokens, msg.outputTokens, msg.contextWindow, {
            model: msg.model, billedInput: msg.billedInput, billedCacheWrite: msg.billedCacheWrite, billedCacheRead: msg.billedCacheRead,
          });
          break;
        case "settingsLoaded":
          store.setSound(msg.soundEnabled);
          break;
        case "hookStatus":
          store.setHookActive(msg.active);
          break;
        case "layoutLoaded":
          useLayout.getState().loadLayout({ items: msg.items, floorColor: msg.floorColor, packs: (msg.packs ?? []) as never });
          break;
        case "providerCapabilities":
          store.setCapabilities(msg.readingTools);
          break;
        case "workspaceFolders":
          store.setFolders(msg.folders);
          break;
        case "gitStatus":
          store.setGitRepos(msg.repos);
          break;
      }
    });

    // Ovozni birinchi bosishda ochamiz (autoplay siyosati)
    const unlock = () => {
      unlockAudio();
      window.removeEventListener("pointerdown", unlock);
    };
    window.addEventListener("pointerdown", unlock);

    send({ type: "webviewReady" });
    return () => {
      off();
      window.removeEventListener("pointerdown", unlock);
    };
  }, []);
}
