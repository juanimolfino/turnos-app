"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, CalendarRange, X } from "lucide-react";
import Link from "next/link";
import { useIsMobile } from "@/hooks/use-is-mobile";

interface Court { id: string; name: string; }
interface Block {
  id: string; courtId: string; date: string;
  startTime: string; endTime: string; type: string;
  blockGroupId: string | null; notes: string | null; label: string | null;
}
interface Props {
  courts: Court[];
  blocks: Block[];
  date: string;   // YYYY-MM-DD que se muestra
}

const TYPE_META: Record<string, { label: string; short: string; bg: string; bd: string; fg: string }> = {
  clase:     { label: "Clases",     short: "Clases",    bg: "#EAF0F8", bd: "#D3DEF0", fg: "#3D5C93" },
  fijo:      { label: "Turno fijo", short: "Fijo",      bg: "#F1EAF7", bd: "#E2D4EF", fg: "#6B4E9E" },
  flex:      { label: "Turno flex", short: "Flex",      bg: "#E4F1EF", bd: "#C9E5E0", fg: "#2E7D6F" },
  americano: { label: "Americano",  short: "Americano", bg: "#FBEBE2", bd: "#F2D6C5", fg: "#B0572C" },
  torneo:    { label: "Torneo",     short: "Torneo",    bg: "#F7EFD9", bd: "#EBDFBF", fg: "#8A6D1F" },
  bloqueo:   { label: "Cerrado",    short: "Cerrado",   bg: "#EFECE6", bd: "#DED8CC", fg: "#8A8377" },
};
function metaFor(type: string) {
  if (type === "evento") return TYPE_META.americano;
  return TYPE_META[type] ?? TYPE_META.bloqueo;
}

function toMin(t: string) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
function toTime(m: number) {
  const h = Math.floor(m / 60).toString().padStart(2, "0");
  const mm = (m % 60).toString().padStart(2, "0");
  return `${h}:${mm}`;
}
function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const ROW_H = 42;

export function AgendaDayClient({ courts, blocks, date }: Props) {
  const router = useRouter();
  const isMobile = useIsMobile();

  // reloj cliente (evita mismatch de hidratación: arranca null)
  const [nowMin, setNowMin] = useState<number | null>(null);
  const [clientToday, setClientToday] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNowMin(d.getHours() * 60 + d.getMinutes());
      setClientToday(localToday());
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  const isToday = clientToday === date;

  const { gridStart, gridEnd } = useMemo(() => {
    let minM = toMin("08:00");
    let maxM = toMin("23:30");
    for (const b of blocks) {
      minM = Math.min(minM, toMin(b.startTime));
      maxM = Math.max(maxM, toMin(b.endTime));
    }
    return { gridStart: Math.floor(minM / 30) * 30, gridEnd: Math.ceil(maxM / 30) * 30 };
  }, [blocks]);

  const slots = useMemo(() => {
    const arr: { start: string; end: string; min: number }[] = [];
    for (let m = gridStart; m < gridEnd; m += 30) arr.push({ start: toTime(m), end: toTime(m + 30), min: m });
    return arr;
  }, [gridStart, gridEnd]);

  const [detail, setDetail] = useState<Block | null>(null);

  const dateLabel = new Date(date + "T12:00:00").toLocaleDateString("es-AR", {
    weekday: "long", day: "numeric", month: "long",
  });

  // posición de la línea "ahora"
  const showNow = isToday && nowMin !== null && nowMin >= gridStart && nowMin <= gridEnd;
  const nowTop = nowMin !== null ? ((nowMin - gridStart) / 30) * ROW_H : 0;

  if (courts.length === 0) {
    return (
      <div style={{ padding: isMobile ? "16px 14px 40px" : "28px 32px", maxWidth: 560 }}>
        <div style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: isMobile ? 26 : 30, color: "#221F1B" }}>
          Agenda del día
        </div>
        <div style={{ background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 16, padding: "32px 24px", textAlign: "center", marginTop: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#6B6660", marginBottom: 8 }}>Todavía no configuraste tus canchas.</div>
          <Link href="/agenda" style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 8, background: "#C96442", color: "#fff", borderRadius: 10, padding: "10px 18px", fontWeight: 600, fontSize: 14, textDecoration: "none" }}>
            <CalendarRange size={16} /> Ir a Agenda semanal
          </Link>
        </div>
      </div>
    );
  }

  const gridCols = `56px repeat(${courts.length}, 1fr)`;

  return (
    <div style={{ padding: isMobile ? "12px 12px 40px" : "24px 28px 48px", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: isMobile ? 24 : 28, color: "#221F1B" }}>
            Agenda del día
          </div>
          <div style={{ fontSize: 13.5, color: "#6B6660", marginTop: 2, textTransform: "capitalize" }}>{dateLabel}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => router.push(`/dashboard?date=${addDays(date, -1)}`)} aria-label="Día anterior" style={navBtn}><ChevronLeft size={18} /></button>
          <button onClick={() => router.push(`/dashboard?date=${localToday()}`)} style={{ ...ghostBtn, padding: "9px 14px" }}>Hoy</button>
          <button onClick={() => router.push(`/dashboard?date=${addDays(date, 1)}`)} aria-label="Día siguiente" style={navBtn}><ChevronRight size={18} /></button>
        </div>
      </div>

      {/* Grid */}
      <div style={{ overflowX: "auto", border: "1px solid #E7E1D6", borderRadius: 14, background: "#FCFBF8" }}>
        <div style={{ minWidth: isMobile ? Math.max(360, 56 + courts.length * 120) : "auto" }}>
          {/* header de canchas */}
          <div style={{ display: "grid", gridTemplateColumns: gridCols, borderBottom: "1px solid #EFEAE0", position: "sticky", top: 0, background: "#FCFBF8", zIndex: 2 }}>
            <div />
            {courts.map((c) => (
              <div key={c.id} style={{ textAlign: "center", padding: "10px 6px", borderLeft: "1px solid #EFEAE0", fontSize: 13, fontWeight: 700, color: "#221F1B" }}>
                {c.name}
              </div>
            ))}
          </div>

          {/* filas + línea ahora */}
          <div style={{ position: "relative" }}>
            {slots.map((slot) => {
              const isPast = isToday && nowMin !== null && slot.min + 30 <= nowMin;
              return (
                <div key={slot.start} style={{ display: "grid", gridTemplateColumns: gridCols, height: ROW_H }}>
                  <div style={{ fontSize: 11, color: "#A39C8F", textAlign: "right", paddingRight: 6, paddingTop: 3, fontWeight: 600, opacity: isPast ? 0.45 : 1 }}>
                    {slot.start.endsWith(":00") ? slot.start : ""}
                  </div>
                  {courts.map((court) => {
                    const block = blocks.find((b) => b.courtId === court.id && b.startTime < slot.end && b.endTime > slot.start);
                    if (!block) {
                      return <div key={court.id} style={{ borderLeft: "1px solid #EFEAE0", borderTop: "1px solid #F4F1EA", background: isPast ? "#F6F3EC" : "transparent" }} />;
                    }
                    const meta = metaFor(block.type);
                    const isFirst = (block.startTime >= slot.start && block.startTime < slot.end) || (slot.min === gridStart && toMin(block.startTime) < gridStart);
                    return (
                      <button key={court.id} onClick={() => setDetail(block)} style={{
                        borderLeft: "1px solid #EFEAE0",
                        background: meta.bg,
                        borderTop: isFirst ? `2px solid ${meta.bd}` : "none",
                        cursor: "pointer", padding: isFirst ? "3px 6px" : 0, textAlign: "left", overflow: "hidden",
                        opacity: isPast ? 0.4 : 1,
                      }}>
                        {isFirst && <span style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: meta.fg, lineHeight: 1.15 }}>{block.label ?? meta.short}</span>}
                        {isFirst && <span style={{ display: "block", fontSize: 10, color: meta.fg, opacity: 0.85 }}>{block.startTime}–{block.endTime}</span>}
                      </button>
                    );
                  })}
                </div>
              );
            })}

            {/* línea de ahora */}
            {showNow && (
              <div style={{ position: "absolute", left: 0, right: 0, top: nowTop, height: 0, zIndex: 3, pointerEvents: "none" }}>
                <div style={{ position: "relative", borderTop: "2px solid #C96442" }}>
                  <span style={{
                    position: "absolute", left: 2, top: -9, background: "#C96442", color: "#fff",
                    fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999,
                  }}>
                    {toTime(nowMin!)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* leyenda */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {(["clase", "fijo", "flex", "americano", "torneo", "bloqueo"] as const).map((t) => (
          <div key={t} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: TYPE_META[t].bg, border: `1px solid ${TYPE_META[t].bd}` }} />
            <span style={{ fontSize: 12, color: "#6B6660" }}>{TYPE_META[t].label}</span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 12.5, color: "#928B7E" }}>
        Lo que ves acá se arma desde{" "}
        <Link href="/agenda" style={{ color: "#C96442", fontWeight: 600 }}>Agenda semanal</Link>.
      </div>

      {/* detalle (solo lectura) */}
      {detail && (() => {
        const meta = metaFor(detail.type);
        const courtName = courts.find((c) => c.id === detail.courtId)?.name ?? "Cancha";
        return (
          <div onClick={() => setDetail(null)} style={{
            position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.42)",
            display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : 20,
          }}>
            <div onClick={(e) => e.stopPropagation()} style={{
              background: "#F8F6F0", borderRadius: isMobile ? "18px 18px 0 0" : 18, width: "100%", maxWidth: 440,
              padding: "18px 18px 24px", boxShadow: "0 20px 50px -12px rgba(0,0,0,.35)",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <span style={{ padding: "4px 10px", borderRadius: 999, background: meta.bg, color: meta.fg, fontWeight: 700, fontSize: 12.5 }}>{meta.label}</span>
                <button onClick={() => setDetail(null)} aria-label="Cerrar" style={{ width: 32, height: 32, borderRadius: 9, border: "1px solid #E0DACE", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#54504A" }}><X size={15} /></button>
              </div>
              {detail.label && <div style={{ fontSize: 16, fontWeight: 700, color: "#221F1B", marginBottom: 4 }}>{detail.label}</div>}
              <div style={{ fontSize: 14, color: "#54504A" }}>{courtName} · {detail.startTime} – {detail.endTime}</div>
              {detail.notes && <div style={{ fontSize: 13.5, color: "#6B6660", marginTop: 8 }}>{detail.notes}</div>}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

const navBtn: React.CSSProperties = {
  width: 38, height: 38, borderRadius: 10, border: "1px solid #E0DACE", background: "#FCFBF8",
  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#54504A", flexShrink: 0,
};
const ghostBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", color: "#6B6660",
  border: "1px solid #E0DACE", borderRadius: 10, fontWeight: 600, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit",
};
