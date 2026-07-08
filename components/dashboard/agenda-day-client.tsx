"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { bookingPanelLabel } from "@/lib/bookings/labels";
import { nowInTz } from "@/lib/tz";

interface Court { id: string; name: string; }
interface Block {
  id: string; courtId: string; date: string;
  startTime: string; endTime: string; type: string;
  status: string; blockGroupId: string | null; notes: string | null; label: string | null;
  customerPhone?: string | null;
  origin?: string | null;
}
interface Props {
  courts: Court[];
  blocks: Block[];
  date: string;
  clubName: string;
  timezone: string;
  openingWindow: { open: string; close: string };
}

type StatusKey = "libre" | "simple" | "pendiente" | "clase" | "fijo" | "americano" | "torneo" | "bloqueo";

const STATUS: Record<StatusKey, { bg: string; bd: string; fg: string; dot: string; label: string }> = {
  libre:     { bg: "#E9F3EA", bd: "#CFE6D2", fg: "#2F7D4E", dot: "#3E9B63", label: "Libre" },
  simple:    { bg: "#EAF3FA", bd: "#C9DDEE", fg: "#32647A", dot: "#5B92B1", label: "Reservado" },
  pendiente: { bg: "#FFF6E0", bd: "#D9A93B", fg: "#795C12", dot: "#D9A93B", label: "Pendiente de pago" },
  clase:     { bg: "#EAF0F8", bd: "#D3DEF0", fg: "#3D5C93", dot: "#5B7FBE", label: "Clase" },
  fijo:      { bg: "#F1EAF7", bd: "#E2D4EF", fg: "#6B4E9E", dot: "#8A6BC4", label: "Turno fijo" },
  americano: { bg: "#FBEBE2", bd: "#F2D6C5", fg: "#B0572C", dot: "#C96442", label: "Americano" },
  torneo:    { bg: "#F7EFD9", bd: "#EBDFBF", fg: "#8A6D1F", dot: "#CBA23C", label: "Torneo" },
  bloqueo:   { bg: "#F3E7E2", bd: "#EDD0C5", fg: "#9A5E4C", dot: "#C2887A", label: "Cerrado" },
};
function statusOf(type: string): StatusKey {
  if (type === "evento") return "americano";
  return (["simple", "clase", "fijo", "americano", "torneo", "bloqueo"] as StatusKey[]).includes(type as StatusKey)
    ? (type as StatusKey) : "bloqueo";
}
function statusOfBlock(block: Block): StatusKey {
  if (block.status === "pendiente") return "pendiente";
  return statusOf(block.type);
}
function blockDisplayLabel(block: Block | null, fallback: string) {
  if (!block || statusOfBlock(block) !== "simple") return fallback;
  return block.origin === "bot" ? "Reservado por bot" : "Reservado por admin";
}

const SEMAFORO = {
  green: { bg: "#E9F3EA", fg: "#2F7D4E", dot: "#3E9B63" },
  amber: { bg: "#F8EFD7", fg: "#90701E", dot: "#D9A93B" },
  red:   { bg: "#F3E7E2", fg: "#9A5E4C", dot: "#C2887A" },
};

function toTime(m: number) {
  const h = Math.floor(m / 60).toString().padStart(2, "0");
  const mm = (m % 60).toString().padStart(2, "0");
  return `${h}:${mm}`;
}
function toMin(t: string) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${days[d.getDay()]} ${d.getDate()} de ${months[d.getMonth()]}`;
}

interface Cell { court: Court; block: Block | null; }
interface Segment {
  start: string; end: string; cells: Cell[];
  free: number; total: number; level: "green" | "amber" | "red"; eventLabel?: string;
  merged: Block | null;
}

export function AgendaDayClient({ courts, blocks, date, clubName, timezone, openingWindow }: Props) {
  const router = useRouter();
  const isMobile = useIsMobile();

  const [courtFilter, setCourtFilter] = useState<string>("all");
  const [detail, setDetail] = useState<Block | null>(null);

  // reloj en la tz del club (evita mismatch de hidratación)
  const [now, setNow] = useState<{ date: string; minutes: number } | null>(null);
  useEffect(() => {
    const tick = () => setNow(nowInTz(timezone));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [timezone]);

  const visibleCourts = courtFilter === "all" ? courts : courts.filter((c) => c.id === courtFilter);

  // Construye franjas a partir de apertura/cierre del club y bordes de bloques.
  const segments = useMemo<Segment[]>(() => {
    const blockBounds = blocks.flatMap((b) => [b.startTime, b.endTime]);
    const minBound = blockBounds.reduce((min, value) => value < min ? value : min, openingWindow.open);
    const maxBound = blockBounds.reduce((max, value) => value > max ? value : max, openingWindow.close);
    const bounds = Array.from(new Set([minBound, maxBound, openingWindow.open, openingWindow.close, ...blockBounds])).sort();
    const segs: Segment[] = [];
    for (let i = 0; i < bounds.length - 1; i++) {
      const start = bounds[i], end = bounds[i + 1];
      if (start >= end) continue;
      const cells: Cell[] = courts.map((court) => ({
        court,
        block: blocks.find((b) => b.courtId === court.id && b.startTime <= start && b.endTime >= end) ?? null,
      }));
      const free = cells.filter((c) => !c.block).length;
      const total = cells.length;
      const level = free === total ? "green" : free === 0 ? "red" : "amber";
      const evt = cells.find((c) => c.block && (statusOfBlock(c.block) === "americano" || statusOfBlock(c.block) === "torneo"));
      const allSame = total > 1 && cells.every((c) => c.block && c.block.blockGroupId && c.block.blockGroupId === cells[0].block!.blockGroupId);
      segs.push({
        start, end, cells, free, total, level,
        eventLabel: evt?.block ? (evt.block.label ?? STATUS[statusOfBlock(evt.block)].label) : undefined,
        merged: allSame ? cells[0].block : null,
      });
    }
    return segs;
  }, [blocks, courts, openingWindow.close, openingWindow.open]);

  const isToday = now?.date === date;
  const nowMin = now ? now.minutes : null;
  const nowHHMM = now ? toTime(now.minutes) : null;

  // Ubicación de la línea de "ahora":
  //  - currentIdx: índice de la franja que contiene la hora actual (la línea
  //    se dibuja DENTRO de esa franja, a la altura proporcional).
  //  - edgeBefore/edgeAfter: la hora actual cae antes/después de toda la grilla.
  const { currentIdx, edgeBefore, edgeAfter } = useMemo(() => {
    if (!isToday || nowMin === null || segments.length === 0) {
      return { currentIdx: -1, edgeBefore: false, edgeAfter: false };
    }
    if (nowMin < toMin(segments[0].start)) return { currentIdx: -1, edgeBefore: true, edgeAfter: false };
    if (nowMin >= toMin(segments[segments.length - 1].end)) return { currentIdx: -1, edgeBefore: false, edgeAfter: true };
    const idx = segments.findIndex((s) => toMin(s.start) <= nowMin && nowMin < toMin(s.end));
    return { currentIdx: idx, edgeBefore: false, edgeAfter: false };
  }, [segments, isToday, nowMin]);

  const headerCols = isMobile;

  return (
    <div style={{ padding: isMobile ? "12px 14px 32px" : "24px 28px 40px", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header */}
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "flex-start" : "flex-end", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => router.push(`/dashboard?date=${now?.date ?? date}`)} style={{
            background: "#fff", border: "1px solid #E0DACE", borderRadius: 10,
            padding: "8px 14px", fontWeight: 600, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit",
          }}>Hoy</button>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => router.push(`/dashboard?date=${addDays(date, -1)}`)} style={navArrow}>‹</button>
            <button onClick={() => router.push(`/dashboard?date=${addDays(date, 1)}`)} style={navArrow}>›</button>
          </div>
          <div>
            <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: isMobile ? 20 : 25, lineHeight: 1.1, color: "#221F1B", textTransform: "capitalize" }}>
              {formatDate(date)}
            </div>
            {!isMobile && <div style={{ fontSize: 13, color: "#928B7E" }}>{clubName} · {courts.length} cancha{courts.length !== 1 ? "s" : ""}</div>}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", width: isMobile ? "100%" : "auto" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: 1 }}>
            {[{ id: "all", label: "Todas" }, ...courts.map((c) => ({ id: c.id, label: c.name }))].map(({ id, label }) => {
              const active = courtFilter === id;
              return (
                <button key={id} onClick={() => setCourtFilter(id)} style={{
                  background: active ? "#C96442" : "#FFFFFF", color: active ? "#fff" : "#54504A",
                  border: `1px solid ${active ? "#C96442" : "#E0DACE"}`,
                  borderRadius: 999, padding: "7px 13px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                }}>{label}</button>
              );
            })}
          </div>
          <Link href={`/agenda?week=${date}`} style={{
            background: "#C96442", color: "#fff", border: "none", borderRadius: 10,
            padding: "9px 15px", fontWeight: 600, fontSize: 13.5, cursor: "pointer", whiteSpace: "nowrap",
            textDecoration: "none", width: isMobile ? "100%" : "auto", textAlign: "center",
          }}>+ Nuevo bloque</Link>
        </div>
      </div>

      {/* Leyenda */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5, color: "#6B6660" }}>
        {[
          { dot: STATUS.libre.dot, label: "Libre" },
          { dot: STATUS.simple.dot, label: "Reservado" },
          { dot: STATUS.pendiente.dot, label: "Pendiente de pago" },
          { dot: STATUS.clase.dot, label: "Clase" },
          { dot: STATUS.fijo.dot, label: "Turno fijo" },
          { dot: STATUS.americano.dot, label: "Americano / torneo" },
        ].map(({ dot, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: dot }} />
            {label}
          </div>
        ))}
      </div>

      {/* Grid */}
      {segments.length === 0 ? (
        <div style={{ background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 16, padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#6B6660", marginBottom: 8 }}>No hay nada cargado para este día.</div>
          <Link href={`/agenda?week=${date}`} style={{ color: "#C96442", fontWeight: 600, textDecoration: "none" }}>
            Cargar bloques en Agenda semanal →
          </Link>
        </div>
      ) : (
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"] }}>
          <div style={{ background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 16, padding: 14, minWidth: isMobile ? 520 : "auto" }}>
            {/* Header row */}
            <div style={{ display: "flex", gap: 8, padding: "2px 2px 12px", borderBottom: "1px solid #EFEAE0", marginBottom: 10 }}>
              <div style={{ width: 64, flexShrink: 0, fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "#A39C8F", paddingTop: 2 }}>Hora</div>
              {!headerCols && <div style={{ width: 132, flexShrink: 0, fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "#A39C8F", paddingTop: 2 }}>Disponibilidad</div>}
              <div style={{ flex: 1, display: "flex", gap: 8 }}>
                {visibleCourts.map((c) => (
                  <div key={c.id} style={{ flex: 1, paddingLeft: 2, fontSize: 13.5, fontWeight: 700, color: "#221F1B" }}>{c.name}</div>
                ))}
              </div>
            </div>

            {edgeBefore && <NowLine time={nowHHMM!} isMobile={isMobile} />}
            {segments.map((row, idx) => {
              const past = isToday && nowHHMM !== null && row.end <= nowHHMM;
              const isCurrent = idx === currentIdx;
              const frac = isCurrent && nowMin !== null
                ? (nowMin - toMin(row.start)) / Math.max(1, toMin(row.end) - toMin(row.start))
                : 0;
              const sem = SEMAFORO[row.level];
              const semText = row.level === "green" ? "Todas libres" : row.level === "red" ? "Completo" : `${row.free}/${row.total} libres`;
              const visibleCells = courtFilter === "all" ? row.cells : row.cells.filter((c) => c.court.id === courtFilter);
              const showMerged = row.merged && courtFilter === "all";

              return (
                <div key={row.start}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8, opacity: past ? 0.45 : 1, position: isCurrent ? "relative" : "static" }}>
                    {isCurrent && <NowOverlay frac={frac} time={nowHHMM!} isMobile={isMobile} />}
                    {/* Hora */}
                    <div style={{ width: 64, flexShrink: 0, textAlign: "right", paddingRight: 4, paddingTop: 8 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#221F1B" }}>{row.start}</div>
                      <div style={{ fontSize: 11, color: "#A39C8F" }}>{row.end}</div>
                    </div>
                    {/* Disponibilidad */}
                    {!headerCols && (
                      <div style={{ width: 132, flexShrink: 0, display: "flex", flexDirection: "column", gap: 5, justifyContent: "center", background: sem.bg, borderRadius: 10, padding: "9px 11px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: sem.dot }} />
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: sem.fg }}>{semText}</span>
                        </div>
                        {row.eventLabel && <span style={{ fontSize: 11, fontWeight: 700, color: "#B0572C" }}>{row.eventLabel}</span>}
                      </div>
                    )}
                    {/* Celdas */}
                    {showMerged ? (
                      <MergedBand block={row.merged!} start={row.start} end={row.end} courtCount={courts.length} onClick={() => setDetail(row.merged!)} />
                    ) : (
                      <div style={{ flex: 1, display: "flex", gap: 8 }}>
                        {visibleCells.map((cell) => {
                          const sk = cell.block ? statusOfBlock(cell.block) : "libre";
                          const st = STATUS[sk];
                          return (
                            <div
                              key={cell.court.id}
                              onClick={() => cell.block && setDetail(cell.block)}
                              style={{
                                flex: 1, minWidth: 0, cursor: cell.block ? "pointer" : "default", background: st.bg,
                                border: `1px ${sk === "pendiente" ? "dashed" : "solid"} ${st.bd}`, borderRadius: 10, padding: "10px",
                                minHeight: isMobile ? 58 : 72, display: "flex", flexDirection: "column", gap: 4, justifyContent: "center",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ width: 7, height: 7, borderRadius: "50%", background: st.dot, flexShrink: 0 }} />
                                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: st.fg, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {blockDisplayLabel(cell.block, st.label)}
                                </span>
                              </div>
                              {cell.block?.label && (
                                <div style={{ fontSize: isMobile ? 12.5 : 14, fontWeight: 600, color: "#221F1B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cell.block.label}</div>
                              )}
                              <div style={{ fontSize: 11.5, color: "#8B857A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {cell.block ? (cell.block.notes ?? st.label) : "Disponible"}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {edgeAfter && <NowLine time={nowHHMM!} isMobile={isMobile} />}
          </div>
        </div>
      )}

      {/* Detalle */}
      {detail && (() => {
        const st = STATUS[statusOfBlock(detail)];
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
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ padding: "4px 10px", borderRadius: 999, background: st.bg, color: st.fg, fontWeight: 700, fontSize: 12.5 }}>
                  {blockDisplayLabel(detail, bookingPanelLabel(detail.type, detail.status))}
                </span>
                {detail.label && <span style={{ fontSize: 15, fontWeight: 700, color: "#221F1B" }}>{detail.label}</span>}
              </div>
              <div style={{ fontSize: 14, color: "#54504A" }}>{courtName} · {detail.startTime} – {detail.endTime}</div>
              {detail.customerPhone && (
                <div style={{ fontSize: 13.5, color: "#54504A", marginTop: 8 }}>
                  Teléfono: <span style={{ fontWeight: 700, color: "#221F1B" }}>{detail.customerPhone}</span>
                </div>
              )}
              {detail.notes && <div style={{ fontSize: 13.5, color: "#6B6660", marginTop: 8 }}>{detail.notes}</div>}
              <Link href={`/agenda?week=${date}`} style={{
                display: "inline-block", marginTop: 16, color: "#C96442", fontWeight: 600, fontSize: 13.5, textDecoration: "none",
              }}>
                Editar en Agenda semanal →
              </Link>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function MergedBand({ block, start, end, courtCount, onClick }: { block: Block; start: string; end: string; courtCount: number; onClick: () => void }) {
  const sk = statusOfBlock(block);
  const st = STATUS[sk];
  const hatched = sk === "clase";
  const title = sk === "pendiente"
    ? st.label
    : sk === "simple"
      ? blockDisplayLabel(block, st.label)
      : block.label ?? st.label;
  const detail = [block.label, block.notes].filter(Boolean).join(" · ");
  return (
    <div onClick={onClick} style={{
      flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 2,
      padding: "12px 16px", borderRadius: 10, cursor: "pointer",
      color: st.fg, border: `1px ${sk === "pendiente" ? "dashed" : "solid"} ${st.bd}`,
      background: hatched
        ? "repeating-linear-gradient(45deg,#EAF0F8,#EAF0F8 11px,#E1E9F6 11px,#E1E9F6 22px)"
        : st.bg,
    }}>
      <span style={{ fontSize: 13.5, fontWeight: 700 }}>{title}</span>
      <span style={{ fontSize: 12, opacity: 0.85 }}>
        {detail ? `${detail} · ` : ""}{start} – {end} · las {courtCount} canchas
      </span>
    </div>
  );
}

// Línea de "ahora" superpuesta DENTRO de la franja actual, a la altura
// proporcional al avance de la hora dentro de esa franja.
function NowOverlay({ frac, time, isMobile }: { frac: number; time: string; isMobile: boolean }) {
  return (
    <div style={{
      position: "absolute", left: 0, right: 0, top: `${Math.min(100, Math.max(0, frac * 100))}%`,
      transform: "translateY(-1px)", display: "flex", gap: 8, alignItems: "center",
      pointerEvents: "none", zIndex: 5,
    }}>
      <div style={{ width: 64, flexShrink: 0, textAlign: "right", paddingRight: 4 }}>
        <span style={{ background: "#C96442", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999 }}>{time}</span>
      </div>
      {!isMobile && <div style={{ width: 132, flexShrink: 0 }} />}
      <div style={{ flex: 1, borderTop: "2px solid #C96442" }} />
    </div>
  );
}

function NowLine({ time, isMobile }: { time: string; isMobile: boolean }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "0 0 8px" }}>
      <div style={{ width: 64, flexShrink: 0, textAlign: "right", paddingRight: 4 }}>
        <span style={{ background: "#C96442", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999 }}>{time}</span>
      </div>
      {!isMobile && <div style={{ width: 132, flexShrink: 0 }} />}
      <div style={{ flex: 1, borderTop: "2px solid #C96442" }} />
    </div>
  );
}

const navArrow: React.CSSProperties = {
  width: 34, height: 34, background: "#fff", border: "1px solid #E0DACE", borderRadius: 9, cursor: "pointer",
  color: "#54504A", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit",
};
