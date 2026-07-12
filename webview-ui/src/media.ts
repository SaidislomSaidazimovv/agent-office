import { isVsCode, send } from "./transport";

// ── Ofis surati / klipi ──────────────────────────────────────
// PNG — canvas.toDataURL (Canvas'da `preserveDrawingBuffer: true` shu uchun).
// Klip — canvas.captureStream + MediaRecorder → WebM. GIF ATAYLAB olinmadi:
// u tashqi kodlovchi kutubxona talab qiladi (og'ir, yangi bog'liqlik), WebM esa
// brauzerning O'ZIDA bor, sifati yaxshi va hajmi kichik.
// Saqlash: VS Code ichida — extension'ga yuboriladi (saqlash oynasi chiqadi).
// Brauzerda (standalone CLI) — oddiy yuklab olish. Hech qayerga JO'NATILMAYDI.

export const CLIP_MS = 6000;

function canvasEl(): HTMLCanvasElement | null {
  return document.querySelector("canvas");
}

/** Klip yozib olish mumkinmi (MediaRecorder + captureStream bor-yo'qligi). */
export function canRecord(): boolean {
  const c = canvasEl();
  return !!c && typeof (c as HTMLCanvasElement).captureStream === "function" && typeof MediaRecorder !== "undefined";
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function download(kind: "png" | "webm", b64: string): void {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([buf], { type: kind === "png" ? "image/png" : "video/webm" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `agent-office-${stamp()}.${kind}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function save(kind: "png" | "webm", b64: string): void {
  if (isVsCode) send({ type: "saveMedia", kind, data: b64 });
  else download(kind, b64);
}

/** Joriy kadrni PNG qilib saqlaydi. */
export function captureImage(): boolean {
  const c = canvasEl();
  if (!c) return false;
  const url = c.toDataURL("image/png");
  const b64 = url.split(",")[1];
  if (!b64) return false;
  save("png", b64);
  return true;
}

/** `ms` davomida klip yozadi. To'xtatish funksiyasini qaytaradi (erta to'xtatish uchun). */
export function recordClip(ms: number, onDone: (ok: boolean) => void): () => void {
  const c = canvasEl();
  if (!c || !canRecord()) { onDone(false); return () => {}; }
  const stream = c.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: "video/webm", videoBitsPerSecond: 4_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  rec.onstop = async () => {
    try {
      const buf = new Uint8Array(await new Blob(chunks, { type: "video/webm" }).arrayBuffer());
      let s = "";
      for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
      save("webm", btoa(s));
      onDone(true);
    } catch {
      onDone(false);
    }
  };
  rec.start();
  const timer = setTimeout(() => rec.state !== "inactive" && rec.stop(), ms);
  return () => { clearTimeout(timer); if (rec.state !== "inactive") rec.stop(); };
}
