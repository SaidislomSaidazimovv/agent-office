import { useEffect } from "react";
import { type Key, translate, useLang } from "./i18n";
import { saveHtmlReport, saveMarkdown } from "./media";
import { buildReport } from "./report";
import { buildReportHtml } from "./reportHtml";
import { useSettings } from "./settings";
import { useLayout } from "./layoutStore";
import { playDone, playPermission, unlockAudio } from "./notificationSound";
import type { ServerMessage } from "./protocol";
import { useOffice } from "./store";
import { onMessage, send } from "./transport";

// ── Xabar → holat ko'prigi ───────────────────────────────────
// Server xabarlarini store amallariga tarjima qiladi. Mount bo'lganda
// webviewReady yuboradi (extension boot ketma-ketligini boshlaydi).

/** VS Code buyruqlar palitrasidan kelgan buyruq (S7-4). Hisobotlar panel
 *  tugmalari bilan AYNAN bir xil funksiyalardan yasaladi (o'lchangan holatdan). */
function runUiCommand(command: "openDashboard" | "exportHtml" | "exportMarkdown" | "pin" | "unpin", id?: number): void {
  const st = useOffice.getState();
  switch (command) {
    case "openDashboard":
      st.requestDashboard();
      return;
    case "pin":
      if (id != null && st.agents[id] && st.pinnedId !== id) st.pin(id);
      return;
    case "unpin":
      if (st.pinnedId != null) st.pin(st.pinnedId); // pin() — almashtirgich
      return;
    case "exportHtml":
    case "exportMarkdown": {
      const lang = useLang.getState().lang;
      const input = {
        agents: st.order.map((i) => st.agents[i]).filter(Boolean),
        now: Date.now(),
        budgetUsd: useSettings.getState().budgetUsd,
        t: (k: Key) => translate(lang, k),
      };
      if (command === "exportHtml") saveHtmlReport(buildReportHtml(input));
      else saveMarkdown("report", buildReport(input));
      return;
    }
  }
}

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
        case "existingAgents": {
          const externals = new Set(msg.externals ?? []);
          for (const id of msg.agents) {
            store.addAgent({
              id,
              folderName: msg.folderNames[id],
              role: msg.roles[id],
              isExternal: externals.has(id),
            });
          }
          break;
        }
        case "agentSelected":
          store.select(msg.id);
          break;
        case "uiCommand":
          runUiCommand(msg.command, msg.id);
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
          store.setTool(msg.id, msg.toolName, msg.status, msg.runInBackground);
          break;
        case "agentRoleDetected":
          store.setRole(msg.id, msg.role);
          break;
        case "agentPermissionMode":
          store.setPermissionMode(msg.id, msg.mode);
          break;
        case "agentSessionStats":
          store.setSessionStats(msg.id, msg.toolCalls, msg.turns, msg.activeMs);
          break;
        case "agentToolCats":
          store.setToolCats(msg.id, msg.toolCats);
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
          store.setBlocked(msg.id, msg.blocked, msg.reason);
          break;
        case "agentStuck":
          store.setStuck(msg.id, msg.stuck);
          break;
        case "agentRenamed":
          store.setName(msg.id, msg.name);
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
            model: msg.model, billedInput: msg.billedInput, billedCacheWrite: msg.billedCacheWrite, billedCacheRead: msg.billedCacheRead, costUsd: msg.costUsd,
          });
          break;
        case "settingsLoaded":
          store.setSound(msg.soundEnabled);
          break;
        case "hookStatus":
          store.setHookActive(msg.active);
          break;
        case "historyLoaded":
          store.setHistory(msg.days, msg.sessions ?? []);
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
    // Tanlangan til host'ga — toast bildirishnomalar va status bar ham shu tilda.
    send({ type: "setLang", lang: useLang.getState().lang });
    const offLang = useLang.subscribe((s, prev) => {
      if (s.lang !== prev.lang) send({ type: "setLang", lang: s.lang });
    });
    return () => {
      off();
      offLang();
      window.removeEventListener("pointerdown", unlock);
    };
  }, []);
}
