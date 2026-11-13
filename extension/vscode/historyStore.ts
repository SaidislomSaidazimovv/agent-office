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
interface SessionAbs extends Stat { project: string; day: string; firstSeen: number; model?: string; }
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

/** Eski kunlar/sessiyalarni olib tashlaydi (KEEP_DAYS / SESSION_TTL_DAYS). */
function pruneData(data: HistoryData): void {
  const today = localDay();
  for (const date of Object.keys(data.days)) {
    if (daysBetween(date, today) > KEEP_DAYS) delete data.days[date];
  }
  for (const [sid, s] of Object.entries(data.sessions)) {
    if (daysBetween(s.day, today) > SESSION_TTL_DAYS) delete data.sessions[sid];
  }
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
  record(sessionId: string, project: string, cur: Stat, model?: string): void {
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
    // Model — kelmasa oldingisini saqlaymiz (statlar modeldan oldin kelishi mumkin).
    const abs: SessionAbs = { project, day, firstSeen, cost: cur.cost, inTok: cur.inTok, outTok: cur.outTok, tools: cur.tools, ms: cur.ms, model: model ?? prev?.model };
    this.data.sessions[sessionId] = abs;
    // Diskka yozishда qayta hisoblanadi (merge) — so'nggi ABSOLYUT qiymat yetarli.
    this.pending.set(sessionId, abs);
    this.dirty = true;
    this.scheduleSave();
  }

  /** Saqlanmagan sessiyalar — sessionId → so'nggi absolyut jami. */
  private pending = new Map<string, SessionAbs>();

  /** Diskdagi joriy holatni o'qiydi: null — buzuq (yozmaslik kerak). */
  private readDisk(): HistoryData | null {
    let raw: string;
    try {
      raw = fs.readFileSync(this.filePath(), "utf8");
    } catch (e) {
      return (e as NodeJS.ErrnoException).code === "ENOENT" ? { days: {}, sessions: {} } : null;
    }
    try {
      const o = JSON.parse(raw) as HistoryData;
      return o && typeof o === "object" && o.days && o.sessions && typeof o.days === "object" && typeof o.sessions === "object" ? o : null;
    } catch {
      return null;
    }
  }

  /** Webview'ga jo'natish uchun — kunlar ro'yxati (sana bo'yicha). */
  getDays(): { date: string; projects: Record<string, Stat> }[] {
    return Object.entries(this.data.days)
      .map(([date, projects]) => ({ date, projects }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /** So'nggi sessiyalar arxivi — eng yangi birinchi (nom keyin qo'shiladi). */
  getSessions(limit = 60): { sessionId: string; project: string; at: number; cost: number; inTok: number; outTok: number; tools: number; ms: number; model?: string }[] {
    return Object.entries(this.data.sessions)
      .map(([sessionId, s]) => ({
        sessionId,
        project: s.project,
        at: s.firstSeen ?? (Date.parse(`${s.day}T12:00:00`) || 0),
        cost: s.cost, inTok: s.inTok, outTok: s.outTok, tools: s.tools, ms: s.ms, model: s.model,
      }))
      .sort((a, b) => b.at - a.at)
      .slice(0, limit);
  }

  private prune(): void {
    pruneData(this.data);
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => { this.saveTimer = undefined; this.save(); }, 15000);
  }

  /** Atomik yozuv, BIRLASHTIRIB (merge). Bir nechta VS Code oynasi (va CLI)
   *  bitta history.json'ga yozadi. Avval har biri faylni BIR MARTA yuklab,
   *  keyin butun faylni o'z nusxasi bilan USTIDAN yozardi → boshqa oynaning
   *  yozuvlari o'chib ketardi. Endi: diskdagi JORIY holat qayta o'qiladi va
   *  har saqlanmagan sessiya uchun delta DISKDAGI oxirgi qiymatga nisbatan
   *  qo'shiladi — ikki oyna bir-birini o'chirmaydi va bitta sessiyani ikkalasi
   *  kuzatsa ham ikki marta hisoblanmaydi. corrupt bo'lsa — HECH NARSA yozmaydi. */
  save(): void {
    if (this.corrupt || !this.dirty) return;
    const disk = this.readDisk();
    if (!disk) {
      this.corrupt = true; // boshqa jarayon buzuq fayl qoldirgan — tegmaymiz
      return;
    }
    for (const [sid, cur] of this.pending) {
      const prev = disk.sessions[sid];
      const dcost = prev ? Math.max(0, cur.cost - prev.cost) : cur.cost;
      const din = prev ? Math.max(0, cur.inTok - prev.inTok) : cur.inTok;
      const dout = prev ? Math.max(0, cur.outTok - prev.outTok) : cur.outTok;
      const dtools = prev ? Math.max(0, cur.tools - prev.tools) : cur.tools;
      const dms = prev ? Math.max(0, cur.ms - prev.ms) : cur.ms;
      if (dcost || din || dout || dtools || dms || !prev) {
        const d = (disk.days[cur.day] ||= {});
        const s = (d[cur.project] ||= emptyStat());
        s.cost += dcost; s.inTok += din; s.outTok += dout; s.tools += dtools; s.ms += dms;
      }
      // Diskdagi qiymat KATTAROQ bo'lsa (boshqa oyna oldinroq yozgan) — kamaytirmaymiz.
      disk.sessions[sid] = {
        ...cur,
        firstSeen: Math.min(cur.firstSeen, prev?.firstSeen ?? cur.firstSeen),
        cost: Math.max(cur.cost, prev?.cost ?? 0),
        inTok: Math.max(cur.inTok, prev?.inTok ?? 0),
        outTok: Math.max(cur.outTok, prev?.outTok ?? 0),
        tools: Math.max(cur.tools, prev?.tools ?? 0),
        ms: Math.max(cur.ms, prev?.ms ?? 0),
        model: cur.model ?? prev?.model,
      };
    }
    pruneData(disk);
    try {
      const p = this.filePath();
      fs.mkdirSync(path.dirname(p), { recursive: true });
      const tmp = `${p}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(disk));
      fs.renameSync(tmp, p); // atomik almashtirish
      this.data = disk; // endi boshqa oynalarning yozuvlari ham ko'rinadi
      this.pending.clear();
      this.dirty = false;
    } catch {
      /* yoza olmasa — jim (tarix ixtiyoriy); pending saqlanadi, keyingi safar */
    }
  }

  /** Yopilishda — kutilayotgan yozuvni majburan saqlaymiz. */
  flush(): void {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = undefined; }
    this.save();
  }
}
