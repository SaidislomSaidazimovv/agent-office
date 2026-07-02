import { SOURCE, WS_URL } from "../config.js";
import { useSim, startSimulation } from "./simulation.js";

// ── Transport seam ───────────────────────────────────────────
// 3D qatlamni o'zgartirmasdan ma'lumot manbasini almashtirish nuqtasi.
// Har qanday manba yagona `applyEvent` orqali do'konni yangilaydi:
//   - "sim" (default): mavjud lokal simulyatsiya sikli (startSimulation).
//   - "ws": real backend'ga WebSocket ulanishi (hozircha STUB).
// `startTransport()` tozalash funksiyasini qaytaradi (startSimulation kabi).

/**
 * @typedef {import("./simulation.js").AgentEvent} AgentEvent
 */

/**
 * Bitta hodisani yagona kirish nuqtasi orqali do'konga qo'llaydi.
 * Real backend keladigan joy: ws.onmessage → applyEvent(event).
 * @param {AgentEvent} event
 */
export function applyEvent(event) {
  useSim.getState().applyEvent(event);
}

// WebSocket manbasi — STUB. Backend hali yo'q; ilovani buzmasligi shart.
function startWsTransport() {
  console.info(
    `[transport] WebSocket source selected (${WS_URL}) — awaiting backend (not yet implemented)`
  );

  let ws = null;
  try {
    ws = new WebSocket(WS_URL);

    ws.addEventListener("open", () =>
      console.info("[transport] WebSocket connected:", WS_URL)
    );
    ws.addEventListener("error", () =>
      console.warn("[transport] WebSocket unavailable (backend not running?):", WS_URL)
    );
    ws.addEventListener("message", (msg) => {
      // Kutilayotgan format: AgentEvent JSON. Backend tayyor bo'lganda shu yerda.
      try {
        const event = JSON.parse(msg.data);
        applyEvent(event);
      } catch (err) {
        console.warn("[transport] Ignoring malformed WS message:", err);
      }
    });
  } catch (err) {
    // Konstruktor xatosi (masalan noto'g'ri URL) — ilova baribir ishlashda davom etadi.
    console.warn("[transport] Failed to open WebSocket, staying idle:", err);
  }

  return () => {
    try {
      if (ws) ws.close();
    } catch {
      /* e'tiborsiz */
    }
  };
}

/**
 * Konfiguratsiyadagi manbani (config.SOURCE) o'qib, mos manbani ishga tushiradi.
 * @returns {() => void} tozalash (cleanup) funksiyasi.
 */
export function startTransport() {
  if (SOURCE === "ws") return startWsTransport();
  // "sim" (default): mavjud lokal simulyatsiya — xatti-harakat o'zgarmagan.
  return startSimulation();
}
