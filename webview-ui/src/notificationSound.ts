// ── Ovozli bildirishnomalar (Web Audio) ─────────────────────
// Autoplay siyosati tufayli birinchi foydalanuvchi harakatida "unlock".

let ctx: AudioContext | null = null;
let unlocked = false;

export function unlockAudio(): void {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch {
      return;
    }
  }
  if (ctx.state === "suspended") void ctx.resume();
  unlocked = true;
}

function tone(freqs: number[], step = 0.12): void {
  if (!ctx || !unlocked) return;
  const now = ctx.currentTime;
  freqs.forEach((f, i) => {
    const o = ctx!.createOscillator();
    const g = ctx!.createGain();
    o.type = "sine";
    o.frequency.value = f;
    const t0 = now + i * step;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + step);
    o.connect(g).connect(ctx!.destination);
    o.start(t0);
    o.stop(t0 + step);
  });
}

/** Navbat tugadi — ko'tarilib jaranglaydi (E5→G5). */
export function playDone(): void {
  tone([659.25, 783.99]);
}

/** Ruxsat so'raldi — diqqat jarangi (A5→E5). */
export function playPermission(): void {
  tone([880.0, 659.25]);
}
