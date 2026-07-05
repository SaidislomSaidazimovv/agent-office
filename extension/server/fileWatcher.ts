import * as fs from "node:fs";
import { StringDecoder } from "node:string_decoder";
import { FILE_WATCHER_POLL_INTERVAL_MS, MAX_LINE_CHARS, MAX_READ_BYTES } from "../core/constants.js";
import type { AgentStateStore } from "./agentStateStore.js";
import { agentSnapshotMessages } from "./stateActions.js";
import { processTranscriptLine } from "./transcriptParser.js";
import type { AgentState } from "./types.js";

// ── Fayl kuzatuvchisi ────────────────────────────────────────
// Pixel Agents kabi: fs.watch EMAS (macOS/WSL2'da ishonchsiz), balki
// har 500ms polling. Har agentning .jsonl faylini stat qilib, o'sgan
// bo'lsa yangi baytlarni o'qiydi, qism-qatorlarni buferlab, to'liq
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

  /** Yangi agent adopt qilinganda mavjud TARIXni JIMGINA (broadcast'siz) o'qib
   *  holatni tiklaymiz — butun tarix webview'ga flood bo'lmasin. Yakuniy holat
   *  keyin emitSnapshot() orqali BIR marta yuboriladi. Sinxron — tick oraliqda
   *  tushmaydi. */
  primeFromStart(agent: AgentState): void {
    agent.fileOffset = 0;
    agent.lineBuffer = "";
    agent.lineDecoder = undefined; // yangi UTF-8 dekoder
    this.store.beginSilent();
    try {
      let guard = 0;
      // Butun mavjud faylni chunk-chunk o'qib tugatamiz (offset EOF'gacha).
      while (this.readNewLines(agent) && guard++ < 200_000) {
        /* davom */
      }
    } finally {
      this.store.endSilent();
    }
  }

  /** Agentning JORIY holatini webview'ga yuboradi (adopt/rebind'dan keyin).
   *  Avval eski indikatorlarni tozalab, so'ng snapshot qo'llaymiz. */
  emitSnapshot(agent: AgentState): void {
    this.store.broadcast({ type: "agentToolsClear", id: agent.id });
    for (const msg of agentSnapshotMessages(agent)) this.store.broadcast(msg);
  }

  private tick(): void {
    for (const agent of this.store.values()) {
      this.readNewLines(agent);
    }
  }

  /** Bir chunk (MAX_READ_BYTES) yangi baytlarni o'qiydi. Yana o'qish mumkin
   *  bo'lsa (fayl offset'dan katta) true qaytaradi (drain sikli uchun). */
  private readNewLines(agent: AgentState): boolean {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(agent.filePath);
    } catch {
      return false; // fayl hali yo'q yoki o'chirilgan
    }
    if (stat.size <= agent.fileOffset) {
      if (stat.size < agent.fileOffset) {
        // Fayl qisqargan/almashgan (in-place truncate) — holatni JIMGINA qaytadan
        // tiklaymiz (butun tarix broadcast bo'lib flood qilmasin), so'ng snapshot.
        agent.outputTokens = 0; // qayta o'qishda output takror hisoblanmasin
        this.primeFromStart(agent);
        this.emitSnapshot(agent);
      }
      return false;
    }
    const toRead = Math.min(stat.size - agent.fileOffset, MAX_READ_BYTES);
    const buf = Buffer.alloc(toRead);
    let bytesRead = 0;
    let fd: number | undefined;
    try {
      fd = fs.openSync(agent.filePath, "r");
      bytesRead = fs.readSync(fd, buf, 0, toRead, agent.fileOffset);
    } catch {
      return false;
    } finally {
      // fd HAR DOIM yopiladi — readSync xato bersa ham (aks holda handle leak).
      if (fd !== undefined) {
        try {
          fs.closeSync(fd);
        } catch {
          /* ignore */
        }
      }
    }
    if (bytesRead <= 0) return false;
    agent.fileOffset += bytesRead;

    // StringDecoder chunk chegarasidagi tugamagan ko'p-baytli belgini saqlaydi
    // (64KB o'rtasida UTF-8 belgi buzilmasin).
    if (!agent.lineDecoder) agent.lineDecoder = new StringDecoder("utf8");
    const chunk = agent.lineDecoder.write(bytesRead < buf.length ? buf.subarray(0, bytesRead) : buf);
    const text = agent.lineBuffer + chunk;
    const lines = text.split("\n");
    agent.lineBuffer = lines.pop() ?? ""; // oxirgi qism-qatorni saqlaymiz
    // Cheksiz o'sishdan himoya — juda uzun tugamagan qatorni tashlaymiz.
    if (agent.lineBuffer.length > MAX_LINE_CHARS) agent.lineBuffer = "";
    for (const line of lines) {
      processTranscriptLine(this.store, agent, line);
    }
    // Yana o'qiladigan bayt qoldi (fayl > MAX_READ_BYTES) → drain davom etsin.
    return agent.fileOffset < stat.size;
  }
}
