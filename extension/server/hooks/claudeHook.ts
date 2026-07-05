// ── Claude Code hook-skripti ─────────────────────────────────
// Claude Code har hook eventida ishga tushiradi. stdin'dan JSON o'qib,
// ~/.agent-office/server.json'dan port+token olib, lokal serverga POST qiladi.
// HECH QACHON Claude'ni bloklamaydi (har doim exit 0).

import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";

function done(): never {
  process.exit(0);
}

let data = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => {
  data += c;
});
process.stdin.on("end", () => {
  try {
    const serverFile = path.join(os.homedir(), ".agent-office", "server.json");
    const { port, token } = JSON.parse(fs.readFileSync(serverFile, "utf8")) as {
      port: number;
      token: string;
    };
    const body = data || "{}";
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: "/api/hooks/claude",
        method: "POST",
        timeout: 1500,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
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
