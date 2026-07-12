import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { memo, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { AgentView } from "../store";
import { useOffice } from "../store";
import { slide } from "./collision";
import { breakRoom, idleDestination, nearestNode, NODES, pathBetween, type WP } from "./nav";
import { blockedByAgent, clearMeeting, meetingOf, meetSpot, presenceOf, report, seekMeeting, unreport } from "./presence";
import PixelPerson from "./PixelPerson";
import { contactShadowMat, SHADOW_PLANE } from "./resources";
import { type CharSkin, characterFor, roleKeyFor, seatFor, sitPoint, STATUS_COLOR, tokenBar } from "./roles";
import { type Key, useT } from "../i18n";
import { useSettings } from "../settings";

// ── Agent personaji (dunyo darajasida, navigatsiya bilan) ────
// Ishlaganda stolda o'tiradi; bo'sh (idle) turganda ofis bo'ylab sayr
// qiladi — eshiklardan xonalarga kiradi (Pixel Agents kabi).

const SPEED = 1.7;

function AgentAvatar({ agent }: { agent: AgentView }) {
  const seat = seatFor(agent.seatIndex);
  const preset = characterFor(agent.role, agent.seatIndex, agent.id);
  // Yorliq — papka nomi (repoда hammasи bir xil) o'rniga ANIQLANGAN rol (tarjimali).
  const t = useT();
  const roleLabel = t(`role.${roleKeyFor(agent.role, agent.seatIndex)}` as Key);
  const select = useOffice((s) => s.select);
  const selected = useOffice((s) => s.selectedId === agent.id);
  const showLabels = useSettings((s) => s.showLabels);
  const color = STATUS_COLOR[agent.status];
  const tok = tokenBar(agent.inputTokens, agent.contextWindow);

  // Sub-agent "yollash" pufagi — subagentlar soni oshganda qisqa vaqt ko'rinadi.
  const [hiring, setHiring] = useState(false);
  const prevSubs = useRef(agent.subagents.length);
  useEffect(() => {
    const inc = agent.subagents.length > prevSubs.current;
    prevSubs.current = agent.subagents.length;
    if (inc) setHiring(true);
  }, [agent.subagents.length]);
  // Yashirish taymeri — `hiring`ga bog'liq (soni o'zgarsa ham qotib qolmaydi).
  useEffect(() => {
    if (!hiring) return;
    const t = setTimeout(() => setHiring(false), 3500);
    return () => clearTimeout(t);
  }, [hiring]);

  // Yordamchilar — BARQAROR slot + chiqish animatsiyasi. Store ro'yxatidan
  // farqi: ketayotgan yordamchini darrov o'chirmay, kichrayib yo'qolgunча
  // saqlaymiz. Slot kalit bo'yicha barqaror — o'rtadagi ketsa qolganlari
  // SAKRAMAYDI (avvalgi index-asosli joylashuv bug'i).
  const [helpers, setHelpers] = useState<{ key: string; slot: number; leaving: boolean }[]>([]);
  const subSig = agent.subagents.join(",");
  useEffect(() => {
    const active = agent.subagents;
    setHelpers((prev) => {
      const used = new Set<number>();
      const next = prev.map((h) => {
        used.add(h.slot);
        return active.includes(h.key) ? (h.leaving ? { ...h, leaving: false } : h) : { ...h, leaving: true };
      });
      for (const key of active) {
        if (!next.some((h) => h.key === key)) {
          let slot = 0;
          while (used.has(slot)) slot++;
          used.add(slot);
          next.push({ key, slot, leaving: false });
        }
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subSig]);
  const removeHelper = (key: string) => setHelpers((prev) => prev.filter((h) => h.key !== key));

  // O'tirish nuqtasi (stul markazi — har qanday yo'nalishga mos, collision chetda)
  const sit = useRef<WP>({ ...sitPoint(seat) });

  const group = useRef<THREE.Group>(null);
  const pos = useRef<WP>({ ...sit.current });
  const path = useRef<WP[]>([]);
  const curNode = useRef(nearestNode(sit.current.x, sit.current.z)); // joriy graf tuguni
  const pendingNode = useRef<string | null>(null);
  const pause = useRef(0);
  const seated = useRef(true);
  const movingRef = useRef(false);
  const prevDesired = useRef(true);
  const stuck = useRef(0);
  const speedRef = useRef(0); // haqiqiy yurish tezligi (oyoq sirg'anmasin uchun)
  const firstIdleTrip = useRef(false); // ishdan endi bo'shadi → tanaffusga
  const statusRef = useRef(agent.status);
  statusRef.current = agent.status;
  // ── Ijtimoiy hayot (uchrashuv) ──
  const reportT = useRef(0); // presence bildirish throttle
  const seekCd = useRef(3 + Math.random() * 4); // keyingi izlashgacha
  const metAt = useRef(0); // gather nuqtasiga yetgan payt (0 = yetmagan)
  const [emote, setEmote] = useState<"" | "👋" | "☕" | "💬">("");
  const emoteRef = useRef<"" | "👋" | "☕" | "💬">("");
  useEffect(() => () => unreport(agent.id), [agent.id]); // ketganda reyestrдан chiqar

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const g = group.current;
    if (!g) return;
    // Sozlamalarni HAR FREYM store'dan o'qiymiz (reaktiv obuna emas — o'zgarish
    // darhol ta'sir qiladi, lekin qayta render qilinmaydi).
    const cfg = useSettings.getState();
    // Sayr o'chirilgan bo'lsa — bo'sh agent ham stolida qoladi.
    const desiredSit = statusRef.current !== "idle" || !cfg.wander;
    const p = pos.current;

    // Uchrashuvlar o'chirilgan bo'lsa — boshlanganini ham tozalaymiz (yarim
    // yo'lda qotib qolmasin) va yangisini izlamaymiz.
    if (!cfg.social && meetingOf(agent.id)) { clearMeeting(agent.id); metAt.current = 0; }

    // Rejim o'zgarsa — joriy tugunga yetib qayta rejalaymiz (uzoq aylanmasin)
    if (desiredSit !== prevDesired.current) {
      prevDesired.current = desiredSit;
      if (!desiredSit) firstIdleTrip.current = true; // ishni tugatdi → tanaffus
      if (desiredSit) { clearMeeting(agent.id); metAt.current = 0; } // task keldi → uchrashuvni tashla
      if (path.current.length > 1) {
        path.current = path.current.slice(0, 1);
        pendingNode.current = null;
      }
    }

    // Ijtimoiy izlash — HAR freym (sayr davomida ham). Cooldown tugagach bo'sh
    // sherik topilsa, joriy yo'lni tashlab hub'ga yo'naladi (keyingi freym
    // meet-tarmog'i boshqaradi). Aks holda tez-tez qayta urinadi.
    if (!desiredSit && cfg.social && !meetingOf(agent.id)) {
      if (seekCd.current > 0) seekCd.current -= dt;
      else {
        const m = seekMeeting(agent.id, p.x, p.z, performance.now() / 1000);
        if (m) { path.current = []; pendingNode.current = null; }
        else seekCd.current = 1.2 + Math.random(); // sherik hali yo'q — birozdan keyin
      }
    }
    // Uchrashuv bor, lekin sayr yo'lida (sherik — o'z yo'lini tozalamagan) —
    // joriy qirrani tugatib hub'ga qayta yo'naltiramiz (uzoq sayr qilmasin).
    {
      const cm = meetingOf(agent.id);
      if (cm && metAt.current === 0 && pendingNode.current !== cm.point && path.current.length > 1) {
        path.current = path.current.slice(0, 1);
        pendingNode.current = null;
      }
    }

    // Yo'l tugagan — keyingi maqsad. HAR DOIM graf tugunidan (curNode) yo'l
    // olamiz → yo'llar faqat eshiklardan o'tadi, devor/mebeldan emas.
    if (path.current.length === 0) {
      const atSeat = Math.hypot(p.x - sit.current.x, p.z - sit.current.z) < 0.25;
      if (desiredSit) {
        if (atSeat) {
          seated.current = true;
        } else {
          const target = nearestNode(sit.current.x, sit.current.z);
          const route = pathBetween(curNode.current, target);
          // Yo'l topilmasa — to'g'ridan-to'g'ri stulga (o'z stoli ochiq maydonda).
          path.current = route.length ? [...route, sit.current] : [sit.current];
          pendingNode.current = route.length ? target : null;
        }
      } else {
        seated.current = false;
        const now = performance.now() / 1000;
        const meet = meetingOf(agent.id);
        if (!meet && metAt.current) metAt.current = 0; // uchrashuv tashqaridan tozalandi
        if (meet) {
          // ── Uchrashuv: O'Z joyimga (spot) boraman; ikkovimiz yetgach ~6s
          //    suhbat, keyin tarqaymiz. Sherik ketsa — kutmaymiz. ──
          const spot = meetSpot(meet);
          const partner = presenceOf(meet.partner);
          const bothHere = metAt.current > 0 && partner != null && partner.metAt > 0;
          const chatSince = bothHere ? Math.max(metAt.current, partner!.metAt) : 0;
          const chatDone = bothHere && now - chatSince > 6;
          const partnerGone = partner == null || meetingOf(meet.partner) == null; // yurib turган bo'lsam ham bekor qilaman (R2)
          if (now > meet.until || chatDone || partnerGone) {
            clearMeeting(agent.id);
            metAt.current = 0;
            seekCd.current = 18 + Math.random() * 20; // yaqinда qayta uchrashmasin
            pause.current = 0.4 + Math.random();
          } else if (Math.hypot(p.x - spot.x, p.z - spot.z) < 0.32) {
            if (metAt.current === 0) metAt.current = now; // joyimga yetdim (sherikni kutaman)
          } else if (Math.hypot(p.x - NODES[meet.point].x, p.z - NODES[meet.point].z) < 1.3) {
            // hub'ga yetdim — oxirgi qadamni O'Z joyimga to'g'ri yuraman
            path.current = [spot];
            pendingNode.current = null;
          } else {
            const from = nearestNode(p.x, p.z);
            const route = pathBetween(from, meet.point);
            if (route.length === 0) { curNode.current = from; pause.current = 0.5; }
            else { path.current = route; curNode.current = from; pendingNode.current = meet.point; }
          }
        } else if (pause.current > 0) {
          pause.current -= dt;
        } else {
          const target = firstIdleTrip.current ? breakRoom() : idleDestination(agent.role);
          firstIdleTrip.current = false;
          const route = pathBetween(curNode.current, target);
          if (route.length === 0) {
            // Yetib bo'lmaydi — joyimizni qayta aniqlab, biroz kutamiz.
            curNode.current = nearestNode(p.x, p.z);
            pause.current = 0.6 + Math.random();
          } else {
            path.current = route;
            pendingNode.current = target;
          }
        }
      }
    }

    // Harakat — faqat yo'l nuqtalari orasida (graf qirralari devor kesmaydi)
    let moving = false;
    if (path.current.length > 0) {
      seated.current = false;
      const t = path.current[0];
      const dx = t.x - p.x;
      const dz = t.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.1) {
        p.x = t.x;
        p.z = t.z;
        path.current.shift();
        if (path.current.length === 0) {
          curNode.current = pendingNode.current ?? nearestNode(p.x, p.z);
          pendingNode.current = null;
          if (!desiredSit) pause.current = 1.5 + Math.random() * 4;
        }
      } else {
        // QATTIQ to'qnashuv — devor/mebeldan o'tmaydi, sirg'anadi
        const mvx = (dx / dist) * SPEED * dt;
        const mvz = (dz / dist) * SPEED * dt;
        const res = slide(p.x, p.z, mvx, mvz, 0.16);
        // Agent-agent collision — bir-birini ustidan arvohdek o'tmaydi. O'q
        // bo'yicha: agar YANGI joy boshqa agentга tegsa (va hozir tegmayotgan
        // bo'lsak) — o'sha o'q bo'yicha turamiz. (Ichida qolsa — chiqishga ruxsat.)
        const SEP = 0.42;
        let fx = res.x, fz = res.z;
        if (blockedByAgent(agent.id, fx, p.z, SEP) && !blockedByAgent(agent.id, p.x, p.z, SEP)) fx = p.x;
        if (blockedByAgent(agent.id, fx, fz, SEP) && !blockedByAgent(agent.id, fx, p.z, SEP)) fz = p.z;
        const moved = Math.hypot(fx - p.x, fz - p.z);
        p.x = fx;
        p.z = fz;
        moving = true;
        speedRef.current = moved / Math.max(dt, 0.001); // m/s — qadam fazasi uchun
        g.rotation.y = dampAngle(g.rotation.y, Math.atan2(-dx, -dz), 10, dt);
        // Tiqilib qolsa — bu nuqtani tashlab, qayta rejalaymiz
        if (moved < SPEED * dt * 0.25) {
          stuck.current += dt;
          if (stuck.current > 0.8) {
            path.current.shift();
            stuck.current = 0;
            if (path.current.length === 0) {
              // Yetib BORMADIK — shuning uchun joriy tugunni HAQIQIY joydan
              // olamiz (pendingNode'ni ishlatsak, graf bo'yicha yolg'on joyda
              // turgan bo'lardik va keyingi yo'l ham noto'g'ri chiqardi).
              curNode.current = nearestNode(p.x, p.z);
              pendingNode.current = null;
              if (!desiredSit) pause.current = 1 + Math.random() * 3;
            }
          }
        } else {
          stuck.current = 0;
        }
      }
    }
    movingRef.current = moving;
    if (!moving) speedRef.current *= Math.max(0, 1 - dt * 6); // to'xtaganda so'nadi

    if (seated.current) g.rotation.y = dampAngle(g.rotation.y, seat.ry, 8, dt);
    g.position.x = p.x;
    g.position.z = p.z;

    // ── Uchrashuv: joyimga yetsam SHERIKKA qarayman; IKKOVIMIZ yetsa gaplashamiz.
    //    Emote FAQAT ikkovi ham yetganда (yolg'iz o'zidan emote yo'q). ──
    const mNow = meetingOf(agent.id);
    const partnerNow = mNow ? presenceOf(mNow.partner) : undefined;
    if (mNow && metAt.current > 0) {
      // Sherik kelgan bo'lsa unga, aks holda hub markaziga (kutish yo'nalishi) qaray
      const tx = partnerNow ? partnerNow.x : NODES[mNow.point].x;
      const tz = partnerNow ? partnerNow.z : NODES[mNow.point].z;
      const dx = tx - p.x, dz = tz - p.z;
      if (Math.hypot(dx, dz) > 0.05) g.rotation.y = dampAngle(g.rotation.y, Math.atan2(-dx, -dz), 6, dt);
      const bothHere = partnerNow != null && partnerNow.metAt > 0;
      if (bothHere) {
        const since = Math.max(metAt.current, partnerNow!.metAt);
        const el = performance.now() / 1000 - since;
        // 👋 salom → 💬 suhbat (nav-bat almashib turadi)
        const e = el < 1.6 ? "👋" : Math.floor(el * 1.2) % 2 === 0 ? "💬" : "☕";
        if (emoteRef.current !== e) { emoteRef.current = e; setEmote(e); }
      } else if (emoteRef.current !== "") {
        emoteRef.current = ""; setEmote(""); // sherik hali yo'q — jim kutamiz
      }
    } else if (emoteRef.current !== "") {
      emoteRef.current = ""; setEmote("");
    }

    // Presence reyestri (throttled ~5/s) — metAt bilan (sherik yetganimni bilsin)
    reportT.current -= dt;
    if (reportT.current <= 0) {
      reportT.current = 0.2;
      report(agent.id, p.x, p.z, statusRef.current === "idle", metAt.current);
    }
  });

  return (
    <group ref={group} position={[sit.current.x, 0, sit.current.z]} onClick={(e) => { e.stopPropagation(); select(agent.id); }}>
      {/* Yumshoq contact-shadow — agentni yerga bog'laydi (yassi, radial) */}
      <mesh geometry={SHADOW_PLANE} material={contactShadowMat()} position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[0.92, 0.92, 1]} />
      <PixelPerson
        skin={preset}
        status={agent.status}
        getState={() => ({ sit: seated.current, moving: movingRef.current, speed: speedRef.current })}
      />

      {/* Sub-agentlar — yonida KICHIK yordamchi personaj (kirish/chiqish anim.) */}
      {helpers.map((h) => (
        <SubAgent key={h.key} skin={preset} slot={h.slot} leaving={h.leaving} onExited={() => removeHelper(h.key)} />
      ))}

      {/* Ijtimoiy imo-ishora (uchrashuvда salom/qahva) */}
      {emote && (
        <Html position={[0, 2.25, 0]} center style={{ pointerEvents: "none" }}>
          <div style={{ fontSize: 20, filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.5))" }}>{emote}</div>
        </Html>
      )}

      {/* "Sub-agent yolladi" pufagi — yollangan zahoti qisqa vaqt ko'rinadi */}
      {hiring && (
        <Html position={[0, 2.62, 0]} center style={{ pointerEvents: "none" }}>
          <div style={{ padding: "4px 10px", borderRadius: 12, background: "#ffd60a", color: "#1a1500", fontFamily: "system-ui", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>{t("bubble.subHire")}</div>
        </Html>
      )}

      {/* Ruxsat pufagi */}
      {agent.permission && (
        <Html position={[0, 2.35, 0]} center style={{ pointerEvents: "none" }}>
          <div style={{ padding: "4px 10px", borderRadius: 12, background: "#ff9f0a", color: "#1a1300", fontFamily: "system-ui", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>{t("bubble.permission")}</div>
        </Html>
      )}

      {/* Yorliq — tanlanganda to'liq, aks holda IXCHAM (ko'p agentda ustma-ust
          bo'lmasin: faqat nuqta + nom). Sozlamada o'chirilsa — ko'rinmaydi
          (ruxsat/sub-agent pufaklari esa signal, ular baribir chiqadi). */}
      {showLabels && (
      <Html position={[0, 1.98, 0]} center occlude={false} style={{ pointerEvents: "none" }} zIndexRange={selected ? [100, 0] : [10, 0]}>
        {selected ? (
          <div style={{ padding: "3px 9px 5px", borderRadius: 8, minWidth: 92, background: "rgba(94,155,255,0.92)", border: `1px solid ${color}`, color: "#fff", fontFamily: "system-ui", fontSize: 12, whiteSpace: "nowrap", textAlign: "center" }}>
            <div style={{ fontWeight: 600 }}>{roleLabel}</div>
            <div style={{ fontSize: 10, opacity: 0.85 }}><span style={{ color }}>●</span> {t(`status.${agent.status}` as Key)}{agent.toolLabel ? ` · ${agent.toolLabel}` : ""}</div>
            {agent.inputTokens > 0 && (
              <div style={{ marginTop: 3, height: 4, borderRadius: 3, background: "rgba(255,255,255,0.16)", overflow: "hidden" }}>
                <div style={{ width: `${Math.max(4, tok.pct * 100)}%`, height: "100%", background: tok.color }} />
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "2px 8px", borderRadius: 11, background: "rgba(16,20,27,0.82)", border: `1px solid ${color}`, color: "#fff", fontFamily: "system-ui", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
            {roleLabel}
          </div>
        )}
      </Html>
      )}
    </group>
  );
}

// Sub-agent — parent yonidagi KICHIK yordamchi. Kirganda noldan "pop"
// (easeOutBack) bilan kattalashadi, ketganda kichrayib yo'qoladi (leaving),
// so'ng onExited orqali ro'yxatдан chiqadi. Joyi `slot` bo'yicha barqaror.
const SUB_TARGET = 0.5;
function SubAgent({ skin, slot, leaving, onExited }: { skin: CharSkin; slot: number; leaving: boolean; onExited: () => void }) {
  const t = useT();
  const g = useRef<THREE.Group>(null);
  const grow = useRef(0);
  const shrink = useRef(0);
  const done = useRef(false);
  const px = 0.9 + (slot % 2) * 0.62;
  const pz = 0.45 - Math.floor(slot / 2) * 0.62;
  useFrame((_, delta) => {
    const gg = g.current;
    if (!gg) return;
    if (leaving) {
      shrink.current = Math.min(1, shrink.current + delta * 4.5); // ~0.22s
      const e = 1 - shrink.current * shrink.current; // easeInQuad → 1..0
      gg.scale.setScalar(Math.max(0.0001, SUB_TARGET * e));
      if (shrink.current >= 1 && !done.current) { done.current = true; onExited(); }
      return;
    }
    if (grow.current < 1) {
      grow.current = Math.min(1, grow.current + delta * 3.2); // ~0.3s
      const x = grow.current, c1 = 1.70158, c3 = c1 + 1;
      gg.scale.setScalar(SUB_TARGET * (1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2))); // easeOutBack
    }
  });
  return (
    <group ref={g} position={[px, 0, pz]} scale={0.001}>
      <PixelPerson skin={skin} status="working" pose="stand" detail="low" />
      <Html position={[0, 1.95, 0]} center style={{ pointerEvents: "none" }}>
        <div style={{ padding: "2px 7px", borderRadius: 7, background: "rgba(255,214,10,0.92)", color: "#1a1500", fontFamily: "system-ui", fontSize: 9, fontWeight: 700, whiteSpace: "nowrap" }}>{t("bubble.helper")}</div>
      </Html>
    </group>
  );
}

function dampAngle(cur: number, target: number, l: number, dt: number): number {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + d * (1 - Math.exp(-l * dt));
}

// memo — store o'zgarmagan agent obyekt ref'ini saqlaydi, shuning uchun boshqa
// agent yangilanganda bu personaj qayta render bo'lmaydi (ko'p agentda muhim).
export default memo(AgentAvatar);
