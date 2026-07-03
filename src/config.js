// ── Agentlar konfiguratsiyasi ────────────────────────────────
// model:      public/models/ ichidagi GLB fayl nomi (masalan nova.glb)
// clips:      GLB ichidagi animatsiya kliplari nomi. Mixamo'dan Blender orqali
//             birlashtirganda kliplarga aynan shu nomlarni bering, yoki bu
//             xaritani o'z klip nomlaringizga moslang.
// yOffset/scale/rotY: har bir model uchun stulga o'tqazish sozlamalari —
//             modellar o'lchami har xil bo'ladi, shu yerda to'g'rilanadi.

export const STATUS = {
  idle:     { label: "Kutmoqda",        hex: "#9AA3AF" },
  thinking: { label: "O'ylanmoqda",     hex: "#FFD60A" },
  working:  { label: "Ishlamoqda",      hex: "#30D158" },
  review:   { label: "Tasdiq kutmoqda", hex: "#FF9F0A" },
  blocked:  { label: "Bloklangan",      hex: "#FF453A" },
  collab:   { label: "Hamkorlikda",     hex: "#0A84FF" },
};

// Holat → klip nomi (default xarita; har agentda clips bilan qayta yozish mumkin)
export const DEFAULT_CLIPS = {
  idle: "SittingIdle",
  thinking: "Thinking",
  working: "Typing",
  review: "SittingIdle",
  blocked: "Frustrated",
  collab: "Typing",
};

export const AGENTS = [
  {
    id: "nova", name: "Nova", role: "Research Agent", model: "claude-opus-4-8",
    glb: "/models/nova-research-women.glb", scale: 1.0, yOffset: 0, rotY: 0, clips: {},
    fallbackColors: { top: "#5f6f83", pants: "#2e3440", skin: "#eab894" },
    gear: "books", screen: "doc",
    tasks: ["Raqobatchilar tahlili", "Bozor segmentatsiyasi", "Manbalarni tekshirish", "Trend hisoboti"],
  },
  {
    id: "pixel", name: "Pixel", role: "Frontend Agent", model: "claude-sonnet-4-6",
    glb: "/models/pixel-frontend-developer.glb", scale: 1.0, yOffset: 0, rotY: 0, clips: {},
    fallbackColors: { top: "#584a86", pants: "#23262e", skin: "#f3c9a8" },
    gear: "dualmon", screen: "design",
    tasks: ["Dashboard komponenti", "Responsive layout fix", "Dark mode qo'llash", "Animatsiya optimizatsiyasi"],
  },
  {
    id: "forge", name: "Forge", role: "Backend Agent", model: "claude-sonnet-4-6",
    glb: "/models/forge-backend-developer.glb", scale: 1.0, yOffset: 0, rotY: 0, clips: {},
    fallbackColors: { top: "#2a2e35", pants: "#383e47", skin: "#c98d55" },
    gear: "server", screen: "code",
    tasks: ["API endpoint yozish", "DB migratsiya", "Auth middleware", "Webhook integratsiya"],
  },
  {
    id: "lint", name: "Lint", role: "QA / Review", model: "claude-haiku-4-5",
    glb: "/models/qa-review-man.glb", scale: 1.0, yOffset: 0, rotY: 0, clips: {},
    fallbackColors: { top: "#a9c4dc", pants: "#39404d", skin: "#f6d7b5" },
    gear: "qa", screen: "tests",
    tasks: ["PR #142 tekshiruvi", "Test coverage tahlili", "Regression testlar", "Xavfsizlik auditi"],
  },
  {
    id: "scribe", name: "Scribe", role: "Docs Agent", model: "claude-haiku-4-5",
    glb: "/models/scribe-docs-man.glb", scale: 1.0, yOffset: 0, rotY: 0, clips: {},
    fallbackColors: { top: "#c0913a", pants: "#4b4237", skin: "#e3b078" },
    gear: "docs", screen: "doc",
    tasks: ["API hujjatlari", "Changelog yozish", "Onboarding qo'llanma", "README yangilash"],
  },
  {
    id: "scout", name: "Scout", role: "Data Agent", model: "claude-sonnet-4-6",
    glb: "/models/scor-data-woman.glb", scale: 1.0, yOffset: 0, rotY: 0, clips: {},
    fallbackColors: { top: "#e4e7ec", pants: "#30393a", skin: "#a06f42" },
    gear: "chart", screen: "chart",
    tasks: ["ETL pipeline", "Anomaliya qidiruvi", "Haftalik metrikalar", "Ma'lumot tozalash"],
  },
];

// Ish joylari: chap va o'ng ustunlar (3+3), hamma markazdagi Atlas'ga qaraydi.
// Markaziy o'q bo'sh qoladi — hech kim Atlas ortida turmaydi.
export const SPOTS = [
  { x: -5.5, z: -3.2, ry: -Math.PI / 2 }, // nova  — chap orqa
  { x: -5.5, z: 0,    ry: -Math.PI / 2 }, // pixel — chap markaz
  { x: -5.5, z: 3.2,  ry: -Math.PI / 2 }, // forge — chap old
  { x: 5.5,  z: -3.2, ry: Math.PI / 2 },  // lint  — o'ng orqa
  { x: 5.5,  z: 0,    ry: Math.PI / 2 },  // scribe— o'ng markaz
  { x: 5.5,  z: 3.2,  ry: Math.PI / 2 },  // scout — o'ng old
];

export const EVENT_VERBS = {
  assigned: "vazifa oldi",
  working: "bajarishni boshladi",
  review: "tasdiqqa yubordi",
  blocked: "to'siqqa uchradi",
  done: "vazifani yakunladi",
  collab: "bilan hamkorlik boshladi",
};

// ── Ma'lumot manbasi (transport) ─────────────────────────────
// SOURCE: "sim" — lokal fake simulyatsiya (default), "ws" — real backend (WebSocket).
// WS_URL: SOURCE="ws" bo'lganda ulanadigan WebSocket manzili.
// Qiymatlar .env orqali beriladi (.env.example ga qarang).
export const SOURCE = import.meta.env.VITE_SOURCE || "sim";
export const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8787";
