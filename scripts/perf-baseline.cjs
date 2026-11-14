#!/usr/bin/env node
// ── 3D perf o'lchovi (Sprint 8 asosi) ───────────────────────
// Yig'ilgan webview'ni (dist/webview) lokal serverda ochadi, `?perf` probe'ning
// `window.__perf` qiymatlarini har holat (scenario) uchun KO'P MARTA o'qiydi va
// min/max qilib chiqaradi. Nega ko'p marta: soya xaritasi har kadrda emas, har
// N kadrda yangilanadi (ShadowThrottle) va gl.info soya o'tishini ham sanaydi —
// bitta o'lchov tasodifan "soyali" yoki "soyasiz" kadrga tushardi.
//
// O'lchanadi: draw call, uchburchak, mesh, material, geometriya, shader. FPS
// YOZILMAYDI — headless (dasturiy) renderda u haqiqiy GPU'ni aks ettirmaydi.
//
// Ishlatish (avval `npm run build`):
//   npm i --no-save puppeteer-core          # bir marta, package.json'ga tegmaydi
//   node scripts/perf-baseline.cjs [--out perf-out] [--chrome <path>] [--check scripts/perf-budget.json] [--write-baseline]
// Muhit: CHROME_PATH — Chrome/Edge yo'li (yoki --chrome).
// Faqat lokal: server 127.0.0.1'da, tashqi tarmoqqa hech narsa yuborilmaydi.

"use strict";
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const WEB = path.join(ROOT, "dist", "webview");
const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : def;
};
const OUT = path.resolve(ROOT, arg("--out", "perf-out"));
const CHECK = args.includes("--check") ? path.resolve(ROOT, arg("--check", "scripts/perf-budget.json")) : null;
const WRITE_BASELINE = args.includes("--write-baseline");
const SAMPLES = Number(arg("--samples", "12"));

function findChrome() {
  const cand = [
    arg("--chrome"),
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  return cand.find((p) => fs.existsSync(p));
}

function loadPuppeteer() {
  try {
    return require("puppeteer-core");
  } catch {
    console.error("puppeteer-core topilmadi. O'rnating: npm i --no-save puppeteer-core");
    process.exit(2);
  }
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let rel;
      try {
        rel = decodeURIComponent((req.url || "/").split("?")[0]);
      } catch {
        res.writeHead(400);
        return res.end();
      }
      if (rel === "/") rel = "/index.html";
      const file = path.join(WEB, path.normalize(rel));
      if (!file.startsWith(WEB)) {
        res.writeHead(403);
        return res.end();
      }
      fs.readFile(file, (e, d) => {
        if (e) {
          res.writeHead(404);
          return res.end();
        }
        res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
        res.end(d);
      });
    });
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Holatlar — bir xil kamera (standart izometrik), faqat agent soni / soat / rejim farq qiladi.
const SCENARIOS = [
  { key: "empty_day", hour: 13, agents: 0 },
  { key: "agents8_day", hour: 13, agents: 8 },
  { key: "agents8_night", hour: 22, agents: 8 },
  { key: "agents24_day", hour: 13, agents: 24 },
  { key: "agents8_fpv", hour: 13, agents: 8, fpv: true },
];

async function seed(page, n) {
  await page.evaluate((n) => {
    const roles = ["research", "frontend", "backend", "qa", "docs", "data"];
    for (let i = 1; i <= n; i++) {
      window.postMessage({ type: "agentCreated", id: i, folderName: "proj" + i, role: roles[i % roles.length] }, "*");
      if (i % 3 !== 0) {
        window.postMessage({ type: "agentStatus", id: i, status: "active" }, "*");
        window.postMessage({ type: "agentToolStart", id: i, toolId: "t" + i, toolName: "Edit", status: "Edit file" + i + ".ts" }, "*");
      }
    }
  }, n);
}

async function measure(browser, base, sc) {
  const page = await browser.newPage();
  // VS Code API stub — transport WebSocket'ga urinmasin (standalone rejim emas).
  await page.evaluateOnNewDocument(() => {
    window.acquireVsCodeApi = () => ({ postMessage() {} });
  });
  await page.setViewport({ width: 1600, height: 1000 });
  await page.goto(`${base}/?perf&hour=${sc.hour}`, { waitUntil: "networkidle0" });
  await wait(1500);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").trim() === "Skip");
    if (b) b.click();
  });
  if (sc.agents) await seed(page, sc.agents);
  if (sc.fpv) {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").includes("Inside"));
      if (b) b.click();
    });
  }
  await wait(4000); // sahna o'rnashsin (agentlar o'tirsin)
  const samples = [];
  for (let i = 0; i < SAMPLES; i++) {
    await wait(550); // probe ~500ms'da yangilanadi
    const s = await page.evaluate(() => window.__perf || null);
    if (s) samples.push(s);
  }
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${sc.key}.png`) });
  await page.close();
  if (samples.length === 0) throw new Error(`${sc.key}: window.__perf o'qilmadi (?perf ishlamadi?)`);
  const pick = (k) => samples.map((s) => s[k]);
  const mm = (k) => ({ min: Math.min(...pick(k)), max: Math.max(...pick(k)) });
  // Probe har ~500ms oynadagi HAR kadrning min/max'ini beradi (callsMin/Max) —
  // min ≈ faqat sahna, max ≈ sahna + soya o'tishi.
  const hasWin = samples.every((s) => typeof s.callsMin === "number" && typeof s.callsMax === "number");
  const calls = hasWin ? { min: Math.min(...pick("callsMin")), max: Math.max(...pick("callsMax")) } : mm("calls");
  const tris = hasWin && samples.every((s) => typeof s.trisMax === "number") ? { min: Math.min(...pick("tris")), max: Math.max(...pick("trisMax")) } : mm("tris");
  return {
    key: sc.key,
    agents: sc.agents,
    samples: samples.length,
    calls,
    tris,
    meshes: mm("meshes").max,
    materials: mm("materials").max,
    geometries: mm("geometries").max,
    programs: mm("programs").max,
  };
}

(async () => {
  if (!fs.existsSync(path.join(WEB, "index.html"))) {
    console.error("dist/webview yo'q — avval: npm run build");
    process.exit(2);
  }
  const chrome = findChrome();
  if (!chrome) {
    console.error("Chrome/Edge topilmadi — CHROME_PATH yoki --chrome bering.");
    process.exit(2);
  }
  const puppeteer = loadPuppeteer();
  const srv = await serve();
  const base = `http://127.0.0.1:${srv.address().port}`;
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: "new",
    args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const results = [];
  try {
    for (const sc of SCENARIOS) results.push(await measure(browser, base, sc));
  } finally {
    await browser.close();
    srv.close();
  }

  console.log("scenario           agents  draw calls (min–max)  tris (min–max)     mesh  mat  geo  shader");
  for (const r of results) {
    console.log(
      `${r.key.padEnd(18)} ${String(r.agents).padStart(6)}  ${`${r.calls.min}–${r.calls.max}`.padEnd(20)}  ${`${r.tris.min}–${r.tris.max}`.padEnd(17)}  ${String(r.meshes).padStart(4)}  ${String(r.materials).padStart(3)}  ${String(r.geometries).padStart(3)}  ${String(r.programs).padStart(6)}`,
    );
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "perf.json"), JSON.stringify({ measuredAt: new Date().toISOString(), results }, null, 2));
  console.log(`\nSaqlandi: ${path.relative(ROOT, path.join(OUT, "perf.json"))} (+ screenshotlar)`);

  if (WRITE_BASELINE) {
    const budgetFile = path.join(ROOT, "scripts", "perf-budget.json");
    const budget = JSON.parse(fs.readFileSync(budgetFile, "utf8"));
    budget.baseline = Object.fromEntries(results.map((r) => [r.key, { callsMax: r.calls.max, meshes: r.meshes, materials: r.materials }]));
    budget.baselineMeasuredAt = new Date().toISOString().slice(0, 10);
    fs.writeFileSync(budgetFile, JSON.stringify(budget, null, 2) + "\n");
    console.log("Baseline yozildi: scripts/perf-budget.json");
  }

  if (CHECK) {
    const budget = JSON.parse(fs.readFileSync(CHECK, "utf8"));
    let fail = false;
    console.log("\nTekshiruv:");
    for (const r of results) {
      const b = budget.baseline && budget.baseline[r.key];
      const t = budget.target && budget.target[r.key];
      if (b) {
        const limit = Math.ceil(b.callsMax * (1 + budget.regressionTolerance));
        const ok = r.calls.max <= limit;
        if (!ok) fail = true;
        console.log(`  ${ok ? "✓" : "✗"} ${r.key}: regressiya — ${r.calls.max} ≤ ${limit} (baseline ${b.callsMax})`);
      }
      if (t) console.log(`  ${r.calls.max <= t.callsMax ? "✓" : "·"} ${r.key}: maqsad (S8) — ${r.calls.max} / ${t.callsMax}`);
    }
    if (fail) {
      console.error("\nRegressiya: draw call baseline'dan oshdi.");
      process.exit(1);
    }
  }
})().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
