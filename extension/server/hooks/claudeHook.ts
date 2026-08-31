// ── Claude Code hook-skripti ─────────────────────────────────
// Claude Code har hook eventida ishga tushiradi. stdin'dan JSON o'qib,
// ~/.agent-office/servers/ dagi oynalar ro'yxatidan event `cwd`'siga ENG MOS
// oynani tanlaydi va uning lokal serveriga POST qiladi (ko'p-oyna yo'naltirish).
// Mos oyna topilmasa — legacy ~/.agent-office/server.json (yoki istalgan server).
// HECH QACHON Claude'ni bloklamaydi (har doim exit 0).

import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { pickServerForCwd, type ServerEntry } from "../../core/hookRouting.js";

function done(): never {
  process.exit(0);
}

function aoDir(): string {
  return path.join(os.homedir(), ".agent-office");
}

/** servers/ papkasidagi barcha oyna yozuvlari. */
function readServers(): ServerEntry[] {
  const out: ServerEntry[] = [];
  let names: string[];
  try {
    names = fs.readdirSync(path.join(aoDir(), "servers"));
  } catch {
    return out;
  }
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const e = JSON.parse(fs.readFileSync(path.join(aoDir(), "servers", name), "utf8"));
      if (e && typeof e.port === "number" && typeof e.token === "string") {
        out.push({ port: e.port, token: e.token, pid: typeof e.pid === "number" ? e.pid : 0, folders: Array.isArray(e.folders) ? e.folders : [] });
      }
    } catch {
      /* buzuq/yarim yozuv — o'tkazamiz */
    }
  }
  return out;
}

/** Legacy server.json (eski server yoki zaxira). */
function readLegacy(): { port: number; token: string } | null {
  try {
    const e = JSON.parse(fs.readFileSync(path.join(aoDir(), "server.json"), "utf8"));
    return typeof e.port === "number" && typeof e.token === "string" ? { port: e.port, token: e.token } : null;
  } catch {
    return null;
  }
}

let data = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => {
  data += c;
});
process.stdin.on("end", () => {
  try {
    const body = data || "{}";
    let cwd = "";
    try {
      const j = JSON.parse(body);
      if (j && typeof j.cwd === "string") cwd = j.cwd;
    } catch {
      /* payload cwd'siz — zaxiraga tushamiz */
    }

    const servers = readServers();
    let target: { port: number; token: string } | null = cwd ? pickServerForCwd(servers, cwd) : null;
    // Mos oyna topilmasa — zaxira: legacy server.json, bo'lmasa istalgan server.
    if (!target) target = readLegacy() ?? servers[0] ?? null;
    if (!target) done();

    const req = http.request(
      {
        host: "127.0.0.1",
        port: target.port,
        path: "/api/hooks/claude",
        method: "POST",
        timeout: 1500,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${target.token}`,
          "content-length": Buffer.byteLength(body),
        },
      },
      (res) => {
        res.resume();
        res.on("end", done);
      },
    );
    req.on("error", done);
    req.on("timeout", () => {
      req.destroy();
      done();
    });
    req.write(body);
    req.end();
  } catch {
    done();
  }
});
process.stdin.on("error", done);
// Zaxira: agar stdin kelmasa
setTimeout(done, 2500);
