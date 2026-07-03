import { useEffect } from "react";
import type { ServerMessage } from "./protocol";
import { useOffice } from "./store";
import { onMessage, send } from "./transport";

// ── Xabar → holat ko'prigi ───────────────────────────────────
// Server xabarlarини store amallariga tarjima qiladi. Mount bo'lганда
// webviewReady yuboradi (extension boot ketma-ketligини boshlaydi).

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
        case "agentStatus":
          store.setActive(msg.id, msg.status === "active", msg.awaitingInput);
          break;
        case "agentToolStart":
          store.setTool(msg.id, msg.toolName, msg.status);
          break;
        case "agentToolDone":
          store.toolDone(msg.id);
          break;
        case "agentToolsClear":
          store.clearTools(msg.id);
          break;
        case "agentToolPermission":
          store.setPermission(msg.id, true);
          break;
        case "agentToolPermissionClear":
          store.setPermission(msg.id, false);
          break;
        case "subagentToolStart":
          store.addSubagent(msg.id);
          break;
        case "subagentToolDone":
        case "subagentClear":
          store.clearSubagent(msg.id);
          break;
        case "agentTokenUsage":
          store.setTokens(msg.id, msg.inputTokens, msg.outputTokens);
          break;
        case "settingsLoaded":
          store.setSound(msg.soundEnabled);
          break;
        case "providerCapabilities":
        case "workspaceFolders":
          break;
      }
    });

    send({ type: "webviewReady" });
    return off;
  }, []);
}
