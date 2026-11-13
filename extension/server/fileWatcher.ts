import * as fs from "node:fs";
import * as path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { messageCost, type UsageLike } from "../core/pricing.js";
import { FILE_WATCHER_POLL_INTERVAL_MS, MAX_LINE_CHARS, MAX_READ_BYTES } from "../core/constants.js";

/** Shu hajmgacha transcript sinxron o'qiladi (bir necha o'n ms) — undan katta
 *  bo'lsa bo'laklab async (extension host qotmasin). */
export const PRIME_SYNC_MAX_BYTES = 4 * 1024 * 1024;
/** Async prime'da har shuncha bo'lakdan (×64KB) keyin event loop'ga navbat. */
const PRIME_CHUNKS_PER_YIELD = 8;
/** Sub-agent papkasi har shuncha tick'da (×500ms) tekshiriladi. */
const SUBAGENT_SCAN_EVERY = 4;
/** Sub-agent fayli bo'yicha dedupe uchun saqlanadigan so'nggi id'lar. */
const SUB_SEEN_CAP = 512;

/** Fayldan `offset`dan boshlab ko'pi bilan `max` bayt o'qiydi. */
function readChunk(file: string, offset: number, max: number): { bytes: Buffer; more: boolean } | null {
  let size: number;
  try {
    size = fs.statSync(file).size;
  } catch {
    return null;
  }
  if (size <= offset) return null;
  const len = Math.min(size - offset, max);
  const buf = Buffer.alloc(len);
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, "r");
    const n = fs.readSync(fd, buf, 0, len, offset);
    if (n <= 0) return null;
    return { bytes: n < len ? buf.subarray(0, n) : buf, more: offset + n < size };
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

/** Sub-agent transkript qatori — assistant javobi bo'lsa uning narxi (dedupe). */
function subagentLineCost(line: string, seen: Set<string>): number {
  if (!line || !line.includes('"usage"')) return 0;
  let o: { type?: string; message?: { id?: unknown; model?: unknown; usage?: UsageLike } };
  try {
    o = JSON.parse(line);
  } catch {
    return 0;
  }
  const m = o.message;
  if (o.type !== "assistant" || !m || !m.usage) return 0;
  if (typeof m.id === "string") {
    if (seen.has(m.id)) return 0;
    seen.add(m.id);
    if (seen.size > SUB_SEEN_CAP) {
      const first = seen.values().next().value;
      if (first !== undefined) seen.delete(first);
    }
  }
  const model = typeof m.model === "string" && m.model !== "<synthetic>" ? m.model : undefined;
  return messageCost(model, m.usage);
}
import type { AgentStateStore } from "./agentStateStore.js";
import { agentSnapshotMessages, tokenUsageMessage } from "./stateActions.js";
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
    agent.primeGen = (agent.primeGen ?? 0) + 1; // davom etayotgan async prime'ni bekor qiladi
    this.resetForReplay(agent);
    this.store.beginSilent();
    try {
      let guard = 0;
      // Butun mavjud faylni chunk-chunk o'qib tugatamiz (offset EOF'gacha).
      while (this.readNewLines(agent) && guard++ < 200_000) {
        /* davom */
      }
      this.readSubagents(agent, true);
    } finally {
      this.store.endSilent();
    }
  }

  /** Fayl hajmi (yo'q bo'lsa 0). */
  private sizeOf(agent: AgentState): number {
    try {
      return fs.statSync(agent.filePath).size;
    } catch {
      return 0;
    }
  }

  /** ADOPT: kichik transcript → SINXRON (avvalgidek: prime → add → snapshot).
   *  KATTA transcript (yuzlab MB bo'lishi mumkin) → sinxron o'qish butun
   *  extension host'ni (boshqa kengaytmalarni ham) soniyalab qotirardi. Shuning
   *  uchun avval agent qo'shiladi (personaj darrov ko'rinadi), tarix bo'laklab
   *  ASYNC o'qiladi (har bo'lak orasida event loop'ga navbat), so'ng snapshot. */
  primeAndAdd(agent: AgentState, add: () => void): void {
    if (this.sizeOf(agent) <= PRIME_SYNC_MAX_BYTES) {
      this.primeFromStart(agent);
      add();
      this.emitSnapshot(agent);
      return;
    }
    add();
    void this.primeAsync(agent);
  }

  /** /clear · /resume qayta biriktirish — agent allaqachon store'da. */
  reprime(agent: AgentState): void {
    if (this.sizeOf(agent) <= PRIME_SYNC_MAX_BYTES) {
      this.primeFromStart(agent);
      this.emitSnapshot(agent);
      return;
    }
    void this.primeAsync(agent);
  }

  /** Bo'laklab, bloklamasdan qayta o'qish. Faqat SHU agentning broadcast'lari
   *  o'chiriladi (boshqa agentlar jonli qoladi); tick bu agentni o'tkazib
   *  yuboradi (ikki o'quvchi bo'lmasin). Yangiroq prime boshlansa — to'xtaydi. */
  private async primeAsync(agent: AgentState): Promise<void> {
    const gen = (agent.primeGen = (agent.primeGen ?? 0) + 1);
    agent.priming = true;
    this.resetForReplay(agent);
    this.store.muteAgent(agent.id);
    let finished = false;
    try {
      let n = 0;
      while (agent.primeGen === gen && this.store.has(agent.id) && this.readNewLines(agent)) {
        if (++n % PRIME_CHUNKS_PER_YIELD === 0) await new Promise<void>((r) => setImmediate(r));
      }
      finished = agent.primeGen === gen;
      if (finished) this.readSubagents(agent, true);
    } finally {
      this.store.unmuteAgent(agent.id);
      if (agent.primeGen === gen) agent.priming = false;
    }
    if (finished && this.store.has(agent.id)) this.emitSnapshot(agent);
  }

  /** Qayta o'qishdan oldin holatni 0ga qaytaradi. */
  private resetForReplay(agent: AgentState): void {
    agent.fileOffset = 0;
    agent.lineBuffer = "";
    agent.lineDecoder = undefined; // yangi UTF-8 dekoder
    // Faylni 0dan qayta o'qiymiz → TOKEN AKKUMULYATORLARINI ham nolga tushiramiz.
    // Aks holda emitTokens `billed* += …` va `outputTokens += …` mavjud qiymat
    // USTIGA qo'shadi → /clear, /resume va fayl-truncate'dan keyin XARAJAT
    // (billed'dan hisoblanadi) ikki barobar bo'lardi. inputTokens SET bo'ladi
    // (qo'shilmaydi), lekin izchillik uchun uni ham nollaymiz.
    agent.inputTokens = 0;
    agent.outputTokens = 0;
    agent.billedInput = 0;
    agent.billedCacheWrite = 0;
    agent.billedCacheRead = 0;
    agent.costUsd = 0;
    agent.toolCats = {}; // qayta o'qishda tool turkumlari ikki barobar bo'lmasin
    agent.seenMsgIds.clear(); // 0dan qayta o'qiymiz — dedupe ham 0dan
    agent.subFiles = undefined; // sub-agent transkriptlari ham 0dan
    agent.subagentCostUsd = 0;
  }

  // ── Sub-agent transkriptlari (xarajat) ──
  // Claude Code har sub-agent (Task/Agent tool) suhbatini ALOHIDA faylga yozadi:
  // <sessiya-papka>/<sessionId>/subagents/agent-*.jsonl. Bu xabarlar asosiy
  // transkriptda YO'Q — o'qilmasa sub-agent sarfi xarajatda umuman ko'rinmasdi.
  // Faqat usage o'qiladi (holat/tool asosiy transkriptdan); har fayl o'z
  // dedupe'i bilan, har javob o'z modeli narxida (core/pricing.ts).
  private subagentsDir(agent: AgentState): string {
    return path.join(path.dirname(agent.filePath), path.basename(agent.filePath, ".jsonl"), "subagents");
  }

  /** drain=true — fayllar oxirigacha jimgina o'qiladi (prime). Aks holda har
   *  fayldan bitta bo'lak va xarajat o'zgarsa agentTokenUsage yuboriladi. */
  private readSubagents(agent: AgentState, drain: boolean): void {
    let names: string[];
    try {
      names = fs.readdirSync(this.subagentsDir(agent)).filter((n) => n.endsWith(".jsonl"));
    } catch {
      return; // sub-agent yo'q
    }
    const files = (agent.subFiles ??= new Map());
    let added = 0;
    for (const name of names) {
      let cur = files.get(name);
      if (!cur) files.set(name, (cur = { offset: 0, buf: "", seen: new Set() }));
      const file = path.join(this.subagentsDir(agent), name);
      let guard = 0;
      do {
        const r = readChunk(file, cur.offset, MAX_READ_BYTES);
        if (!r) break;
        cur.offset += r.bytes.length;
        cur.dec ??= new StringDecoder("utf8");
        const lines = (cur.buf + cur.dec.write(r.bytes)).split("\n");
        cur.buf = lines.pop() ?? "";
        if (cur.buf.length > MAX_LINE_CHARS) cur.buf = "";
        for (const line of lines) added += subagentLineCost(line, cur.seen);
        if (!r.more) break;
      } while (drain && guard++ < 100_000);
    }
    if (added > 0) {
      agent.subagentCostUsd = (agent.subagentCostUsd ?? 0) + added;
      agent.costUsd += added;
      if (!drain) this.store.broadcast(tokenUsageMessage(agent));
    }
  }

  /** Agentning JORIY holatini webview'ga yuboradi (adopt/rebind'dan keyin).
   *  Avval eski indikatorlarni tozalab, so'ng snapshot qo'llaymiz. */
  emitSnapshot(agent: AgentState): void {
    this.store.broadcast({ type: "agentToolsClear", id: agent.id });
    for (const msg of agentSnapshotMessages(agent)) this.store.broadcast(msg);
  }

  private tickN = 0;
  private tick(): void {
    // Sub-agent papkalari har ~2 soniyada (readdir arzon, lekin har 500ms shart emas).
    const subScan = this.tickN++ % SUBAGENT_SCAN_EVERY === 0;
    for (const agent of this.store.values()) {
      if (agent.priming) continue; // async prime o'qiyapti — ikki o'quvchi bo'lmasin
      this.readNewLines(agent);
      if (subScan) this.readSubagents(agent, false);
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
        // (Token akkumulyatorlarini primeFromStart nollaydi — double-count yo'q.)
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
