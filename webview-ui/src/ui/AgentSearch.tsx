import { useEffect, useMemo, useRef, useState } from "react";
import { type Key, useT } from "../i18n";
import { roleKeyFor, STATUS_COLOR } from "../scene/roles";
import { matchAgents } from "../search";
import { displayName, useOffice } from "../store";
import { send } from "../transport";

// ── Agent qidiruvi (🔍 / "/" tugmasi) ────────────────────────
// Ko'p agent bo'lganda yuqori paneldagi chiplar sig'maydi. Bu yerda yozib
// topasiz: papka nomi, rol, holat yoki joriy tool bo'yicha. Enter — tanlaydi
// va terminalga fokus beradi.

export default function AgentSearch() {
  const t = useT();
  const agents = useOffice((s) => s.agents);
  const order = useOffice((s) => s.order);
  const select = useOffice((s) => s.select);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => {
    const list = order
      .map((id) => agents[id])
      .filter(Boolean)
      .map((a) => ({
        id: a.id,
        folderName: displayName(a),
        folderAlt: a.customName ? a.folderName : undefined, // repo nomi bilan ham topilsin
        roleLabel: t(`role.${roleKeyFor(a.role, a.seatIndex)}` as Key),
        statusLabel: t(`status.${a.status}` as Key),
        toolLabel: a.toolLabel,
        color: STATUS_COLOR[a.status],
      }));
    return matchAgents(list, q);
  }, [agents, order, q, t]);

  // "/" — qidiruvni ochadi (matn kiritishda emas). Esc — yopadi.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (!open && e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        setOpen(true);
        return;
      }
      if (open && e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Ochilganda fokus + tashqariga bosilsa yopish
  useEffect(() => {
    if (!open) { setQ(""); setCursor(0); return; }
    inputRef.current?.focus();
    const onDown = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const pick = (id: number) => {
    select(id);
    send({ type: "focusAgent", id });
    setOpen(false);
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(rows.length - 1, c + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
    else if (e.key === "Enter" && rows[cursor]) pick(rows[cursor].id);
  };

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t("search.open")}
        aria-pressed={open}
        title={`${t("search.open")} ( / )`}
        style={{
          pointerEvents: "auto", display: "flex", alignItems: "center", padding: "3px 7px", borderRadius: 8,
          cursor: "pointer", fontSize: 12, color: "#e8ecf2",
          border: `1px solid ${open ? "rgba(94,155,255,0.6)" : "rgba(255,255,255,0.14)"}`,
          background: open ? "rgba(94,155,255,0.22)" : "rgba(20,24,32,0.8)",
        }}
      >
        🔍
      </button>

      {open && (
        <div
          role="dialog"
          style={{
            position: "absolute", top: 38, left: 0, width: 296, pointerEvents: "auto",
            background: "rgba(18,22,29,0.98)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 12, boxShadow: "0 12px 32px rgba(0,0,0,0.55)", overflow: "hidden",
            fontFamily: "system-ui", color: "#e8ecf2",
          }}
        >
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setCursor(0); }}
            onKeyDown={onInputKey}
            placeholder={t("search.placeholder")}
            style={{
              width: "100%", boxSizing: "border-box", padding: "10px 12px", border: "none", outline: "none",
              borderBottom: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#e8ecf2", fontSize: 12.5,
            }}
          />
          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            {rows.length === 0 ? (
              <div style={{ padding: "16px 12px", fontSize: 12, opacity: 0.55, textAlign: "center" }}>{t("search.none")}</div>
            ) : (
              rows.map((r, n) => (
                <button
                  key={r.id}
                  onClick={() => pick(r.id)}
                  onMouseEnter={() => setCursor(n)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
                    padding: "7px 12px", border: "none", cursor: "pointer", color: "#e8ecf2",
                    background: n === cursor ? "rgba(94,155,255,0.18)" : "transparent",
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: r.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.folderName}</span>
                    <span style={{ display: "block", fontSize: 10.5, opacity: 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.roleLabel} · {r.statusLabel}{r.toolLabel ? ` · ${r.toolLabel}` : ""}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
          <div style={{ padding: "6px 12px", fontSize: 9.5, opacity: 0.45, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            {t("search.hint")}
          </div>
        </div>
      )}
    </div>
  );
}
