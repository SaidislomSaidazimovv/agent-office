# Agent Office — 3D Mission Control (GLB personajlar bilan)

Bir nechta AI agent ishini real vaqtda ko'rsatuvchi 3D ofis. Har bir agent —
skelet animatsiyali GLB personaj: o'tirib yozadi, o'ylanadi, bloklanganida
bosh chayqaydi. Simulyatsiya keyinchalik bitta faylni almashtirib WebSocket'ga
ulanadi.

## Ishga tushirish

```bash
npm install
npm run dev
```

GLB modellar hali qo'yilmagan bo'lsa ham loyiha ishlaydi — har bir agent
o'rnida sodda placeholder ko'rinadi (boshi ustida sariq nuqta = "model yo'q").

## GLB personajlarni tayyorlash (asosiy qadam)

Sizga 6 ta fayl kerak: `public/models/` ichida
`nova.glb`, `pixel.glb`, `forge.glb`, `lint.glb`, `scribe.glb`, `scout.glb`.

Har bir GLB ichida kamida 3 ta animatsiya klipi bo'lishi kerak:

| Klip nomi     | Holat                    | Mixamo'da qidiruv           |
|---------------|--------------------------|-----------------------------|
| `SittingIdle` | kutish / tasdiq kutish   | "Sitting Idle"              |
| `Typing`      | ishlash / hamkorlik      | "Typing" (sitting variant)  |
| `Thinking`    | o'ylash                  | "Sitting Thinking" / "Thoughtful Head Shake" |
| `Frustrated`  | bloklangan (ixtiyoriy)   | "Sitting Disapproval" / "Annoyed Head Shake" |

### Yo'l A — Ready Player Me + Mixamo (eng sifatli, bepul)

1. **Avatar:** [readyplayer.me](https://readyplayer.me) da 6 ta har xil avatar
   yasang (kiyimlarini rolga moslang: hoodie — Pixel, blazer — Nova, va h.k.).
   Har birini **GLB** qilib yuklab oling.
2. **Animatsiya:** [mixamo.com](https://www.mixamo.com) ga kiring (bepul Adobe
   akkaunt). RPM avatar Mixamo'ga to'g'ridan-to'g'ri yuklanmaydi, shuning uchun:
   Mixamo'dagi istalgan personaj (masalan X Bot) uchun yuqoridagi 4 ta
   animatsiyani **FBX (Without Skin, 30fps)** qilib yuklab oling.
3. **Blender'da birlashtirish** (5 daqiqa/model):
   - RPM avatar GLB'ni import qiling.
   - Mixamo FBX'larni import qiling — animatsiyalar RPM skeletiga mos keladi
     (ikkalasi ham Mixamo rig standartida).
   - Har bir animatsiyani NLA editor'da alohida **Action** sifatida saqlang va
     nomlarini jadvaldan bering: `SittingIdle`, `Typing`, `Thinking`, `Frustrated`.
   - Export → glTF 2.0 (.glb), Animation: **NLA Tracks** yoqilgan holda.
   - Faylni `public/models/nova.glb` (va h.k.) qilib saqlang.

   Blender bilmasangiz, tezroq alternativ: RPM avatarni
   [anim.readyplayer.me yoki "Mixamo animation combiner" (GitHub: nickfmc /
   "mixamo-animation-combiner" kabi bepul web-toollar)] orqali brauzerda
   birlashtirish mumkin.

### Yo'l B — Quaternius (eng tez, Blender kerak emas)

[quaternius.com](https://quaternius.com) → "Ultimate Animated Character Pack"
(CC0, bepul). Ichida tayyor animatsiyali low-poly odamlar bor — GLB'ni
to'g'ridan-to'g'ri `public/models/` ga tashlaysiz. Klip nomlari boshqacha
bo'ladi — `src/config.js` dagi har bir agentning `clips` maydonida moslang:

```js
clips: { idle: "Idle_Sitting", working: "Interact", thinking: "Look_Around" }
```

Kod aniq nom topa olmasa, qisman moslikni ham qidiradi (masalan
`Armature|Typing` → `Typing`), topilmasa birinchi mavjud klipni o'ynatadi —
ya'ni har qanday animatsiyali GLB darhol jonlanadi.

### Modelni stulga to'g'rilash

Har model o'z masshtabida bo'ladi. `src/config.js` da har agent uchun:

```js
scale: 1.0,    // model juda katta/kichik bo'lsa
yOffset: 0,    // stulga o'tqazish balandligi
rotY: 0,       // ekranga qaratish burchagi
```

## Arxitektura

```
src/
  config.js               ← agentlar, GLB yo'llari, klip xaritasi, joylashuv
  state/simulation.js     ← zustand store + state machine (WebSocket o'rnini bosuvchi)
  components/
    AgentCharacter.jsx    ← GLB yuklash, holat→animatsiya crossfade, fallback
    Workstation.jsx       ← stol, kreslo, monitor(lar), klik, label, status orb
    Office.jsx            ← xona, yorug'lik, derazalar, Hub gologramma, nur oqimlari
  ui/Overlay.jsx          ← stats, agent paneli, jonli event feed
  App.jsx                 ← Canvas + OrbitControls + tone mapping
```

## Realga ulash (simulyatsiya → haqiqiy agentlar)

`simulation.js` dagi `tick()` o'rniga WebSocket:

```js
const ws = new WebSocket("wss://sizning-gateway/events");
ws.onmessage = (e) => {
  const ev = JSON.parse(e.data);
  // ev: { agentId, type: "thinking"|"working"|"blocked"|..., task, tokens }
  useSim.setState((s) => ({
    agents: s.agents.map((a) => a.id === ev.agentId ? { ...a, state: ev.type, task: ev.task } : a),
  }));
};
```

Backend tomonda Claude Agent SDK hook'laridan hodisalarni Redis Streams →
WebSocket gateway orqali uzatasiz. 3D qatlam o'zgarmaydi.
