import * as fs from "node:fs";
import { FILE_WATCHER_POLL_INTERVAL_MS, MAX_READ_BYTES } from "../core/constants.js";
import type { AgentStateStore } from "./agentStateStore.js";
import { processTranscriptLine } from "./transcriptParser.js";
import type { AgentState } from "./types.js";

// ── Fayl kuzatuvchisi ────────────────────────────────────────
// Pixel Agents kabi: fs.watch EMAS (macOS/WSL2'да ishonchsiz), balki
// har 500ms polling. Har agentning .jsonl faylини stat qilib, o'sган
// bo'lsa yangi baytларни o'qiydi, qism-qatorларни buferlab, to'liq
// qatorlarni transcript state machine'ga uzatadi.

export class FileWatcher {
  private timer?: ReturnType<typeof setInterval>;

  constructor(private store: AgentStateStore) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), FILE_WATCHER_POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Yangi agent qo'shilganда faylни boshidan o'qiymiz (mavjud tarixни ham). */
  primeFromStart(agent: AgentState): void {
    agent.fileOffset = 0;
    agent.lineBuffer = "";
  }

  private tick(): void {
    for (const agent of this.store.values()) {
      this.readNewLines(agent);
    }
  }

  private readNewLines(agent: AgentState): void {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(agent.filePath);
    } catch {
      return; // fayl hali yo'q yoki o'chirilgan
    }
    if (stat.size <= agent.fileOffset) {
      if (stat.size < agent.fileOffset) {
        // Fayl qisqargan (masalan /clear) — qaytadan boshlaymiz
        agent.fileOffset = 0;
        agent.lineBuffer = "";
      }
      return;
    }
    const toRead = Math.min(stat.size - agent.fileOffset, MAX_READ_BYTES);
    const buf = Buffer.alloc(toRead);
    let bytesRead = 0;
    try {
      const fd = fs.openSync(agent.filePath, "r");
      bytesRead = fs.readSync(fd, buf, 0, toRead, agent.fileOffset);
      fs.closeSync(fd);
    } catch {
      return;
    }
    agent.fileOffset += bytesRead;

    const text = agent.lineBuffer + buf.toString("utf8", 0, bytesRead);
    const lines = text.split("\n");
    agent.lineBuffer = lines.pop() ?? ""; // oxirgi qism-qatorни saqlaymiz
    for (const line of lines) {
      processTranscriptLine(this.store, agent, line);
    }
  }
}
