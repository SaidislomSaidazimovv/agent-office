import * as fs from "fs";
import * as os from "os";
import * as path from "path";

// ── Tarix saqlashi (host) ────────────────────────────────────
// Kunlik / loyiha bo'yicha xarajat+token+tool tarixini `~/.agent-office/history.json`
// ga yozadi. XAVFSIZLIK: (1) atomik yozuv (temp + rename); (2) mavjud fayl
// PARSE bo'lmasa — USTIDAN YOZMAYMIZ (ma'lumot yo'qolmasin); (3) lokal —
// hech qayerga jo'natilmaydi. Cost webview'da hisoblangan (pricing) va shu yerga
// keladi; host faqat yig'adi (o'lchangan, to'qib chiqarilmagan).

interface Stat { cost: number; inTok: number; outTok: number; tools: number; ms: number; }
interface SessionAbs extends Stat { project: string; day: string; firstSeen: number; }
interface HistoryData {
  /** date (YYYY-MM-DD) → project → jamlanma. */
  days: Record<string, Record<string, Stat>>;
  /** sessionId → so'nggi ABSOLYUT jami (delta hisoblash uchun). */
  sessions: Record<string, SessionAbs>;
}

const KEEP_DAYS = 120; // trend uchun ~4 oy
const SESSION_TTL_DAYS = 60; // arxiv uchun ~2 oy (delta bazasi + so'nggi sessiyalar)

function emptyStat(): Stat { return { cost: 0, inTok: 0, outTok: 0, tools: 0, ms: 0 }; }
function localDay(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function daysBetween(a: string, b: string): number {
  return Math.abs((Date.parse(b + "T00:00:00") - Date.parse(a + "T00:00:00")) / 86400000);
}

export class HistoryStore {
  private data: HistoryData = { days: {}, sessions: {} };
  private loaded = false;
  /** Fayl mavjud, lekin buzuq → USTIDAN YOZMAYMIZ. */
  private corrupt = false;
  private dirty = false;
  private saveTimer?: ReturnType<typeof setTimeout>;

  private filePath(): string {
    return path.join(os.homedir(), ".agent-office", "history.json");
  }

  load(): void {
    if (this.loaded) return;
    try {
      const raw = fs.readFileSync(this.filePath(), "utf8");
      const o = JSON.parse(raw) as HistoryData;
      if (o && typeof o === "object" && o.days && o.sessions && typeof o.days === "object" && typeof o.sessions === "object") {
        this.data = o;
      } else {
        this.corrupt = true; // mavjud, lekin noto'g'ri shakl → yozmaymiz
      }
    } catch (e) {
      // Fayl yo'q (ENOENT) → yangi boshlaymiz (yozish mumkin). Parse xatosi
      // (buzuq) → USTIDAN YOZMAYMIZ (foydalanuvchi ma'lumoti saqlanib qolsin).
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") this.corrupt = true;
    }
    this.loaded = true;
    this.prune();
  }

  /** Bitta sessiyaning JORIY absolyut jamini yozadi — o'sish (delta) bugungi
   *  kunga qo'shiladi. cur.* kamaymaydi (jami faqat o'sadi); kamaysa 0 deb olamiz. */
  record(sessionId: string, project: string, cur: Stat): void {
    if (!sessionId || !project) return;
    const day = localDay();
    const prev = this.data.sessions[sessionId];
    const dcost = prev ? Math.max(0, cur.cost - prev.cost) : cur.cost;
    const din = prev ? Math.max(0, cur.inTok - prev.inTok) : cur.inTok;
    const dout = prev ? Math.max(0, cur.outTok - prev.outTok) : cur.outTok;
    const dtools = prev ? Math.max(0, cur.tools - prev.tools) : cur.tools;
    const dms = prev ? Math.max(0, cur.ms - prev.ms) : cur.ms;
    if (dcost || din || dout || dtools || dms || !prev) {
      const d = (this.data.days[day] ||= {});
      const s = (d[project] ||= emptyStat());
      s.cost += dcost; s.inTok += din; s.outTok += dout; s.tools += dtools; s.ms += dms;
    }
    const firstSeen = prev?.firstSeen ?? Date.now();
    this.data.sessions[sessionId] = { project, day, firstSeen, cost: cur.cost, inTok: cur.inTok, outTok: cur.outTok, tools: cur.tools, ms: cur.ms };
    this.dirty = true;
    this.scheduleSave();
  }

  /** Webview'ga jo'natish uchun — kunlar ro'yxati (sana bo'yicha). */
  getDays(): { date: string; projects: Record<string, Stat> }[] {
    return Object.entries(this.data.days)
      .map(([date, projects]) => ({ date, projects }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /** So'nggi sessiyalar arxivi — eng yangi birinchi (nom keyin qo'shiladi). */
  getSessions(limit = 60): { sessionId: string; project: string; at: number; cost: number; inTok: number; outTok: number; tools: number; ms: number }[] {
    return Object.entries(this.data.sessions)
      .map(([sessionId, s]) => ({
        sessionId,
        project: s.project,
        at: s.firstSeen ?? (Date.parse(`${s.day}T12:00:00`) || 0),
        cost: s.cost, inTok: s.inTok, outTok: s.outTok, tools: s.tools, ms: s.ms,
      }))
      .sort((a, b) => b.at - a.at)
      .slice(0, limit);
  }

  private prune(): void {
    const today = localDay();
    for (const date of Object.keys(this.data.days)) {
      if (daysBetween(date, today) > KEEP_DAYS) delete this.data.days[date];
    }
    for (const [sid, s] of Object.entries(this.data.sessions)) {
      if (daysBetween(s.day, today) > SESSION_TTL_DAYS) delete this.data.sessions[sid];
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => { this.saveTimer = undefined; this.save(); }, 15000);
  }

  /** Atomik yozuv. corrupt bo'lsa — HECH NARSA yozmaydi. */
  save(): void {
    if (this.corrupt || !this.dirty) return;
    try {
      const p = this.filePath();
      fs.mkdirSync(path.dirname(p), { recursive: true });
      const tmp = `${p}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      fs.renameSync(tmp, p); // atomik almashtirish
      this.dirty = false;
    } catch {
      /* yoza olmasa — jim (tarix ixtiyoriy) */
    }
  }

  /** Yopilishda — kutilayotgan yozuvni majburan saqlaymiz. */
  flush(): void {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = undefined; }
    this.save();
  }
}
