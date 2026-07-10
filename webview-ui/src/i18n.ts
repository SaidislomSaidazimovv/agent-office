import { create } from "zustand";
import { persist } from "zustand/middleware";

// ── Ko'p tillilik (uz/ru/eng) ────────────────────────────────────────
// Yengil, kutubxonasiz. `dict` kalitlari uch tilda. `useT()` reaktiv (til
// almashganda komponent qayta render bo'ladi). Til localStorage'da saqlanadi.

export type Lang = "uz" | "ru" | "en";
export const LANGS: { key: Lang; label: string; flag: string }[] = [
  { key: "uz", label: "O'zbekcha", flag: "🇺🇿" },
  { key: "ru", label: "Русский", flag: "🇷🇺" },
  { key: "en", label: "English", flag: "🇬🇧" },
];

const dict = {
  // Top bar
  "hud.soundOn": { uz: "Ovoz yoqiq (bosib o'chiring)", ru: "Звук вкл (нажмите, чтобы выключить)", en: "Sound on (click to mute)" },
  "hud.soundOff": { uz: "Ovoz o'chiq (bosib yoqing)", ru: "Звук выкл (нажмите, чтобы включить)", en: "Sound off (click to enable)" },
  "hud.daylightOn": { uz: "Kun/tun sikli — real soatga bog'liq", ru: "Цикл день/ночь — по реальному времени", en: "Day/night cycle — follows real time" },
  "hud.daylightOff": { uz: "Doimiy kunduzgi yorug'lik", ru: "Постоянный дневной свет", en: "Constant daylight" },
  "hud.feed": { uz: "Faoliyat tasmasi", ru: "Лента активности", en: "Activity feed" },
  "hud.feedEmpty": { uz: "Hozircha hodisa yo'q", ru: "Пока событий нет", en: "No events yet" },
  "hud.agents": { uz: "agent", ru: "агентов", en: "agents" },
  // Kamera / tahrir
  "cam.inside": { uz: "🚶 Ichki", ru: "🚶 Внутри", en: "🚶 Inside" },
  "cam.top": { uz: "🔭 Yuqori", ru: "🔭 Сверху", en: "🔭 Top" },
  "cam.insideTip": { uz: "Ichkidan yurib kuzatish", ru: "Прогулка от первого лица", en: "Walk around in first person" },
  "cam.topTip": { uz: "Yuqoridan (izometrik)", ru: "Сверху (изометрия)", en: "Top-down (isometric)" },
  "edit.start": { uz: "✏️ Tahrir", ru: "✏️ Правка", en: "✏️ Edit" },
  "edit.done": { uz: "✓ Tayyor", ru: "✓ Готово", en: "✓ Done" },
  "edit.tip": { uz: "Ofis jihozlarini tahrirlash", ru: "Редактировать мебель офиса", en: "Edit office furniture" },
  // +Agent
  "agent.add": { uz: "+ Agent", ru: "+ Агент", en: "+ Agent" },
  "agent.addTitle": { uz: "Yangi agent qo'shish", ru: "Добавить нового агента", en: "Add a new agent" },
  "agent.launch": { uz: "➕ Agent qo'shish", ru: "➕ Добавить агента", en: "➕ Add agent" },
  "agent.roleAuto": { uz: "Rol terminaldagi ish bo'yicha avtomatik aniqlanadi.", ru: "Роль определяется автоматически по работе в терминале.", en: "Role is auto-detected from terminal activity." },
  "agent.folder": { uz: "Papka", ru: "Папка", en: "Folder" },
  // Bo'sh holat
  "empty.title": { uz: "Ofis hozircha bo'sh", ru: "Офис пока пуст", en: "The office is empty" },
  "empty.body": { uz: "+ Agent tugmasini bosing — yangi Claude Code terminali ochiladi va uning faoliyati shu ofisda jonli ko'rinadi.", ru: "Нажмите + Агент — откроется новый терминал Claude Code, и его активность оживёт в офисе.", en: "Click + Agent — a new Claude Code terminal opens and its activity comes alive in this office." },
  // Kamera maslahati (pastki lenta)
  "hint.iso": { uz: "🖱 Aylantirish uchun torting · g'ildirak masshtab · ←/→ agent tanlash", ru: "🖱 Тяните для вращения · колесо — масштаб · ←/→ выбор агента", en: "🖱 Drag to rotate · wheel to zoom · ←/→ select agent" },
  "hint.fpv": { uz: "🖱 Qarash uchun bosing · WASD yurish · Esc chiqish", ru: "🖱 Клик — осмотр · WASD — ходьба · Esc — выход", en: "🖱 Click to look · WASD to walk · Esc to exit" },
  // Settings
  "settings.open": { uz: "Sozlamalar", ru: "Настройки", en: "Settings" },
  "settings.title": { uz: "⚙ Sozlamalar", ru: "⚙ Настройки", en: "⚙ Settings" },
  "settings.language": { uz: "Til", ru: "Язык", en: "Language" },
  "settings.daylight": { uz: "Kun/tun sikli", ru: "Цикл день/ночь", en: "Day/night cycle" },
  "settings.sound": { uz: "Ovoz", ru: "Звук", en: "Sound" },
  "settings.reducedMotion": { uz: "Kamaytirilgan harakat", ru: "Меньше анимации", en: "Reduced motion" },
  // Inspektor (asosiy)
  "insp.queue": { uz: "Navbat", ru: "Очередь", en: "Queue" },
  "insp.tool": { uz: "Tool", ru: "Инстр.", en: "Tool" },
  "insp.active": { uz: "Faol", ru: "Активно", en: "Active" },
  "insp.terminal": { uz: "💻 Terminal", ru: "💻 Терминал", en: "💻 Terminal" },
  "insp.move": { uz: "🪑 Ko'chirish", ru: "🪑 Переместить", en: "🪑 Move" },
  "insp.close": { uz: "✕ Yopish", ru: "✕ Закрыть", en: "✕ Close" },
  // Status yorliqlari
  "status.idle": { uz: "Kutmoqda", ru: "Ожидание", en: "Idle" },
  "status.thinking": { uz: "O'ylanmoqda", ru: "Думает", en: "Thinking" },
  "status.working": { uz: "Ishlamoqda", ru: "Работает", en: "Working" },
  "status.review": { uz: "Tasdiq kutmoqda", ru: "Ждёт подтверждения", en: "Awaiting approval" },
  "status.blocked": { uz: "Bloklangan", ru: "Заблокирован", en: "Blocked" },
  "status.collab": { uz: "Hamkorlikda", ru: "Совместно", en: "Collaborating" },
  // Rol yorliqlari
  "role.research": { uz: "Tadqiqot", ru: "Исследование", en: "Research" },
  "role.frontend": { uz: "Frontend", ru: "Фронтенд", en: "Frontend" },
  "role.backend": { uz: "Backend", ru: "Бэкенд", en: "Backend" },
  "role.qa": { uz: "QA / Review", ru: "QA / Ревью", en: "QA / Review" },
  "role.docs": { uz: "Hujjatlar", ru: "Документация", en: "Docs" },
  "role.data": { uz: "Ma'lumot", ru: "Данные", en: "Data" },
} as const;

export type Key = keyof typeof dict;

interface LangState {
  lang: Lang;
  setLang(l: Lang): void;
}
export const useLang = create<LangState>()(
  persist((set) => ({ lang: "uz", setLang: (lang) => set({ lang }) }), { name: "agent-office.lang" }),
);

/** Reaktiv bo'lmagan qidiruv (React tashqarisi uchun). */
export function translate(lang: Lang, key: Key): string {
  const e = dict[key];
  return (e && (e[lang] ?? e.uz)) || key;
}

/** Reaktiv hook — bu komponent til almashganda qayta render bo'ladi. */
export function useT(): (key: Key) => string {
  const lang = useLang((s) => s.lang);
  return (key: Key) => translate(lang, key);
}
