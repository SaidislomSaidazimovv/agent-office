# 🧪 Agent Office 3D — Sinov qo'llanmasi

Bu qo'llanma yangi foydalanuvchi barcha imkoniyatlarni **bosqichma-bosqich** sinab ko'rishi uchun. Extension Claude Code sessiyalarini **kuzatadi** (o'zi ishga tushirmaydi) — API kalit yoki sozlash shart emas.

---

## 0. O'rnatish

```bash
code --install-extension "agent-office-0.1.0.vsix" --force
```
So'ng: **Ctrl+Shift+P** → **Developer: Reload Window**.

> `.vsix` fayl repo ildizida. Yoki: VS Code → Extensions → `⋯` → **Install from VSIX…**

---

## 1. Panelni ochish va birinchi agent

1. Pastki panel sohasida **Agent Office** yorlig'ini oching (yoki **Ctrl+Shift+P** → `Agent Office: Show Panel`).
2. 3D ofis ko'rinadi. Yuqori-chapda: agent soni + **🔗 Hook** yoki **📄 JSONL** belgisi + **🔊** ovoz.
3. **`+ Agent`** bosing → rol tanlang (Frontend/Backend/...). Yangi Claude Code terminali ochiladi va personaj paydo bo'ladi.
4. Claude'ga vazifa bering (masalan "list files"). Personaj **stolga o'tirib yozadi**.

> **Avto-aniqlash:** `+Agent` bosmасангиз ham — shu papkada o'zingiz `claude` ishga tushirsangiz, u avtomatik aniqlanadi.

---

## 2. Statuslar (rang + yorliq) — har birini sinash

Personaj rangi va monitor ekrani agent nima qilayotganini ko'rsatadi:

| Rang | Status | Qanday sinash |
|------|--------|---------------|
| 🟢 Ishlamoqda | fayl tahrirlash/buyruq | Claude'ga "edit a file" yoki "run npm test" |
| 🔵 O'ylanmoqda | fikrlash / o'qish | Claude o'ylayotganda yoki `Read`/`Grep` paytida |
| 🟡 Hamkorlikda | subagent ishlayapti | "use a subagent to research X" (Task tool) |
| 🟠 Tasdiq kutmoqda | ruxsat so'raldi | default rejimda `Bash`/`Write` — Claude ruxsat so'raganda |
| 🔴 **Bloklangan** | xato yuz berdi | tool xato bersa (masalan mavjud bo'lmagan fayl) yoki API xato |
| ⚪ Kutmoqda | tayyor, bo'sh | Claude javob berib bo'lgach — personaj **turib ofis bo'ylab sayr qiladi** |

> Bo'sh (idle) agent eshiklardan xonalarga kirib sayr qiladi, vazifa berilganda stoliga qaytadi.

---

## 3. Kamera rejimlari

- **Izometrik (default):** sichqonni **torting** → aylantirish · **g'ildirak** → masshtab.
- **🚶 Ichki** tugmasini bosing → **birinchi-shaxs**: bosib qarash, **WASD** yurish, **Esc** chiqish.
  Devor/oyna/mebeldan **o'ta olmaysiz** (qattiq to'qnashuv). Iso'ga qaytish: **Esc** yoki **🔭 Yuqori**.

---

## 4. Agent inspektori

Personajni **bosing** → pastki-chapda panel:
- Rol, joriy tool (`Edit App.tsx`), **kontekst/token o'lchagichi** (masalan `Kontekst · 1M · 54%`).
- **💻 Terminal** — agent terminalini ochadi.
- **🪑 Ko'chirish** — boshqa stolga ko'chirish (5-bo'lim).
- **✕ Yopish** — agent + terminalini yopadi.

> **1M token sinash:** `opus-4-8[1m]` (1M kontekst) sessiyasida o'lchagich to'g'ri (100%da qotmaydi).

---

## 5. O'rindiq almashtirish

1. Personajni bosing → inspektorda **🪑 Ko'chirish**.
2. Polda halqalar chiqadi: **🟢 yashil** = bo'sh stol · **🟠 to'q sariq** = band stol.
3. Halqani bosing → agent o'sha stolga ko'chadi. Band stol tanlansa — ikki agent **joyini almashtiradi**.
4. Bekor: **Bekor** tugmasi yoki bo'sh joyga bosish.

---

## 6. Layout editor (ofisni tahrirlash)

Yuqori-o'ngda **✏️ Tahrir** (faqat izometrik rejimda) → pastda asboblar paneli chiqadi.

- **Mebel qo'yish:** palitradan jihoz tanlang (🪴🖥️🛋️☕🪑📚💡) → polga bosing (grid-snap).
- **Ko'chirish:** joylashtirilgan mebelni **sudrab** ko'chiring (drag).
- **Aylantirish / o'chirish:** mebelni bosib tanlang → **🔄** / **🗑️**.
- **Undo/Redo:** **↶ / ↷** (50 qadam).
- **Pol rangi:** rangli kvadrat → rang tanlang · **↺** → default.
- **⇄ JSON:** joriy layout'ni JSON ko'rsatadi (nusxalash) yoki JSON joylab **Qo'llash** (import).
- **📦 Asset:** tashqi mebel paketi (7-bo'lim).
- **Tayyor:** tahrirdan chiqish.

> Layout `~/.agent-office/layout.json`ga saqlanadi — VS Code'ni qayta ochsangiz tiklanadi.

---

## 7. Tashqi asset paketlari (custom mebel)

Mebelni **JSON** (primitivlar) orqali qo'shing — 3D model shart emas.

1. Tahrir rejimida **📦** → panel.
2. Namuna JSON (panel ichida ko'rsatilgan) joylang yoki **📂 Fayl** bilan `.json` tanlang → **Yuklash**.
3. Yangi jihoz palitrada paydo bo'ladi — polga qo'ying.

Namuna paket:
```json
{ "items": [ {
  "type": "myLamp", "label": "Lampa", "emoji": "🏮", "hx": 0.3, "hz": 0.3,
  "parts": [
    { "shape": "cylinder", "size": [0.05, 1.4], "pos": [0, 0.7, 0], "color": "#888888" },
    { "shape": "sphere", "size": [0.25], "pos": [0, 1.5, 0], "color": "#ffcc66", "emissive": "#ffaa33" }
  ]
} ] }
```
Shakllar: **box**`[w,h,d]` · **cylinder**/**cone**`[radius,height]` · **sphere**`[radius]`.

---

## 8. Ovoz + aniqlash rejimi

- **🔊 / 🔇** — bildirishnoma ovozlarini yoqish/o'chirish (navbat tugaganda, ruxsat so'ralganda).
- **🔗 Hook** (yashil) = jonli, ishonchli aniqlash · **📄 JSONL** (sariq) = zaxira rejim. Hook boshqa VS Code oynasida bo'lsa bu belgi JSONL ko'rsatadi.

---

## 9. `/clear`, `/resume` va ko'p sessiya

- Terminalda **`/clear`** yoki **`/resume`** qiling → **dublikat agent yaratilmaydi**, mavjud personaj yangi sessiyaga qayta biriktiriladi.
- Bir nechta agent bir vaqtda ishlashi mumkin — har biri o'z stolida. 10dan oshsa markazda qo'shimcha stollar paydo bo'ladi.

---

## 10. Standalone brauzer (VS Code'siz)

Ofisni oddiy brauzerda kuzating (masalan ikkinchi monitorda):

```bash
node dist/cli.js                    # joriy papka → http://localhost:3100
node dist/cli.js ../boshqa-loyiha   # ma'lum loyiha
node dist/cli.js --port 4000        # boshqa port
```
Brauzerni oching → shu papkadagi jonli Claude sessiyalari 3D ofisda ko'rinadi. Layout extension bilan **ulashiladi**.

> (Nashr qilingach: `npx agent-office`.)

---

## 11. Diagnostika (muammo bo'lsa)

- **Ctrl+Shift+P** → `Agent Office: Diagnostikани ko'rsatish` — jurnal (agentlar, hook holati, xatolar).
- Panel sarlavhasidagi **⚡** / **🔌** tugmalari — diagnostika + hook o'rnatish.
- Agent ko'rinmasa: `claude` PATH'da o'rnatilganini tekshiring; terminal xatosi bo'lsa 20s'dan keyin zombi agent avtomatik olib tashlanadi.
- Hook ishlamasa: `Agent Office: Claude Hook'larini o'rnatish` (yoki `agent-office.hooksEnabled` sozlamasi).

---

## Sozlamalar (Settings)

| Sozlama | Default | Vazifa |
|---------|---------|--------|
| `agent-office.hooksEnabled` | `true` | Ishonchli aniqlash uchun Claude Hooks |
| `agent-office.autoShowPanel` | `false` | Ochilganda panelni avtomatik ochish |
| `agent-office.autoSpawnAgent` | `false` | Agent yo'q bo'lsa bittasini avtomatik ishga tushirish |

---

**Savol/xato bo'lsa:** [GitHub issues](https://github.com/SaidislomSaidazimovv/agent-office/issues).
