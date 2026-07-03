// FPV rejimда skrinshot: agentlar inject, kamera tugmasini bosib "Ichki"ga o'tadi.
const puppeteer = require("puppeteer-core");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const url = process.argv[2] || "http://localhost:5173/";
const out = process.argv[3] || "scratchpad/fpv.png";
(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", protocolTimeout: 180000, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--window-size=1400,850"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 850, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await new Promise((r) => setTimeout(r, 6000));
  await page.evaluate(() => {
    const post = (m) => window.postMessage(m, "*");
    for (let i = 1; i <= 6; i++) post({ type: "agentCreated", id: i, folderName: ["web-app","api-server","research","docs-site","data-pipe","qa-suite"][i-1], role: ["frontend","backend","research","docs","data","qa"][i-1] });
    post({ type: "agentStatus", id: 1, status: "active" });
    post({ type: "agentToolStart", id: 1, toolId: "a", status: "Edit App.tsx", toolName: "Edit" });
    post({ type: "agentStatus", id: 2, status: "active" });
  });
  await new Promise((r) => setTimeout(r, 3000));
  // Kamera tugmasini bosamiz (Ichki)
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent && x.textContent.includes("Ichki"));
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 12000));
  await page.screenshot({ path: out });
  await browser.close();
  console.log("shot saved:", out);
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
