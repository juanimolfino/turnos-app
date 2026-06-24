"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SlotDrawer } from "./slot-drawer";

interface AgendaCell {
  courtId: string;
  courtName: string;
  status: "libre" | "simple" | "clase" | "fijo" | "evento" | "bloqueo";
  bookingId?: string;
  who?: string;
  sub?: string;
  tel?: string;
  customer?: { name: string; phone: string | null } | null;
  professor?: { name: string } | null;
  event?: { name: string; capacity: number; registeredCount: number; category: string | null } | null;
}

interface AgendaSlot {
  start: string;
  end: string;
  cells: AgendaCell[];
  summary: { free: number; total: number; level: "green" | "amber" | "red"; eventLabel?: string };
}

interface Court { id: string; name: string; surface: string | null }

interface AgendaGridProps {
  courts: Court[];
  slots: AgendaSlot[];
  hasMorningClasses: boolean;
  date: string;
  clubName: string;
}

const STATUS_STYLES = {
  libre:   { bg: "#E9F3EA", bd: "#CFE6D2", fg: "#2F7D4E", dot: "#3E9B63", label: "Libre" },
  simple:  { bg: "#FFFFFF", bd: "#E7E1D6", fg: "#7A746A", dot: "#B8B0A2", label: "Reservado" },
  clase:   { bg: "#EAF0F8", bd: "#D3DEF0", fg: "#3D5C93", dot: "#5B7FBE", label: "Clase" },
  fijo:    { bg: "#F1EAF7", bd: "#E2D4EF", fg: "#6B4E9E", dot: "#8A6BC4", label: "Turno fijo" },
  evento:  { bg: "#FBEBE2", bd: "#F2D6C5", fg: "#B0572C", dot: "#C96442", label: "Americano" },
  bloqueo: { bg: "#F3E7E2", bd: "#EDD0C5", fg: "#9A5E4C", dot: "#C2887A", label: "Bloqueado" },
};

const SEMAFORO = {
  green: { bg: "#E9F3EA", fg: "#2F7D4E", dot: "#3E9B63" },
  amber: { bg: "#F8EFD7", fg: "#90701E", dot: "#D9A93B" },
  red:   { bg: "#F3E7E2", fg: "#9A5E4C", dot: "#C2887A" },
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${days[d.getDay()]} ${d.getDate()} de ${months[d.getMonth()]}`;
}

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function today() { return new Date().toISOString().slice(0, 10); }

export function AgendaGrid({ courts, slots, hasMorningClasses, date, clubName }: AgendaGridProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [courtFilter, setCourtFilter] = useState<string>("all");
  const [selectedSlot, setSelectedSlot] = useState<{ start: string; end: string; cell: AgendaCell; date: string } | null>(null);

  function refresh() { router.refresh(); }

  function navigate(newDate: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", newDate);
    router.push(`/dashboard?${params.toString()}`);
  }

  const visibleCourts = courtFilter === "all" ? courts : courts.filter(c => c.id === courtFilter);

  return (
    <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => navigate(today())} style={{
            background: "#fff", border: "1px solid #E0DACE", borderRadius: 10,
            padding: "8px 14px", fontWeight: 600, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit"
          }}>Hoy</button>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => navigate(addDays(date, -1))} style={{ width: 34, height: 34, background: "#fff", border: "1px solid #E0DACE", borderRadius: 9, cursor: "pointer", color: "#54504A", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>‹</button>
            <button onClick={() => navigate(addDays(date, 1))} style={{ width: 34, height: 34, background: "#fff", border: "1px solid #E0DACE", borderRadius: 9, cursor: "pointer", color: "#54504A", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>›</button>
          </div>
          <div>
            <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 25, lineHeight: 1.1, color: "#221F1B" }}>
              {formatDate(date)}
            </div>
            <div style={{ fontSize: 13, color: "#928B7E" }}>{clubName} · {courts.length} canchas de pádel</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[{ id: "all", label: "Todas" }, ...courts.map(c => ({ id: c.id, label: c.name }))].map(({ id, label }) => {
              const active = courtFilter === id;
              return (
                <button key={id} onClick={() => setCourtFilter(id)} style={{
                  background: active ? "#C96442" : "#FFFFFF", color: active ? "#fff" : "#54504A",
                  border: `1px solid ${active ? "#C96442" : "#E0DACE"}`,
                  borderRadius: 999, padding: "8px 14px", fontSize: 13, fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit"
                }}>{label}</button>
              );
            })}
          </div>
          <button
            onClick={() => {
              if (courts.length > 0 && slots.length > 0) {
                const firstFreeCell = slots.flatMap(s => s.cells.map(c => ({ ...s, cell: c }))).find(x => x.cell.status === "libre");
                if (firstFreeCell) {
                  setSelectedSlot({ start: firstFreeCell.start, end: firstFreeCell.end, cell: firstFreeCell.cell, date });
                }
              }
            }}
            style={{
              background: "#C96442", color: "#fff", border: "none", borderRadius: 10,
              padding: "9px 15px", fontWeight: 600, fontSize: 13.5, cursor: "pointer",
              whiteSpace: "nowrap", fontFamily: "inherit"
            }}>+ Nuevo turno</button>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 12.5, color: "#6B6660" }}>
        {[
          { dot: "#3E9B63", label: "Libre" },
          { dot: "#B8B0A2", label: "Reservado" },
          { dot: "#5B7FBE", label: "Clase" },
          { dot: "#8A6BC4", label: "Turno fijo" },
          { dot: "#C96442", label: "Americano / torneo" },
        ].map(({ dot, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: dot, display: "inline-block" }} />
            {label}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div style={{ background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 16, padding: 14 }}>
        {/* Header row */}
        <div style={{ display: "flex", gap: 8, padding: "2px 2px 12px", borderBottom: "1px solid #EFEAE0", marginBottom: 10 }}>
          <div style={{ width: 74, flexShrink: 0, fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "#A39C8F", paddingTop: 2 }}>Hora</div>
          <div style={{ width: 132, flexShrink: 0, fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "#A39C8F", paddingTop: 2 }}>Disponibilidad</div>
          <div style={{ flex: 1, display: "flex", gap: 8 }}>
            {visibleCourts.map(c => (
              <div key={c.id} style={{ flex: 1, paddingLeft: 2 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "#221F1B" }}>{c.name}</div>
                <div style={{ fontSize: 11, color: "#A39C8F", textTransform: "capitalize" }}>{c.surface ?? ""}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Morning band */}
        {hasMorningClasses && (
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <div style={{ width: 74, flexShrink: 0, textAlign: "right", paddingRight: 4, paddingTop: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#221F1B" }}>08:00</div>
              <div style={{ fontSize: 11, color: "#A39C8F" }}>16:00</div>
            </div>
            <div style={{ width: 132, flexShrink: 0, display: "flex", flexDirection: "column", gap: 4, justifyContent: "center", background: "#F3E7E2", borderRadius: 10, padding: "8px 11px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#C2887A", display: "inline-block" }} />
                <span style={{ fontSize: 12.5, fontWeight: 700, color: "#9A5E4C" }}>Completo</span>
              </div>
            </div>
            <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "12px 16px", borderRadius: 10, color: "#3D5C93", fontWeight: 600, fontSize: 13.5, background: "repeating-linear-gradient(45deg,#EAF0F8,#EAF0F8 11px,#E1E9F6 11px,#E1E9F6 22px)", border: "1px solid #D3DEF0" }}>
              Escuela de pádel · clases de 08 a 16 h · las {courts.length} canchas ocupadas
            </div>
          </div>
        )}

        {/* Evening slots */}
        {slots.map((row) => {
          const visibleCells = courtFilter === "all" ? row.cells : row.cells.filter(c => c.courtId === courtFilter);
          const sem = SEMAFORO[row.summary.level];
          const semText = row.summary.level === "green" ? "Todas libres" : row.summary.level === "red" ? "Completo" : `${row.summary.free}/${row.summary.total} libres`;

          return (
            <div key={row.start} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <div style={{ width: 74, flexShrink: 0, textAlign: "right", paddingRight: 4, paddingTop: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#221F1B" }}>{row.start}</div>
                <div style={{ fontSize: 11, color: "#A39C8F" }}>{row.end}</div>
              </div>
              <div style={{ width: 132, flexShrink: 0, display: "flex", flexDirection: "column", gap: 5, justifyContent: "center", background: sem.bg, borderRadius: 10, padding: "9px 11px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: sem.dot, display: "inline-block" }} />
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: sem.fg }}>{semText}</span>
                </div>
                {row.summary.eventLabel && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#B0572C" }}>{row.summary.eventLabel}</span>
                )}
              </div>
              <div style={{ flex: 1, display: "flex", gap: 8 }}>
                {visibleCells.map((cell) => {
                  const st = STATUS_STYLES[cell.status] ?? STATUS_STYLES.libre;
                  return (
                    <div key={cell.courtId} onClick={() => setSelectedSlot({ start: row.start, end: row.end, cell, date })}
                      style={{
                        flex: 1, minWidth: 0, cursor: "pointer", background: st.bg,
                        border: `1px solid ${st.bd}`, borderRadius: 10, padding: "10px 12px",
                        minHeight: 74, display: "flex", flexDirection: "column",
                        gap: 4, justifyContent: "center", transition: "transform .08s ease, box-shadow .12s ease"
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 14px -6px rgba(0,0,0,.2)"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; (e.currentTarget as HTMLDivElement).style.transform = "none"; }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: st.dot, display: "inline-block" }} />
                        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: st.fg }}>{st.label}</span>
                      </div>
                      {cell.who && (
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#221F1B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cell.who}</div>
                      )}
                      <div style={{ fontSize: 12, color: "#8B857A" }}>{cell.status === "libre" ? "Disponible" : (cell.sub ?? "")}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <SlotDrawer slot={selectedSlot} onClose={() => setSelectedSlot(null)} onSuccess={refresh} />
    </div>
  );
}
