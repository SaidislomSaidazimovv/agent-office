import { useEffect, useRef, useState } from "react";
import { THEMES, useLayout } from "../layoutStore";
import { fmtCost, PRICING_AS_OF } from "../pricing";
import { useDaylight } from "../scene/daylight";
import { unlockAudio } from "../notificationSound";
import { CATALOG } from "../scene/furniture";
import { MAX_CONTEXT_TOKENS, presetFor, ROLE_PRESETS, STATUS_COLOR, STATUS_LABEL, tokenBar } from "../scene/roles";
import { useOffice } from "../store";
import { send } from "../transport";

// ── DOM overlay: sarlavha, +Agent, bo'sh holat, agent inspektori ──

const ROLES = Object.entries(ROLE_PRESETS).map(([key, p]) => ({ key, ...p }));

// Davomiylik (ms → "12s" / "3m 5s" / "1h 4m").
function fmtDur(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
// Model id → qisqa nom ("claude-opus-4-8[1m]" → "Opus 4.8").
function shortModel(m: string): string {
  const s = m.toLowerCase();
  const fam = s.includes("fable") ? "Fable" : s.includes("mythos") ? "Mythos" : s.includes("haiku") ? "Haiku" : s.includes("sonnet") ? "Sonnet" : s.includes("opus") ? "Opus" : "";
  const ver = m.match(/(\d+)-(\d+)/);
  return fam ? `${fam}${ver ? " " + ver[1] + "." + ver[2] : ""}` : m.slice(0, 14);
}
// "necha vaqt oldin" (event tasmasi uchun).
function fmtAgo(at: number, now: number): string {
  const s = Math.floor((now - at) / 1000);
  if (s < 5) return "hozir";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

export default function Hud() {
  const order = useOffice((s) => s.order);
  const selectedId = useOffice((s) => s.selectedId);
  const agents = useOffice((s) => s.agents);
  const select = useOffice((s) => s.select);
  const movingId = useOffice((s) => s.movingId);
  const setMoving = useOffice((s) => s.setMoving);
  const cameraMode = useOffice((s) => s.cameraMode);
  const setCameraMode = useOffice((s) => s.setCameraMode);
  const folders = useOffice((s) => s.folders);
  const hookActive = useOffice((s) => s.hookActive);
  const soundEnabled = useOffice((s) => s.soundEnabled);
  const setSound = useOffice((s) => s.setSound);
  const events = useOffice((s) => s.events);
  const gitRepos = useOffice((s) => s.gitRepos);
  const daylightOn = useDaylight((s) => s.enabled);
  const toggleDaylight = useDaylight((s) => s.toggle);
  const editMode = useLayout((s) => s.editMode);
  const setEditMode = useLayout((s) => s.setEditMode);
  const [menu, setMenu] = useState(false);
  const [feed, setFeed] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [bypass, setBypass] = useState(false);
  const [, force] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  // Menyu tashqarisiga bosilsa yoki Esc — yopamiz (osilib qolmasin).
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSound(next);
    if (next) unlockAudio(); // brauzer audiosini foydalanuvchi imo-ishorasida ochamiz
    send({ type: "setSoundEnabled", enabled: next });
  };
  const [folderPath, setFolderPath] = useState<string | undefined>(undefined);
  const launchLock = useRef(0);
  const sel = selectedId != null ? agents[selectedId] : undefined;

  // Faol agent tanlanganda "faol vaqt"ni jonli yangilab turamiz (1s).
  useEffect(() => {
    if (!sel || sel.activeSince == null) return;
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [sel?.id, sel?.activeSince]);

  // Klaviatura: ←/→ agentlar orasида o'tish, Esc — tanlovni bekor qilish.
  // Matn kiritish (input/textarea)da ishlamaydi.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Escape" && selectedId != null) { select(null); return; }
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && order.length > 0) {
        e.preventDefault();
        const idx = selectedId == null ? -1 : order.indexOf(selectedId);
        const dir = e.key === "ArrowRight" ? 1 : -1;
        const next = order[(idx + dir + order.length) % order.length];
        select(next);
        send({ type: "focusAgent", id: next });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [order, selectedId, select]);
  const multiRoot = folders.length > 1;
  const activeFolder = folderPath ?? folders[0]?.path;

  // Bir bosishda FAQAT 1 agent — tez ikki marta bosilsa (yoki double-fire)
  // 1 soniya ichidagi takroriy so'rovni e'tiborsiz qoldiramiz.
  const launch = (role?: string) => {
    const now = Date.now();
    if (now - launchLock.current < 1000) return;
    launchLock.current = now;
    setMenu(false);
    send({ type: "launchAgent", role, folderPath: multiRoot ? activeFolder : undefined, bypassPermissions: bypass });
    setBypass(false); // xavfli rejim keyingi launchda armlanib qolmasin
  };

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", fontFamily: "system-ui, sans-serif", color: "#e8ecf2" }}>
      {/* Klaviatura fokusi — barcha interaktiv elementlarda ko'rinadigan halqa. */}
      <style>{`
        button:focus-visible, input:focus-visible, label:focus-within, [tabindex]:focus-visible { outline: 2px solid #5e9bff; outline-offset: 2px; border-radius: 6px; }
        button { transition: background 120ms ease, border-color 120ms ease, transform 80ms ease; }
        button:active { transform: translateY(1px); }
      `}</style>
      {/* Yuqori panel */}
      <div style={{ position: "absolute", top: 12, left: 14, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em" }}>🏢 Agent Office</div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          {order.length} agent{order.length === 1 ? "" : "lar"}
        </div>
        {/* Umumiy taxminiy xarajat (barcha agentlar) */}
        {(() => {
          const total = order.reduce((s, id) => s + (agents[id]?.costUsd || 0), 0);
          return total > 0 ? (
            <div title={`Barcha sessiyalar taxminiy xarajati — rasmiy narxlar (${PRICING_AS_OF})`} style={{ padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 700, background: "rgba(48,209,88,0.16)", color: "#30d158", border: "1px solid rgba(48,209,88,0.4)" }}>
              ~{fmtCost(total)}
            </div>
          ) : null;
        })()}
        {/* Aniqlash rejimi — jonli hook yoki JSONL zaxira */}
        <div
          title={hookActive ? "Jonli hook oqimi (ishonchli aniqlash)" : "Faqat JSONL kuzatuvi (hook boshqa oynada yoki o'chiq — aniqlash evristik)"}
          style={{
            display: "flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600,
            background: hookActive ? "rgba(48,209,88,0.16)" : "rgba(255,159,10,0.16)",
            color: hookActive ? "#30d158" : "#ff9f0a", border: `1px solid ${hookActive ? "rgba(48,209,88,0.4)" : "rgba(255,159,10,0.4)"}`,
          }}
        >
          {hookActive ? "🔗 Hook" : "📄 JSONL"}
        </div>
        {/* Ovoz toggle */}
        <button
          onClick={toggleSound}
          aria-label={soundEnabled ? "Ovozni o'chirish" : "Ovozni yoqish"}
          aria-pressed={soundEnabled}
          title={soundEnabled ? "Ovoz yoqiq (bosib o'chiring)" : "Ovoz o'chiq (bosib yoqing)"}
          style={{
            pointerEvents: "auto", display: "flex", alignItems: "center", padding: "3px 7px", borderRadius: 8,
            cursor: "pointer", border: "1px solid rgba(255,255,255,0.14)", background: "rgba(20,24,32,0.8)",
            color: soundEnabled ? "#e8ecf2" : "#8e8e93", fontSize: 12,
          }}
        >
          {soundEnabled ? "🔊" : "🔇"}
        </button>
        {/* Kun/tun toggle */}
        <button
          onClick={toggleDaylight}
          aria-label={daylightOn ? "Kun/tun sikli yoqiq (bosib o'chiring)" : "Kun/tun sikli o'chiq (bosib yoqing)"}
          aria-pressed={daylightOn}
          title={daylightOn ? "Kun/tun sikli — real soatga bog'liq (bosib o'chiring)" : "Doimiy kunduzgi yorug'lik (bosib kun/tunni yoqing)"}
          style={{
            pointerEvents: "auto", display: "flex", alignItems: "center", padding: "3px 7px", borderRadius: 8,
            cursor: "pointer", fontSize: 12,
            border: `1px solid ${daylightOn ? "rgba(255,214,10,0.5)" : "rgba(255,255,255,0.14)"}`,
            background: daylightOn ? "rgba(255,214,10,0.16)" : "rgba(20,24,32,0.8)", color: "#e8ecf2",
          }}
        >
          {daylightOn ? "🌗" : "☀️"}
        </button>
        {/* Faoliyat tasmasi toggle */}
        <button
          onClick={() => setFeed((f) => !f)}
          aria-label="Faoliyat tasmasi"
          aria-pressed={feed}
          title="Faoliyat tasmasi (so'nggi hodisalar)"
          style={{
            pointerEvents: "auto", display: "flex", alignItems: "center", padding: "3px 7px", borderRadius: 8,
            cursor: "pointer", fontSize: 12,
            border: `1px solid ${feed ? "rgba(94,155,255,0.6)" : "rgba(255,255,255,0.14)"}`,
            background: feed ? "rgba(94,155,255,0.22)" : "rgba(20,24,32,0.8)", color: "#e8ecf2",
          }}
        >
          📜
        </button>
      </div>

      {/* ── Faoliyat tasmasi paneli ── */}
      {feed && (
        <div
          style={{
            position: "absolute", top: 52, right: 14, width: 262, maxHeight: "62vh", pointerEvents: "auto",
            display: "flex", flexDirection: "column",
            background: "rgba(16,20,27,0.96)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12, boxShadow: "0 8px 28px rgba(0,0,0,0.5)", overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <span style={{ fontSize: 12, fontWeight: 700 }}>📜 Faoliyat</span>
            <button onClick={() => setFeed(false)} aria-label="Tasmani yopish" style={{ border: "none", background: "transparent", color: "#9aa3af", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
          </div>
          <div role="log" aria-label="Faoliyat tasmasi" aria-live="polite" style={{ overflowY: "auto", padding: "4px 0" }}>
            {events.length === 0 ? (
              <div style={{ padding: "14px 12px", fontSize: 12, opacity: 0.55, textAlign: "center" }}>Hozircha hodisa yo'q</div>
            ) : (
              events.map((e) => (
                <div key={e.seq} style={{ display: "flex", alignItems: "baseline", gap: 7, padding: "4px 12px", fontSize: 11.5, lineHeight: 1.35 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: e.color, flexShrink: 0, transform: "translateY(1px)" }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ color: "#cdd6e2" }}>{e.who}</b>{" "}
                    <span style={{ opacity: 0.82 }}>{e.text}</span>
                  </span>
                  <span style={{ opacity: 0.45, fontSize: 10, flexShrink: 0 }}>{fmtAgo(e.at, Date.now())}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Yuqori agent-bar (namunadek — ismlar + status nuqta) */}
      {order.length > 0 && (
        <div
          style={{
            position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)",
            display: "flex", gap: 6, maxWidth: "60vw", overflowX: "auto", padding: 4, pointerEvents: "auto",
          }}
        >
          {order.map((id) => {
            const a = agents[id];
            if (!a) return null;
            const c = STATUS_COLOR[a.status];
            const on = selectedId === id;
            return (
              <button
                key={id}
                onClick={() => { select(a.id); send({ type: "focusAgent", id: a.id }); }}
                title={STATUS_LABEL[a.status]}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "4px 11px", borderRadius: 20,
                  cursor: "pointer", whiteSpace: "nowrap", fontSize: 12, fontWeight: 600, color: "#e8ecf2",
                  border: `1px solid ${on ? c : "rgba(255,255,255,0.14)"}`,
                  background: on ? "rgba(94,155,255,0.22)" : "rgba(20,24,32,0.8)",
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
                {a.folderName}
              </button>
            );
          })}
        </div>
      )}

      {/* Kamera rejimi toggle */}
      <div style={{ position: "absolute", top: 12, right: 108, pointerEvents: "auto" }}>
        <button
          onClick={() => setCameraMode(cameraMode === "iso" ? "fpv" : "iso")}
          aria-label={cameraMode === "iso" ? "Ichki (birinchi shaxs) rejimga o'tish" : "Yuqori (izometrik) rejimga o'tish"}
          title={cameraMode === "iso" ? "Ichkidan yurib kuzatish" : "Yuqoridan (izometrik)"}
          style={{
            padding: "7px 12px", borderRadius: 9, cursor: "pointer",
            border: "1px solid rgba(255,255,255,0.2)", background: "rgba(20,24,32,0.85)",
            color: "#fff", fontSize: 13, fontWeight: 600,
          }}
        >
          {cameraMode === "iso" ? "🚶 Ichki" : "🔭 Yuqori"}
        </button>
      </div>

      {/* Tahrirlash (Layout editor) toggle — faqat iso rejimda */}
      {cameraMode === "iso" && (
        <div style={{ position: "absolute", top: 12, right: 200, pointerEvents: "auto" }}>
          <button
            onClick={() => setEditMode(!editMode)}
            aria-label={editMode ? "Tahrirlashni yakunlash" : "Ofisni tahrirlash"}
            aria-pressed={editMode}
            title="Ofis jihozlarini tahrirlash"
            style={{
              padding: "7px 12px", borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 600,
              border: `1px solid ${editMode ? "rgba(76,139,245,0.7)" : "rgba(255,255,255,0.2)"}`,
              background: editMode ? "rgba(76,139,245,0.25)" : "rgba(20,24,32,0.85)", color: "#fff",
            }}
          >
            {editMode ? "✓ Tayyor" : "✏️ Tahrir"}
          </button>
        </div>
      )}

      {/* ── Layout editor paneli ── */}
      {editMode && cameraMode === "iso" && <LayoutEditor />}

      {/* Kamera maslahati (rejimga qarab) */}
      <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", padding: "6px 14px", borderRadius: 10, background: "rgba(16,20,27,0.85)", color: "#c9d0da", fontSize: 12, whiteSpace: "nowrap", opacity: 0.9 }}>
        {cameraMode === "fpv" ? (
          <>🖱 Qarash uchun bosing · <b>WASD</b> yurish · <b>Esc</b> chiqish</>
        ) : (
          <>🖱 Aylantirish uchun torting · <b>g'ildirak</b> masshtab · <b>←/→</b> agent tanlash</>
        )}
      </div>

      {/* +Agent */}
      <div ref={menuRef} style={{ position: "absolute", top: 12, right: 14, pointerEvents: "auto" }}>
        <button
          onClick={() => setMenu((m) => !m)}
          title="Yangi Claude Code agenti qo'shish"
          aria-label="Yangi agent qo'shish"
          style={{
            padding: "7px 14px", borderRadius: 9, cursor: "pointer",
            border: "1px solid rgba(94,155,255,0.5)", background: "rgba(94,155,255,0.18)",
            color: "#fff", fontSize: 13, fontWeight: 600,
          }}
        >
          + Agent
        </button>
        {menu && (
          <div
            style={{
              position: "absolute", top: 40, right: 0, minWidth: 170,
              background: "rgba(18,22,29,0.97)", border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 10, padding: 6, boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            }}
          >
            {/* Papka tanlash — faqat multi-root ish maydonida */}
            {multiRoot && (
              <>
                <div style={{ fontSize: 11, opacity: 0.6, padding: "4px 8px" }}>Papka</div>
                {folders.map((f) => (
                  <button
                    key={f.path}
                    onClick={() => setFolderPath(f.path)}
                    title={f.path}
                    style={{
                      display: "flex", alignItems: "center", gap: 6, width: "100%", textAlign: "left",
                      padding: "6px 8px", borderRadius: 7, border: "none", cursor: "pointer",
                      background: activeFolder === f.path ? "rgba(94,155,255,0.22)" : "transparent",
                      color: "#e8ecf2", fontSize: 12,
                    }}
                  >
                    <span style={{ opacity: activeFolder === f.path ? 1 : 0.3 }}>📁</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                  </button>
                ))}
                <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "5px 4px" }} />
              </>
            )}
            <div style={{ fontSize: 11, opacity: 0.6, padding: "4px 8px" }}>Rol tanlang</div>
            {ROLES.map((r) => (
              <button
                key={r.key}
                onClick={() => launch(r.key)}
                style={{
                  display: "block", width: "100%", textAlign: "left", padding: "7px 8px",
                  borderRadius: 7, border: "none", background: "transparent", color: "#e8ecf2",
                  fontSize: 13, cursor: "pointer",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: r.top, marginRight: 8 }} />
                {r.label}
              </button>
            ))}
            <button
              onClick={() => launch()}
              style={{
                display: "block", width: "100%", textAlign: "left", padding: "7px 8px", marginTop: 2,
                borderRadius: 7, border: "none", background: "transparent", color: "#9aa3af",
                fontSize: 12, cursor: "pointer",
              }}
            >
              Rolsiz ishga tushirish
            </button>
            {/* Ruxsatsiz rejim (--dangerously-skip-permissions) */}
            <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "5px 4px" }} />
            <label
              title="Yangi agent ruxsat so'ramaydi (--dangerously-skip-permissions). Ehtiyot bo'ling."
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 8px", cursor: "pointer", fontSize: 12, color: bypass ? "#ff9f0a" : "#9aa3af" }}
            >
              <input type="checkbox" checked={bypass} onChange={(e) => setBypass(e.target.checked)} style={{ cursor: "pointer" }} />
              ⚡ Ruxsatsiz rejim
            </label>
          </div>
        )}
      </div>

      {/* Bo'sh holat */}
      {order.length === 0 && (
        <div
          style={{
            position: "absolute", left: "50%", top: "58%", transform: "translate(-50%,-50%)",
            textAlign: "center", maxWidth: 340,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Ofis hozircha bo'sh</div>
          <div style={{ fontSize: 13, opacity: 0.7, lineHeight: 1.5 }}>
            <b>+ Agent</b> tugmasini bosing — yangi Claude Code terminali ochiladi va
            uning faoliyati shu ofisda jonli ko'rinadi.
          </div>
        </div>
      )}

      {/* Agent inspektor paneli (personaj tanlanganda) */}
      {sel && (
        <div
          style={{
            position: "absolute", bottom: 16, left: 16, width: 250, pointerEvents: "auto",
            background: "rgba(16,20,27,0.95)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12, padding: 14, boxShadow: "0 8px 28px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{sel.folderName}</div>
            <button
              onClick={() => select(null)}
              title="Yopish"
              aria-label="Inspektorni yopish"
              style={{ border: "none", background: "transparent", color: "#9aa3af", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "2px 6px", borderRadius: 6 }}
            >
              ×
            </button>
          </div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 1 }}>
            {presetFor(sel.role, sel.seatIndex).label}
          </div>
          <div style={{ fontSize: 12, marginTop: 8 }}>
            <span style={{ color: STATUS_COLOR[sel.status] }}>●</span> {STATUS_LABEL[sel.status]}
            {sel.toolLabel ? ` · ${sel.toolLabel}` : ""}
          </div>
          {/* Git holati (branch + o'zgargan fayllar) */}
          {(() => {
            const g = gitRepos[sel.folderName];
            if (!g?.branch) return null;
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, marginTop: 5, opacity: 0.85 }}>
                <span title="Git branch" style={{ display: "flex", alignItems: "center", gap: 3, padding: "1px 7px", borderRadius: 10, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)" }}>
                  ⑂ {g.branch}
                </span>
                {g.changed > 0 && (
                  <span title="O'zgargan fayllar" style={{ color: "#ff9f0a" }}>● {g.changed} o'zgargan</span>
                )}
              </div>
            );
          })()}
          {sel.task && (
            <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4, lineHeight: 1.4 }}>📋 {sel.task}</div>
          )}
          {/* Token kontekst */}
          {sel.inputTokens > 0 && (() => {
            const win = sel.contextWindow || MAX_CONTEXT_TOKENS;
            const bar = tokenBar(sel.inputTokens, win);
            const winLabel = win >= 1000000 ? "1M" : `${Math.round(win / 1000)}k`;
            // <1k → butun son, aks holda "N.Xk" (juda katta bo'lsa butun "Nk")
            const kfmt = (n: number) => (n < 1000 ? `${n}` : n < 100000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n / 1000)}k`);
            return (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, opacity: 0.7, marginBottom: 3 }}>
                  <span>Kontekst · {winLabel}</span>
                  <span>{Math.round(bar.pct * 100)}% · {kfmt(sel.inputTokens)} / {kfmt(sel.outputTokens)} chiqish</span>
                </div>
                <div style={{ height: 6, borderRadius: 4, background: "rgba(255,255,255,0.14)", overflow: "hidden" }}>
                  <div style={{ width: `${Math.max(3, bar.pct * 100)}%`, height: "100%", background: bar.color }} />
                </div>
              </div>
            );
          })()}
          {/* Taxminiy xarajat + model */}
          {sel.costUsd > 0 && (
            <div title={`Taxminiy — rasmiy narxlar (${PRICING_AS_OF}). Kesh o'qish/yozish hisobga olingan.`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, padding: "6px 9px", borderRadius: 8, background: "rgba(48,209,88,0.1)", border: "1px solid rgba(48,209,88,0.25)" }}>
              <span style={{ fontSize: 11, opacity: 0.75 }}>💰 Xarajat{sel.model ? ` · ${shortModel(sel.model)}` : ""}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#30d158" }}>~{fmtCost(sel.costUsd)}</span>
            </div>
          )}
          {/* Sessiya statistikasi */}
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            {[
              { label: "Navbat", value: `${sel.turns}` },
              { label: "Tool", value: `${sel.toolCalls}` },
              { label: "Faol", value: fmtDur(sel.activeMs + (sel.activeSince != null ? Date.now() - sel.activeSince : 0)) },
            ].map((st) => (
              <div key={st.label} style={{ flex: 1, textAlign: "center", padding: "6px 2px", borderRadius: 8, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{st.value}</div>
                <div style={{ fontSize: 9.5, opacity: 0.6, marginTop: 1 }}>{st.label}</div>
              </div>
            ))}
          </div>
          {/* Tool tarixi (yig'iladigan) */}
          {sel.toolHistory.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <button
                onClick={() => setHistOpen((v) => !v)}
                aria-expanded={histOpen}
                style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 8px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 600, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#cdd6e2" }}
              >
                <span>🧰 Tool tarixi ({sel.toolHistory.length})</span>
                <span style={{ opacity: 0.6 }}>{histOpen ? "▴" : "▾"}</span>
              </button>
              {histOpen && (
                <div style={{ marginTop: 4, maxHeight: 132, overflowY: "auto", borderRadius: 7, border: "1px solid rgba(255,255,255,0.08)" }}>
                  {sel.toolHistory.map((h, i) => (
                    <div key={`${h.at}-${i}`} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "3px 8px", fontSize: 11, borderTop: i ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.label}</span>
                      <span style={{ opacity: 0.45, fontSize: 10, flexShrink: 0 }}>{fmtAgo(h.at, Date.now())}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              onClick={() => send({ type: "focusAgent", id: sel.id })}
              style={{
                flex: 1, padding: "7px 0", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600,
                border: "1px solid rgba(94,155,255,0.5)", background: "rgba(94,155,255,0.18)", color: "#fff",
              }}
            >
              💻 Terminal
            </button>
            <button
              onClick={() => setMoving(sel.id)}
              title="Boshqa stolga ko'chirish"
              style={{
                flex: 1, padding: "7px 0", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600,
                border: "1px solid rgba(255,255,255,0.2)", background: "rgba(30,35,44,0.9)", color: "#fff",
              }}
            >
              🪑 Ko'chirish
            </button>
            <button
              onClick={() => { send({ type: "closeAgent", id: sel.id }); select(null); }}
              style={{
                flex: 1, padding: "7px 0", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600,
                border: "1px solid rgba(255,69,58,0.5)", background: "rgba(255,69,58,0.15)", color: "#fff",
              }}
            >
              ✕ Yopish
            </button>
          </div>
        </div>
      )}

      {/* Ko'chirish maslahati */}
      {movingId != null && (
        <div style={{ position: "absolute", top: 52, left: "50%", transform: "translateX(-50%)", pointerEvents: "auto", padding: "6px 14px", borderRadius: 10, background: "rgba(48,209,88,0.18)", border: "1px solid rgba(48,209,88,0.5)", color: "#8ff0b0", fontSize: 12, fontWeight: 600, display: "flex", gap: 10, alignItems: "center" }}>
          🪑 Yangi stolni tanlang (🟢 bo'sh · 🟠 almashtirish)
          <button onClick={() => setMoving(null)} style={{ border: "1px solid rgba(255,255,255,0.2)", background: "transparent", color: "#e8ecf2", borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontSize: 11 }}>Bekor</button>
        </div>
      )}
    </div>
  );
}

// ── Layout editor paneli (jihoz palitrasi + boshqaruv) ──
function LayoutEditor() {
  const paletteType = useLayout((s) => s.paletteType);
  const setPalette = useLayout((s) => s.setPalette);
  const selectedId = useLayout((s) => s.selectedId);
  const rotate = useLayout((s) => s.rotate);
  const remove = useLayout((s) => s.remove);
  const undo = useLayout((s) => s.undo);
  const redo = useLayout((s) => s.redo);
  const clearAll = useLayout((s) => s.clearAll);
  const canUndo = useLayout((s) => s.past.length > 0);
  const canRedo = useLayout((s) => s.future.length > 0);
  const count = useLayout((s) => s.items.length);
  const floorColor = useLayout((s) => s.floorColor);
  const setFloorColor = useLayout((s) => s.setFloorColor);
  const wallColor = useLayout((s) => s.wallColor);
  const setWallColor = useLayout((s) => s.setWallColor);
  const applyTheme = useLayout((s) => s.applyTheme);
  const exportJSON = useLayout((s) => s.exportJSON);
  const importJSON = useLayout((s) => s.importJSON);
  const packs = useLayout((s) => s.packs);
  const setPalette2 = useLayout((s) => s.setPalette);
  const addPack = useLayout((s) => s.addPack);
  const removePack = useLayout((s) => s.removePack);
  const [json, setJson] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  const [assets, setAssets] = useState(false);
  const [packText, setPackText] = useState("");
  const [packMsg, setPackMsg] = useState("");

  const pill = (active: boolean, disabled = false): React.CSSProperties => ({
    display: "flex", alignItems: "center", justifyContent: "center", minWidth: 30, height: 30, padding: "0 8px",
    borderRadius: 8, cursor: disabled ? "default" : "pointer", fontSize: 15, opacity: disabled ? 0.35 : 1,
    border: `1px solid ${active ? "#4c8bf5" : "rgba(255,255,255,0.14)"}`,
    background: active ? "rgba(76,139,245,0.3)" : "rgba(30,35,44,0.9)", color: "#e8ecf2",
  });
  const sep: React.CSSProperties = { width: 1, height: 22, background: "rgba(255,255,255,0.14)", margin: "0 3px" };

  return (
    <>
      <div style={{ position: "absolute", bottom: 54, left: "50%", transform: "translateX(-50%)", pointerEvents: "auto", display: "flex", alignItems: "center", gap: 5, padding: "7px 10px", borderRadius: 12, background: "rgba(16,20,27,0.96)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 8px 24px rgba(0,0,0,0.5)", maxWidth: "92vw", flexWrap: "wrap", fontFamily: "system-ui" }}>
        <span style={{ fontSize: 11, opacity: 0.6, marginRight: 2 }}>Qo'yish:</span>
        {CATALOG.map((d) => (
          <button key={d.type} title={d.label} onClick={() => setPalette(paletteType === d.type ? null : d.type)} style={pill(paletteType === d.type)}>
            {d.emoji}
          </button>
        ))}
        {packs.map((d) => (
          <button key={d.type} title={`${d.label} (paket)`} onClick={() => setPalette2(paletteType === d.type ? null : d.type)} style={pill(paletteType === d.type)}>
            {d.emoji}
          </button>
        ))}
        <button title="Asset paket qo'shish (JSON)" onClick={() => { setAssets(true); setPackMsg(""); }} style={{ ...pill(assets), fontSize: 15 }}>📦</button>
        {selectedId && (
          <>
            <div style={sep} />
            <button title="Aylantirish" onClick={() => rotate(selectedId)} style={pill(false)}>🔄</button>
            <button title="O'chirish" onClick={() => remove(selectedId)} style={{ ...pill(false), color: "#ff6b6b" }}>🗑️</button>
          </>
        )}
        <div style={sep} />
        {/* Pol rangi */}
        <label title="Pol rangi" style={{ ...pill(false), padding: 0, overflow: "hidden", position: "relative" }}>
          <input type="color" value={floorColor ?? "#d8c7a8"} onChange={(e) => setFloorColor(e.target.value)} style={{ position: "absolute", inset: -4, width: 40, height: 40, border: "none", padding: 0, cursor: "pointer" }} />
        </label>
        <button title="Pol rangini tiklash" onClick={() => floorColor && setFloorColor(null)} style={{ ...pill(false, !floorColor), fontSize: 11, minWidth: 0 }}>↺</button>
        {/* Devor rangi */}
        <label title="Devor rangi" style={{ ...pill(false), padding: 0, overflow: "hidden", position: "relative" }}>
          <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, pointerEvents: "none", opacity: 0.5 }}>▢</span>
          <input type="color" value={wallColor ?? "#dcd3c2"} onChange={(e) => setWallColor(e.target.value)} style={{ position: "absolute", inset: -4, width: 40, height: 40, border: "none", padding: 0, cursor: "pointer", opacity: 0.85 }} />
        </label>
        <button title="Devor rangini tiklash" onClick={() => wallColor && setWallColor(null)} style={{ ...pill(false, !wallColor), fontSize: 11, minWidth: 0 }}>↺</button>
        <div style={sep} />
        {/* Mavzular (pol + devor palitrasi) */}
        <span style={{ fontSize: 11, opacity: 0.6, marginRight: 1 }}>Mavzu:</span>
        {THEMES.map((th) => {
          const active = floorColor === th.floor && wallColor === th.wall;
          return (
            <button key={th.key} title={th.label} onClick={() => applyTheme(th.key)} style={{ ...pill(active), padding: 0, overflow: "hidden", minWidth: 30 }}>
              <span style={{ display: "flex", width: "100%", height: "100%" }}>
                <span style={{ flex: 1, background: th.floor }} />
                <span style={{ flex: 1, background: th.wall }} />
              </span>
            </button>
          );
        })}
        <div style={sep} />
        <button title="Orqaga (undo)" onClick={() => canUndo && undo()} style={pill(false, !canUndo)}>↶</button>
        <button title="Oldinga (redo)" onClick={() => canRedo && redo()} style={pill(false, !canRedo)}>↷</button>
        <button title="JSON eksport/import" onClick={() => { setErr(false); setJson(exportJSON()); }} style={{ ...pill(false), fontSize: 12, minWidth: 0 }}>⇄ JSON</button>
        <button title="Hammasini tozalash" onClick={() => count && clearAll()} style={{ ...pill(false, !count), fontSize: 12, minWidth: 0 }}>Tozalash</button>
      </div>

      {/* JSON eksport/import paneli */}
      {json !== null && (
        <div style={{ position: "absolute", bottom: 108, left: "50%", transform: "translateX(-50%)", pointerEvents: "auto", width: 380, padding: 12, borderRadius: 12, background: "rgba(16,20,27,0.98)", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 10px 28px rgba(0,0,0,0.6)", fontFamily: "system-ui" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>Layout JSON</span>
            <button onClick={() => setJson(null)} title="Yopish" style={{ border: "none", background: "transparent", color: "#9aa3af", cursor: "pointer", fontSize: 16 }}>×</button>
          </div>
          <textarea
            value={json}
            onChange={(e) => { setJson(e.target.value); setErr(false); }}
            spellCheck={false}
            style={{ width: "100%", height: 150, resize: "vertical", boxSizing: "border-box", fontFamily: "ui-monospace, monospace", fontSize: 11, borderRadius: 8, padding: 8, background: "rgba(0,0,0,0.35)", color: "#dfe6ee", border: `1px solid ${err ? "#ff6b6b" : "rgba(255,255,255,0.14)"}` }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8, fontSize: 10, opacity: 0.6 }}>
            <span>Nusxalash uchun tanlang · yoki JSON joylab "Qo'llash"</span>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={() => { if (importJSON(json)) setJson(null); else setErr(true); }} style={{ flex: 1, padding: "7px 0", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, border: "1px solid rgba(76,139,245,0.6)", background: "rgba(76,139,245,0.2)", color: "#fff" }}>Qo'llash (import)</button>
            <button onClick={() => setJson(null)} style={{ padding: "7px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, border: "1px solid rgba(255,255,255,0.14)", background: "transparent", color: "#e8ecf2" }}>Bekor</button>
          </div>
        </div>
      )}

      {/* Asset paket paneli */}
      {assets && (
        <div style={{ position: "absolute", bottom: 108, left: "50%", transform: "translateX(-50%)", pointerEvents: "auto", width: 400, padding: 12, borderRadius: 12, background: "rgba(16,20,27,0.98)", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 10px 28px rgba(0,0,0,0.6)", fontFamily: "system-ui" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>📦 Asset paketlari</span>
            <button onClick={() => setAssets(false)} title="Yopish" style={{ border: "none", background: "transparent", color: "#9aa3af", cursor: "pointer", fontSize: 16 }}>×</button>
          </div>
          {packs.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
              {packs.map((d) => (
                <span key={d.type} style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 6px", borderRadius: 8, background: "rgba(30,35,44,0.9)", border: "1px solid rgba(255,255,255,0.12)", fontSize: 11 }}>
                  {d.emoji} {d.label}
                  <button onClick={() => removePack(d.type)} title="O'chirish" style={{ border: "none", background: "transparent", color: "#ff6b6b", cursor: "pointer", fontSize: 12, padding: 0 }}>×</button>
                </span>
              ))}
            </div>
          )}
          <textarea
            value={packText}
            onChange={(e) => { setPackText(e.target.value); setPackMsg(""); }}
            spellCheck={false}
            placeholder={'{ "items": [ { "type": "myLamp", "label": "Lampa", "emoji": "🏮", "hx": 0.3, "hz": 0.3, "parts": [ { "shape":"cylinder","size":[0.05,1.4],"pos":[0,0.7,0],"color":"#888" }, { "shape":"sphere","size":[0.25],"pos":[0,1.5,0],"color":"#ffcc66","emissive":"#ffaa33" } ] } ] }'}
            style={{ width: "100%", height: 130, resize: "vertical", boxSizing: "border-box", fontFamily: "ui-monospace, monospace", fontSize: 10.5, borderRadius: 8, padding: 8, background: "rgba(0,0,0,0.35)", color: "#dfe6ee", border: "1px solid rgba(255,255,255,0.14)" }}
          />
          <div style={{ fontSize: 10, opacity: 0.6, marginTop: 6 }}>
            Primitivlardan mebel: <b>box</b>[w,h,d] · <b>cylinder</b>/<b>cone</b>[r,h] · <b>sphere</b>[r]. {packMsg && <span style={{ color: packMsg.startsWith("✓") ? "#30d158" : "#ff6b6b" }}>{packMsg}</span>}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <label style={{ padding: "7px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, border: "1px solid rgba(255,255,255,0.14)", background: "transparent", color: "#e8ecf2" }}>
              📂 Fayl
              <input type="file" accept=".json,application/json" style={{ display: "none" }} onChange={(e) => {
                const f = e.target.files?.[0]; if (!f) return;
                f.text().then((t) => { const n = addPack(t); setPackMsg(n ? `✓ ${n} ta jihoz qo'shildi` : "✗ Yaroqsiz JSON"); if (n) setPackText(""); });
              }} />
            </label>
            <button onClick={() => { const n = addPack(packText); setPackMsg(n ? `✓ ${n} ta jihoz qo'shildi` : "✗ Yaroqsiz JSON"); if (n) setPackText(""); }} style={{ flex: 1, padding: "7px 0", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, border: "1px solid rgba(76,139,245,0.6)", background: "rgba(76,139,245,0.2)", color: "#fff" }}>Yuklash</button>
          </div>
        </div>
      )}
    </>
  );
}
