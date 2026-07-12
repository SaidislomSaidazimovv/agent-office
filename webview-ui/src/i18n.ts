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
  "settings.reducedMotionHint": { uz: "Nafas, pirpirash va o'simlik tebranishi to'xtaydi. Yurish qoladi.", ru: "Дыхание, моргание и колыхание растений останавливаются. Ходьба остаётся.", en: "Breathing, blinking and plant sway stop. Walking stays." },
  "settings.reset": { uz: "Standart", ru: "Сброс", en: "Reset" },
  "settings.groupLook": { uz: "Ko'rinish", ru: "Вид", en: "Appearance" },
  "settings.groupMotion": { uz: "Harakat", ru: "Движение", en: "Motion" },
  "settings.groupPerf": { uz: "Unumdorlik", ru: "Производительность", en: "Performance" },
  "settings.groupCost": { uz: "Xarajat", ru: "Затраты", en: "Cost" },
  "settings.labels": { uz: "Agent yorliqlari", ru: "Подписи агентов", en: "Agent labels" },
  "settings.showCost": { uz: "Xarajatni ko'rsatish", ru: "Показывать затраты", en: "Show cost" },
  "settings.showCostHint": { uz: "Yuqori panel va inspektorda. Analitika panelida baribir ko'rinadi.", ru: "В верхней панели и инспекторе. В аналитике всё равно видно.", en: "In the top bar and inspector. Analytics still shows it." },
  "settings.wander": { uz: "Bo'sh vaqtda sayr", ru: "Прогулки в простое", en: "Idle wandering" },
  "settings.social": { uz: "Uchrashuvlar", ru: "Встречи", en: "Meetings" },
  "settings.socialHint": { uz: "Sayr o'chiq bo'lsa ta'sir qilmaydi.", ru: "Не действует, если прогулки выключены.", en: "No effect while wandering is off." },
  "settings.follow": { uz: "Kamera tanlanganni kuzatadi", ru: "Камера следит за выбранным", en: "Camera follows selection" },
  "settings.qualityHigh": { uz: "Yuqori", ru: "Высокое", en: "High" },
  "settings.qualityLow": { uz: "Tejamkor", ru: "Экономный", en: "Saver" },
  "settings.qualityHint": { uz: "Tejamkor: past piksel zichligi + kamroq soya yangilanishi.", ru: "Экономный: ниже плотность пикселей + реже обновление теней.", en: "Saver: lower pixel density + fewer shadow updates." },
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
  // Top bar — hook/xarajat maslahatlari
  "hud.hookTip": { uz: "Jonli hook oqimi (ishonchli aniqlash)", ru: "Живой поток хуков (надёжно)", en: "Live hook stream (reliable)" },
  "hud.jsonlTip": { uz: "Faqat JSONL kuzatuvi (hook ulanmagan)", ru: "Только наблюдение JSONL (без хуков)", en: "JSONL watching only (no hooks)" },
  "hud.costTip": { uz: "Barcha sessiyalar taxminiy xarajati — rasmiy narxlar", ru: "Примерная стоимость всех сессий — офиц. цены", en: "Estimated cost of all sessions — official prices" },
  "feed.title": { uz: "📜 Faoliyat", ru: "📜 Активность", en: "📜 Activity" },
  "feed.close": { uz: "Tasmani yopish", ru: "Закрыть ленту", en: "Close feed" },
  // Faoliyat hodisalari
  "event.joined": { uz: "ofisga qo'shildi", ru: "вошёл в офис", en: "joined the office" },
  "event.left": { uz: "ofisdan chiqdi", ru: "покинул офис", en: "left the office" },
  "event.permission": { uz: "ruxsat so'radi 🔔", ru: "запросил разрешение 🔔", en: "requested permission 🔔" },
  "event.blocked": { uz: "bloklandi (xato) ⛔", ru: "заблокирован (ошибка) ⛔", en: "blocked (error) ⛔" },
  "event.helperDone": { uz: "yordamchi tugatdi ✓", ru: "помощник завершил ✓", en: "helper finished ✓" },
  "event.subHire": { uz: "sub-agent yolladi 🔧", ru: "нанял саб-агента 🔧", en: "hired a sub-agent 🔧" },
  // Agent pufaklari
  "bubble.subHire": { uz: "🔧 Sub-agent yolladi", ru: "🔧 Нанял саб-агента", en: "🔧 Hired a sub-agent" },
  "bubble.permission": { uz: "🔔 Ruxsat so'raldi", ru: "🔔 Запрошено разрешение", en: "🔔 Permission requested" },
  "bubble.helper": { uz: "🔧 Yordamchi", ru: "🔧 Помощник", en: "🔧 Helper" },
  // Inspektor
  "insp.changedFiles": { uz: "O'zgargan fayllar", ru: "Изменённые файлы", en: "Changed files" },
  "insp.changed": { uz: "o'zgargan", ru: "изменено", en: "changed" },
  "insp.context": { uz: "Kontekst", ru: "Контекст", en: "Context" },
  "insp.output": { uz: "chiqish", ru: "вывод", en: "output" },
  "insp.costTip": { uz: "Taxminiy — rasmiy narxlar. Kesh o'qish/yozish hisobga olingan.", ru: "Примерно — офиц. цены. Учтены чтение/запись кэша.", en: "Estimate — official prices. Cache read/write included." },
  "insp.cost": { uz: "💰 Xarajat", ru: "💰 Стоимость", en: "💰 Cost" },
  "insp.toolHistory": { uz: "🧰 Tool tarixi", ru: "🧰 История инструментов", en: "🧰 Tool history" },
  "insp.subagents": { uz: "Sub-agentlar", ru: "Саб-агенты", en: "Sub-agents" },
  "insp.moveTip": { uz: "Boshqa stolga ko'chirish", ru: "Переместить за другой стол", en: "Move to another desk" },
  "move.hint": { uz: "🪑 Yangi stolni tanlang (🟢 bo'sh · 🟠 almashtirish)", ru: "🪑 Выберите новый стол (🟢 свободный · 🟠 обмен)", en: "🪑 Pick a new desk (🟢 free · 🟠 swap)" },
  "common.cancel": { uz: "Bekor", ru: "Отмена", en: "Cancel" },
  "common.close": { uz: "Yopish", ru: "Закрыть", en: "Close" },
  "time.now": { uz: "hozir", ru: "сейчас", en: "now" },
  // Analitika dashboard
  "dash.open": { uz: "Analitika", ru: "Аналитика", en: "Analytics" },
  "dash.title": { uz: "📊 Analitika", ru: "📊 Аналитика", en: "📊 Analytics" },
  "dash.totalCost": { uz: "Jami xarajat", ru: "Всего затрат", en: "Total cost" },
  "dash.totalTokens": { uz: "Jami tokenlar", ru: "Всего токенов", en: "Total tokens" },
  "dash.activeAgents": { uz: "Faol agentlar", ru: "Активных агентов", en: "Active agents" },
  "dash.costOverTime": { uz: "Xarajat — vaqt bo'yicha", ru: "Затраты — во времени", en: "Cost over time" },
  "dash.byRole": { uz: "Rol bo'yicha xarajat", ru: "Затраты по ролям", en: "Cost by role" },
  "dash.agentsTable": { uz: "Agentlar", ru: "Агенты", en: "Agents" },
  "dash.noData": { uz: "Hali ma'lumot yo'q — agent qo'shing", ru: "Пока нет данных — добавьте агента", en: "No data yet — add an agent" },
  "dash.collecting": { uz: "Ma'lumot yig'ilmoqda (10s'da bir namuna)…", ru: "Сбор данных (образец каждые 10с)…", en: "Collecting data (a sample every 10s)…" },
  "dash.colRole": { uz: "Rol", ru: "Роль", en: "Role" },
  "dash.colCost": { uz: "Xarajat", ru: "Затраты", en: "Cost" },
  "dash.colTokens": { uz: "Tokenlar", ru: "Токены", en: "Tokens" },
  "dash.colTurns": { uz: "Navbat", ru: "Очередь", en: "Turns" },
  "dash.colTools": { uz: "Tool", ru: "Инстр.", en: "Tools" },
  "dash.colActive": { uz: "Faol", ru: "Активно", en: "Active" },
  "dash.estimate": { uz: "Taxminiy — rasmiy Claude narxlari", ru: "Примерно — офиц. цены Claude", en: "Estimate — official Claude prices" },
  // Xarajat budjeti (FAQAT ogohlantirish — hech narsa to'xtatilmaydi)
  "budget.title": { uz: "Budjet", ru: "Бюджет", en: "Budget" },
  "budget.label": { uz: "Xarajat budjeti ($)", ru: "Бюджет затрат ($)", en: "Cost budget ($)" },
  "budget.hint": { uz: "0 = o'chiq. Faqat ogohlantiradi — hech narsa to'xtatilmaydi.", ru: "0 = выкл. Только предупреждает — ничего не останавливается.", en: "0 = off. Warns only — nothing is stopped." },
  "budget.used": { uz: "ishlatildi", ru: "использовано", en: "used" },
  "budget.left": { uz: "qoldi", ru: "осталось", en: "left" },
  "budget.warnMsg": { uz: "Budjetning 80% dan oshdi ⚠️", ru: "Израсходовано более 80% бюджета ⚠️", en: "Over 80% of the budget ⚠️" },
  "budget.overMsg": { uz: "Budjetdan oshib ketdi 🚨", ru: "Бюджет превышен 🚨", en: "Budget exceeded 🚨" },
  "budget.tip": { uz: "Sessiya xarajat budjeti — ⚙ sozlamalarda o'zgartiriladi", ru: "Бюджет затрат сессии — меняется в ⚙ настройках", en: "Session cost budget — change it in ⚙ settings" },
  // Sessiya hisoboti (markdown eksport)
  "rep.open": { uz: "Sessiya hisoboti (markdown)", ru: "Отчёт о сессии (markdown)", en: "Session report (markdown)" },
  "rep.btn": { uz: "Hisobot", ru: "Отчёт", en: "Report" },
  "rep.panel": { uz: "📄 Sessiya hisoboti", ru: "📄 Отчёт о сессии", en: "📄 Session report" },
  "rep.copy": { uz: "Nusxalash", ru: "Скопировать", en: "Copy" },
  "rep.copied": { uz: "✓ Nusxalandi", ru: "✓ Скопировано", en: "✓ Copied" },
  "rep.hint": { uz: "Markdown — GitHub / Notion / Jira'ga joylashtiring", ru: "Markdown — вставьте в GitHub / Notion / Jira", en: "Markdown — paste into GitHub / Notion / Jira" },
  "rep.h1": { uz: "Agent Office — sessiya hisoboti", ru: "Agent Office — отчёт о сессии", en: "Agent Office — session report" },
  "rep.generated": { uz: "Yaratilgan", ru: "Создан", en: "Generated" },
  "rep.summary": { uz: "Xulosa", ru: "Сводка", en: "Summary" },
  "rep.metric": { uz: "Ko'rsatkich", ru: "Показатель", en: "Metric" },
  "rep.value": { uz: "Qiymat", ru: "Значение", en: "Value" },
  "rep.agents": { uz: "Agentlar", ru: "Агенты", en: "Agents" },
  "rep.agent": { uz: "Agent", ru: "Агент", en: "Agent" },
  "rep.model": { uz: "Model", ru: "Модель", en: "Model" },
  "rep.status": { uz: "Holat", ru: "Статус", en: "Status" },
  "rep.activeTime": { uz: "Faol vaqt", ru: "Активное время", en: "Active time" },
  "rep.share": { uz: "Ulush", ru: "Доля", en: "Share" },
  "rep.footer": { uz: "Taxminiy — rasmiy Claude narxlari. Agent Office faqat kuzatadi, hech narsani boshqarmaydi.", ru: "Примерно — офиц. цены Claude. Agent Office только наблюдает и ничем не управляет.", en: "Estimate — official Claude prices. Agent Office only observes; it controls nothing." },
  // Agent qidiruvi
  "search.open": { uz: "Agent qidirish", ru: "Поиск агента", en: "Find an agent" },
  "search.placeholder": { uz: "Papka, rol, holat yoki tool…", ru: "Папка, роль, статус или инструмент…", en: "Folder, role, status or tool…" },
  "search.none": { uz: "Mos agent topilmadi", ru: "Агент не найден", en: "No matching agent" },
  "search.hint": { uz: "↑↓ tanlash · Enter — ochish · Esc — yopish", ru: "↑↓ выбор · Enter — открыть · Esc — закрыть", en: "↑↓ to move · Enter to open · Esc to close" },
  // Kirish qo'llanmasi (onboarding)
  "tour.title": { uz: "Kirish qo'llanmasi", ru: "Знакомство", en: "Getting started" },
  "tour.next": { uz: "Keyingi", ru: "Далее", en: "Next" },
  "tour.skip": { uz: "O'tkazish", ru: "Пропустить", en: "Skip" },
  "tour.done": { uz: "Boshladik ✓", ru: "Начали ✓", en: "Let's go ✓" },
  "tour.replay": { uz: "Qo'llanmani qayta ko'rish", ru: "Показать знакомство снова", en: "Replay the tour" },
  "tour.welcome.t": { uz: "🏢 Agent Office'ga xush kelibsiz", ru: "🏢 Добро пожаловать в Agent Office", en: "🏢 Welcome to Agent Office" },
  "tour.welcome.b": { uz: "Bu ofis Claude Code sessiyalaringizni jonli ko'rsatadi. U faqat KUZATADI: transkriptlarni o'qiydi, hech narsani boshqarmaydi va hech qanday ma'lumot tashqariga chiqmaydi.", ru: "Этот офис показывает ваши сессии Claude Code вживую. Он только НАБЛЮДАЕТ: читает транскрипты, ничем не управляет, и ничего не покидает ваш компьютер.", en: "This office shows your Claude Code sessions live. It only OBSERVES: it reads transcripts, controls nothing, and no data ever leaves your machine." },
  "tour.add.t": { uz: "➕ Agent qo'shish", ru: "➕ Добавить агента", en: "➕ Add an agent" },
  "tour.add.b": { uz: "Yangi Claude Code terminali ochiladi va uning faoliyati shu ofisda jonlanadi. Roli terminaldagi ishga qarab o'zi aniqlanadi.", ru: "Откроется новый терминал Claude Code, и его работа оживёт в офисе. Роль определится сама — по тому, что вы делаете.", en: "A new Claude Code terminal opens and its activity comes alive here. The role is detected from what the terminal actually does." },
  "tour.agents.t": { uz: "🟢 Holatlar", ru: "🟢 Статусы", en: "🟢 Statuses" },
  "tour.agents.b": { uz: "Har agent rangi bilan gapiradi: yashil — ishlayapti, sariq — tasdiq kutmoqda, qizil — bloklangan. Bosing — kamera unga qaraydi.", ru: "Цвет говорит за агента: зелёный — работает, жёлтый — ждёт подтверждения, красный — заблокирован. Нажмите — камера покажет его.", en: "Colour speaks for each agent: green — working, amber — awaiting approval, red — blocked. Click one and the camera looks at it." },
  "tour.dash.t": { uz: "📊 Analitika", ru: "📊 Аналитика", en: "📊 Analytics" },
  "tour.dash.b": { uz: "Xarajat — vaqt bo'yicha, rol bo'yicha taqsimot va markdown hisobot. Budjet belgilasangiz — chegaraga yaqinlashganda ogohlantiradi.", ru: "Затраты во времени, разбивка по ролям и markdown-отчёт. Если задать бюджет — предупредит при приближении к лимиту.", en: "Cost over time, a breakdown by role, and a markdown report. Set a budget and it warns you as you approach the limit." },
  "tour.settings.t": { uz: "⚙ Sozlamalar", ru: "⚙ Настройки", en: "⚙ Settings" },
  "tour.settings.b": { uz: "Til, kun/tun sikli, yorliqlar, harakat, unumdorlik va budjet — hammasi shu yerda.", ru: "Язык, цикл день/ночь, подписи, движение, производительность и бюджет — всё здесь.", en: "Language, the day/night cycle, labels, motion, performance and the budget — all here." },
  "tour.camera.t": { uz: "🖱 Kamera", ru: "🖱 Камера", en: "🖱 Camera" },
  "tour.camera.b": { uz: "Aylantirish uchun torting, g'ildirak bilan masshtab. \"Ichki\" tugmasi ofis ichida yurishga o'tkazadi. Tayyor — ishni boshlang!", ru: "Тяните для вращения, колесо — масштаб. Кнопка «Внутри» — прогулка по офису. Готово — за работу!", en: "Drag to rotate, wheel to zoom. \"Inside\" drops you into a walk through the office. That's it — go build!" },
  // Layout editor
  "le.place": { uz: "Qo'yish:", ru: "Поставить:", en: "Place:" },
  "le.pack": { uz: "paket", ru: "пакет", en: "pack" },
  "le.addPack": { uz: "Asset paket qo'shish (JSON)", ru: "Добавить набор ассетов (JSON)", en: "Add asset pack (JSON)" },
  "le.rotate": { uz: "Aylantirish", ru: "Повернуть", en: "Rotate" },
  "le.delete": { uz: "O'chirish", ru: "Удалить", en: "Delete" },
  "le.floorColor": { uz: "Pol rangi", ru: "Цвет пола", en: "Floor color" },
  "le.floorReset": { uz: "Pol rangini tiklash", ru: "Сбросить цвет пола", en: "Reset floor color" },
  "le.wallColor": { uz: "Devor rangi", ru: "Цвет стен", en: "Wall color" },
  "le.wallReset": { uz: "Devor rangini tiklash", ru: "Сбросить цвет стен", en: "Reset wall color" },
  "le.theme": { uz: "Mavzu:", ru: "Тема:", en: "Theme:" },
  "le.undo": { uz: "Orqaga (undo)", ru: "Отменить", en: "Undo" },
  "le.redo": { uz: "Oldinga (redo)", ru: "Вернуть", en: "Redo" },
  "le.clear": { uz: "Hammasini tozalash", ru: "Очистить всё", en: "Clear all" },
  "le.clearShort": { uz: "Tozalash", ru: "Очистить", en: "Clear" },
  "le.layoutJson": { uz: "Layout JSON", ru: "Layout JSON", en: "Layout JSON" },
  "le.copyHint": { uz: "Nusxalash uchun tanlang · yoki JSON joylab \"Qo'llash\"", ru: "Выделите для копирования · или вставьте JSON и \"Применить\"", en: "Select to copy · or paste JSON and \"Apply\"" },
  "le.apply": { uz: "Qo'llash (import)", ru: "Применить (импорт)", en: "Apply (import)" },
  "le.assetPacks": { uz: "📦 Asset paketlari", ru: "📦 Наборы ассетов", en: "📦 Asset packs" },
  "le.file": { uz: "📂 Fayl", ru: "📂 Файл", en: "📂 File" },
  "le.load": { uz: "Yuklash", ru: "Загрузить", en: "Load" },
  "le.itemsAdded": { uz: "ta jihoz qo'shildi", ru: "элементов добавлено", en: "items added" },
  "le.invalidJson": { uz: "Yaroqsiz JSON", ru: "Неверный JSON", en: "Invalid JSON" },
  // Mebel katalogi
  "furniture.plant": { uz: "O'simlik", ru: "Растение", en: "Plant" },
  "furniture.desk": { uz: "Ish stoli", ru: "Стол", en: "Desk" },
  "furniture.sofa": { uz: "Divan", ru: "Диван", en: "Sofa" },
  "furniture.coffee": { uz: "Jurnal stoli", ru: "Журнальный стол", en: "Coffee table" },
  "furniture.meeting": { uz: "Majlis stoli", ru: "Стол для совещаний", en: "Meeting table" },
  "furniture.shelf": { uz: "Kitob javoni", ru: "Книжный шкаф", en: "Bookshelf" },
  "furniture.lamp": { uz: "Chiroq", ru: "Лампа", en: "Lamp" },
  // Mavzular
  "theme.warm": { uz: "Iliq", ru: "Тёплая", en: "Warm" },
  "theme.cool": { uz: "Salqin", ru: "Прохладная", en: "Cool" },
  "theme.slate": { uz: "Tungi", ru: "Ночная", en: "Night" },
  "theme.forest": { uz: "O'rmon", ru: "Лес", en: "Forest" },
  "theme.rose": { uz: "Pushti", ru: "Розовая", en: "Rose" },
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
