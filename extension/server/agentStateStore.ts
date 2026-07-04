import { EventEmitter } from "node:events";
import type { ServerMessage } from "../core/messages.js";
import type { AgentState } from "./types.js";

// ── Agent holat do'koni ──────────────────────────────────────
// Barcha agentlarni saqlaydi va uchta hodisani chiqaradi:
//   'agentAdded' (AgentState) — yangi agent ulandi
//   'agentRemoved' (id)       — agent yopildi
//   'broadcast' (ServerMessage) — webview'ga yuboriladigan faoliyat xabari
// ViewProvider bu hodisalarga obuna bo'lib, webview'ga uzatadi.

export class AgentStateStore extends EventEmitter {
  private agents = new Map<number, AgentState>();
  private nextId = 1;
  /** >0 bo'lса broadcast'lar o'chiriladi (tarixни jimgina o'qish uchun).
   *  FAQAT sinxron blok davomida ishlatiladi (tick oralиқда tushmaydi). */
  private silent = 0;

  /** Keyingi agent uchun ID ajratadi. */
  allocateId(): number {
    return this.nextId++;
  }

  add(agent: AgentState): void {
    this.agents.set(agent.id, agent);
    this.emit("agentAdded", agent);
  }

  remove(id: number): void {
    const agent = this.agents.get(id);
    if (!agent) return;
    if (agent.waitingTimer) clearTimeout(agent.waitingTimer);
    if (agent.permissionTimer) clearTimeout(agent.permissionTimer);
    this.agents.delete(id);
    this.emit("agentRemoved", id);
  }

  get(id: number): AgentState | undefined {
    return this.agents.get(id);
  }

  has(id: number): boolean {
    return this.agents.has(id);
  }

  get size(): number {
    return this.agents.size;
  }

  values(): AgentState[] {
    return [...this.agents.values()];
  }

  /** Fayl yo'li bo'yicha agent topadi (skanerlar dublikat qo'shmasin). */
  findByFile(filePath: string): AgentState | undefined {
    for (const a of this.agents.values()) {
      if (a.filePath === filePath) return a;
    }
    return undefined;
  }

  /** Sessiya ID bo'yicha agent topadi (hook yo'naltirish). */
  findBySession(sessionId: string): AgentState | undefined {
    for (const a of this.agents.values()) {
      if (a.sessionId === sessionId) return a;
    }
    return undefined;
  }

  /** Broadcast'larни vaqtincha o'chiradi (tarixни jimgina qайта o'qish uchun).
   *  begin/end juftlik sinxron blokда ishlatilishi shart. */
  beginSilent(): void {
    this.silent++;
  }
  endSilent(): void {
    if (this.silent > 0) this.silent--;
  }

  /** Webview'ga faoliyat xabarини uzatadi (silent rejimда o'tkazib yuboriladi). */
  broadcast(msg: ServerMessage): void {
    if (this.silent > 0) return;
    this.emit("broadcast", msg);
  }

  disposeAll(): void {
    for (const a of this.agents.values()) {
      if (a.waitingTimer) clearTimeout(a.waitingTimer);
      if (a.permissionTimer) clearTimeout(a.permissionTimer);
    }
    this.agents.clear();
  }
}
