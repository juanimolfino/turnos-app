"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, Settings2, X, Trash2, Pencil } from "lucide-react";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { bookingPanelLabel, bookingTypeLabel } from "@/lib/bookings/labels";

type BlockType = "simple" | "clase" | "fijo" | "americano" | "torneo" | "bloqueo";

interface Court { id: string; name: string; }
interface Block {
  id: string;
  courtId: string;
  date: string;
  startTime: string;
  endTime: string;
  type: string;
  status: string;
  blockGroupId: string | null;
  notes: string | null;
  label: string | null;
  customerPhone?: string | null;
}

interface Props {
  courts: Court[];
  blocks: Block[];
  weekStart: string; // lunes YYYY-MM-DD
  today: string;
}

// Las labels salen de lib/bookings/labels (fuente única). 'simple' = "Reservado".
const TYPE_META: Record<BlockType, { label: string; short: string; bg: string; bd: string; fg: string }> = {
  simple:    { label: bookingTypeLabel("simple"),    short: "Reservado", bg: "#FFFFFF", bd: "#E7E1D6", fg: "#7A746A" },
  clase:     { label: bookingTypeLabel("clase"),     short: "Clases",    bg: "#EAF0F8", bd: "#D3DEF0", fg: "#3D5C93" },
  fijo:      { label: bookingTypeLabel("fijo"),      short: "Fijo",      bg: "#F1EAF7", bd: "#E2D4EF", fg: "#6B4E9E" },
  americano: { label: bookingTypeLabel("americano"), short: "Americano", bg: "#FBEBE2", bd: "#F2D6C5", fg: "#B0572C" },
  torneo:    { label: bookingTypeLabel("torneo"),    short: "Torneo",    bg: "#F7EFD9", bd: "#EBDFBF", fg: "#8A6D1F" },
  bloqueo:   { label: bookingTypeLabel("bloqueo"),   short: "Cerrado",   bg: "#EFECE6", bd: "#DED8CC", fg: "#8A8377" },
};
const PENDING_PAYMENT_META = {
  label: "Pendiente de pago",
  short: "En espera",
  bg: "#FFF6E0",
  bd: "#D9A93B",
  fg: "#795C12",
};
// Mapea el tipo guardado (incluye el legacy "evento") a su metadata visual.
function metaFor(type: string) {
  if (type === "evento") return TYPE_META.americano;
  return TYPE_META[type as BlockType] ?? TYPE_META.bloqueo;
}
function metaForBlock(block: Block) {
  if (block.status === "pendiente") return PENDING_PAYMENT_META;
  return metaFor(block.type);
}
function blockGridTitle(block: Block, meta: { short: string }) {
  if (block.status === "pendiente") return meta.short;
  return block.label ?? meta.short;
}
const TYPES: BlockType[] = ["simple", "clase", "fijo", "americano", "torneo", "bloqueo"];
const DAY_NAMES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// ── helpers de tiempo/fecha ────────────────────────────────────────────────
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
function dayNum(dateStr: string) { return Number(dateStr.slice(8, 10)); }
function fmtRange(start: string, end: string) {
  const f = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("es-AR", { day: "numeric", month: "short" });
  return `${f(start)} – ${f(end)}`;
}

const TIME_OPTIONS: string[] = [];
for (let m = 6 * 60; m <= 24 * 60; m += 30) TIME_OPTIONS.push(toTime(m));

export function AgendaWeekClient({ courts, blocks, weekStart, today }: Props) {
  const router = useRouter();
  const isMobile = useIsMobile();

  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekEnd = weekDates[6];

  const [selectedCourt, setSelectedCourt] = useState(courts[0]?.id ?? "");
  const [courtsModal, setCourtsModal] = useState(false);

  // editor de bloque
  const [newOpen, setNewOpen] = useState(false);
  const [nType, setNType] = useState<BlockType>("clase");
  const [nCourts, setNCourts] = useState<string[]>([]);
  const [nDays, setNDays] = useState<string[]>([]);
  const [nStart, setNStart] = useState("08:00");
  const [nEnd, setNEnd] = useState("16:00");
  const [nNotes, setNNotes] = useState("");
  const [nRepeat, setNRepeat] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [viewBlock, setViewBlock] = useState<Block | null>(null);

  // rango horario de la grilla
  const { gridStart, gridEnd } = useMemo(() => {
    let minM = toMin("08:00");
    let maxM = toMin("23:30");
    for (const b of blocks) {
      minM = Math.min(minM, toMin(b.startTime));
      maxM = Math.max(maxM, toMin(b.endTime));
    }
    minM = Math.floor(minM / 30) * 30;
    maxM = Math.ceil(maxM / 30) * 30;
    return { gridStart: minM, gridEnd: maxM };
  }, [blocks]);

  const slots = useMemo(() => {
    const arr: { start: string; end: string }[] = [];
    for (let m = gridStart; m < gridEnd; m += 30) arr.push({ start: toTime(m), end: toTime(m + 30) });
    return arr;
  }, [gridStart, gridEnd]);

  function goWeek(offset: number) {
    router.push(`/agenda?week=${addDays(weekStart, offset * 7)}`);
  }

  function closeEditor() {
    setNewOpen(false);
    setEditingId(null);
  }

  function openNew(prefill?: { date?: string; start?: string; courtId?: string }) {
    setErr("");
    setEditingId(null);
    setNType("clase");
    setNCourts(prefill?.courtId ? [prefill.courtId] : selectedCourt ? [selectedCourt] : []);
    setNDays(prefill?.date ? [prefill.date] : []);
    setNStart(prefill?.start ?? "08:00");
    setNEnd(prefill?.start ? toTime(Math.min(toMin(prefill.start) + 90, 24 * 60)) : "16:00");
    setNNotes("");
    setNRepeat(false);
    setNewOpen(true);
  }

  function openEdit(block: Block) {
    setErr("");
    setEditingId(block.id);
    const t = block.type === "evento" ? "americano" : block.type;
    setNType((TYPES.includes(t as BlockType) ? t : "bloqueo") as BlockType);
    setNCourts([block.courtId]);
    setNDays([block.date]);
    setNStart(block.startTime);
    setNEnd(block.endTime);
    setNNotes(block.notes ?? "");
    setNRepeat(false);
    setViewBlock(null);
    setNewOpen(true);
  }

  async function submitNew() {
    setErr("");
    if (!nCourts.length) { setErr("Elegí al menos una cancha."); return; }
    if (!nDays.length) { setErr("Elegí al menos un día."); return; }
    if (toMin(nEnd) <= toMin(nStart)) { setErr("La hora de fin debe ser mayor a la de inicio."); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/agenda/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: nType,
          courtIds: nCourts,
          dates: nDays,
          startTime: nStart,
          endTime: nEnd,
          notes: nNotes.trim() || null,
          repeatMonth: nRepeat,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? "No se pudo guardar el bloque.");
        return;
      }
      // Al editar, borramos el bloque original (por si cambió a un horario que no
      // se solapa con el nuevo y la inserción no lo reemplazó).
      if (editingId) {
        try {
          await fetch("/api/agenda/block", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bookingId: editingId }),
          });
        } catch { /* no-op */ }
      }
      closeEditor();
      router.refresh();
    } catch {
      setErr("Error de conexión.");
    } finally {
      setSaving(false);
    }
  }

  async function removeBlock(scope: "one" | "series") {
    if (!viewBlock) return;
    setSaving(true);
    try {
      const body = scope === "series" && viewBlock.blockGroupId
        ? { blockGroupId: viewBlock.blockGroupId }
        : { bookingId: viewBlock.id };
      await fetch("/api/agenda/block", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setViewBlock(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  // ── sin canchas: setup inicial ──────────────────────────────────────────
  if (courts.length === 0) {
    return (
      <>
        <div style={{ padding: isMobile ? "16px 14px 40px" : "28px 32px", maxWidth: 560 }}>
          <div style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: isMobile ? 26 : 30, color: "#221F1B" }}>
            Configurá tu agenda
          </div>
          <p style={{ fontSize: 14.5, color: "#6B6660", margin: "8px 0 22px", lineHeight: 1.5 }}>
            Primero, decinos cuántas canchas tenés. Después vas a poder marcar clases, turnos fijos,
            americanos y bloqueos en la grilla semanal.
          </p>
          <CourtCountCard onDone={() => router.refresh()} initial={3} />
        </div>
      </>
    );
  }

  const courtBlocks = blocks.filter((b) => b.courtId === selectedCourt);

  return (
    <div style={{ padding: isMobile ? "12px 12px 40px" : "24px 28px 48px", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{
        display: "flex", flexDirection: isMobile ? "column" : "row",
        alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", gap: 12,
      }}>
        <div>
          <div style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: isMobile ? 24 : 28, color: "#221F1B" }}>
            Agenda semanal
          </div>
          <div style={{ fontSize: 13.5, color: "#6B6660", marginTop: 2 }}>
            Marcá clases, turnos fijos, americanos y bloqueos por cancha.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => setCourtsModal(true)} style={ghostBtn}>
            <Settings2 size={15} /> Canchas
          </button>
          <button onClick={() => openNew()} style={primaryBtn}>
            <Plus size={16} /> Nuevo bloque
          </button>
        </div>
      </div>

      {/* Week navigator */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <button onClick={() => goWeek(-1)} aria-label="Semana anterior" style={navBtn}><ChevronLeft size={18} /></button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#221F1B" }}>{fmtRange(weekStart, weekEnd)}</div>
          <button
            onClick={() => router.push(`/agenda?week=${today}`)}
            style={{ background: "none", border: "none", color: "#C96442", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 2 }}
          >
            Ir a hoy
          </button>
        </div>
        <button onClick={() => goWeek(1)} aria-label="Semana siguiente" style={navBtn}><ChevronRight size={18} /></button>
      </div>

      {/* Court tabs */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
        {courts.map((c) => {
          const active = c.id === selectedCourt;
          return (
            <button key={c.id} onClick={() => setSelectedCourt(c.id)} style={{
              flexShrink: 0, padding: "8px 16px", borderRadius: 999, cursor: "pointer",
              border: `1px solid ${active ? "#C96442" : "#E0DACE"}`,
              background: active ? "#C96442" : "#FCFBF8",
              color: active ? "#fff" : "#6B6660", fontWeight: 600, fontSize: 13.5, fontFamily: "inherit",
            }}>
              {c.name}
            </button>
          );
        })}
      </div>

      {/* Grid */}
      <div style={{ overflowX: "auto", border: "1px solid #E7E1D6", borderRadius: 14, background: "#FCFBF8" }}>
        <div style={{ minWidth: isMobile ? 620 : "auto" }}>
          {/* Header row: días */}
          <div style={{ display: "grid", gridTemplateColumns: `56px repeat(7, 1fr)`, borderBottom: "1px solid #EFEAE0" }}>
            <div />
            {weekDates.map((d, i) => {
              const isToday = d === today;
              return (
                <div key={d} style={{
                  textAlign: "center", padding: "8px 4px", borderLeft: "1px solid #EFEAE0",
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".04em", color: isToday ? "#C96442" : "#928B7E", textTransform: "uppercase" }}>
                    {DAY_NAMES[i]}
                  </div>
                  <div style={{
                    fontSize: 14, fontWeight: 700, marginTop: 1,
                    color: isToday ? "#C96442" : "#221F1B",
                  }}>
                    {dayNum(d)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Rows: horarios */}
          {slots.map((slot) => (
            <div key={slot.start} style={{ display: "grid", gridTemplateColumns: `56px repeat(7, 1fr)`, minHeight: 34 }}>
              <div style={{ fontSize: 11, color: "#A39C8F", textAlign: "right", paddingRight: 6, paddingTop: 3, fontWeight: 600 }}>
                {slot.start.endsWith(":00") ? slot.start : ""}
              </div>
              {weekDates.map((date) => {
                const block = courtBlocks.find((b) =>
                  b.date === date && b.startTime < slot.end && b.endTime > slot.start
                );
                if (!block) {
                  return (
                    <button
                      key={date}
                      onClick={() => openNew({ date, start: slot.start, courtId: selectedCourt })}
                      title="Agregar bloque"
                      style={{
                        borderLeft: "1px solid #EFEAE0", borderTop: "1px solid #F4F1EA",
                        background: "transparent", cursor: "pointer", padding: 0, minHeight: 34,
                      }}
                    />
                  );
                }
                const meta = metaForBlock(block);
                const isFirst = block.startTime >= slot.start && block.startTime < slot.end
                  || (slot.start === slots[0].start && toMin(block.startTime) < gridStart);
                return (
                  <button
                    key={date}
                    onClick={() => setViewBlock(block)}
                    style={{
                      borderLeft: "1px solid #EFEAE0",
                      background: meta.bg,
                      borderTop: isFirst ? `2px ${block.status === "pendiente" ? "dashed" : "solid"} ${meta.bd}` : "none",
                      cursor: "pointer", padding: isFirst ? "3px 5px" : 0, minHeight: 34,
                      textAlign: "left", overflow: "hidden",
                    }}
                  >
                    {isFirst && (
                      <span style={{ display: "block", fontSize: 11, fontWeight: 700, color: meta.fg, lineHeight: 1.15 }}>
                        {blockGridTitle(block, meta)}
                      </span>
                    )}
                    {isFirst && (
                      <span style={{ display: "block", fontSize: 10, color: meta.fg, opacity: 0.8 }}>
                        {block.startTime}–{block.endTime}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Leyenda */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: PENDING_PAYMENT_META.bg, border: `1px dashed ${PENDING_PAYMENT_META.bd}` }} />
          <span style={{ fontSize: 12, color: "#6B6660" }}>{PENDING_PAYMENT_META.label}</span>
        </div>
        {TYPES.map((t) => (
          <div key={t} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: TYPE_META[t].bg, border: `1px solid ${TYPE_META[t].bd}` }} />
            <span style={{ fontSize: 12, color: "#6B6660" }}>{TYPE_META[t].label}</span>
          </div>
        ))}
      </div>

      {/* ── Modal: nuevo bloque ── */}
      {newOpen && (
        <Modal onClose={closeEditor} title={editingId ? "Editar bloque" : "Nuevo bloque"}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Tipo */}
            <Group label="Tipo de bloque">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {TYPES.map((t) => {
                  const active = nType === t;
                  const meta = TYPE_META[t];
                  return (
                    <button key={t} onClick={() => setNType(t)} style={{
                      padding: "8px 14px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                      border: `1px solid ${active ? meta.fg : "#E0DACE"}`,
                      background: active ? meta.bg : "#fff", color: active ? meta.fg : "#6B6660",
                    }}>{meta.label}</button>
                  );
                })}
              </div>
            </Group>

            {/* Canchas */}
            <Group label="Canchas">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Chip
                  active={nCourts.length === courts.length}
                  onClick={() => setNCourts(nCourts.length === courts.length ? [] : courts.map((c) => c.id))}
                  label="Todas"
                />
                {courts.map((c) => (
                  <Chip
                    key={c.id}
                    active={nCourts.includes(c.id)}
                    onClick={() => setNCourts((prev) => prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id])}
                    label={c.name}
                  />
                ))}
              </div>
            </Group>

            {/* Días */}
            <Group label="Días de esta semana">
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {weekDates.map((d, i) => (
                  <Chip
                    key={d}
                    active={nDays.includes(d)}
                    onClick={() => setNDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d])}
                    label={`${DAY_NAMES[i]} ${dayNum(d)}`}
                  />
                ))}
              </div>
            </Group>

            {/* Horario */}
            <Group label="Horario">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <TimeSelect value={nStart} onChange={setNStart} />
                <span style={{ color: "#928B7E" }}>a</span>
                <TimeSelect value={nEnd} onChange={setNEnd} />
              </div>
            </Group>

            {/* Notas */}
            <Group label="Nota (opcional)">
              <input
                value={nNotes}
                onChange={(e) => setNNotes(e.target.value)}
                placeholder={
                  nType === "clase" ? "Ej: Profe Caro"
                  : nType === "fijo" ? "Ej: Grupo Martín"
                  : nType === "simple" ? "Ej: Turno suelto"
                  : nType === "torneo" ? "Ej: quién juega (o dejar vacío)"
                  : nType === "americano" ? "Ej: Americano mixto"
                  : "Ej: Mantenimiento"
                }
                style={inputStyle}
              />
            </Group>

            {/* Repetir */}
            <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
              <input type="checkbox" checked={nRepeat} onChange={(e) => setNRepeat(e.target.checked)} style={{ width: 17, height: 17, accentColor: "#C96442" }} />
              <span style={{ fontSize: 13.5, color: "#54504A" }}>Repetir todas las semanas hasta fin de mes</span>
            </label>

            {err && <div style={{ fontSize: 13, color: "#B0492E" }}>{err}</div>}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 2 }}>
              <button onClick={closeEditor} style={ghostBtn}>Cancelar</button>
              <button onClick={submitNew} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.7 : 1 }}>
                {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Guardar bloque"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Modal: ver/eliminar bloque ── */}
      {viewBlock && (() => {
        const meta = metaForBlock(viewBlock);
        const courtName = courts.find((c) => c.id === viewBlock.courtId)?.name ?? "Cancha";
        return (
          <Modal onClose={() => setViewBlock(null)} title="Bloque">
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ padding: "4px 10px", borderRadius: 999, background: meta.bg, color: meta.fg, fontWeight: 700, fontSize: 12.5 }}>
                  {bookingPanelLabel(viewBlock.type, viewBlock.status)}
                </span>
                {viewBlock.label && <span style={{ fontSize: 14, fontWeight: 600, color: "#221F1B" }}>{viewBlock.label}</span>}
              </div>
              <div style={{ fontSize: 14, color: "#54504A" }}>
                {courtName} · {new Date(viewBlock.date + "T12:00:00").toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
                <br />
                {viewBlock.startTime} – {viewBlock.endTime}
              </div>
              {viewBlock.customerPhone && (
                <div style={{ fontSize: 13.5, color: "#54504A" }}>
                  Teléfono: <span style={{ fontWeight: 700, color: "#221F1B" }}>{viewBlock.customerPhone}</span>
                </div>
              )}
              {viewBlock.notes && <div style={{ fontSize: 13.5, color: "#6B6660" }}>{viewBlock.notes}</div>}

              <div style={{ borderTop: "1px solid #EFEAE0", paddingTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                <button onClick={() => openEdit(viewBlock)} style={primaryBtn}>
                  <Pencil size={15} /> Editar este bloque
                </button>
                <button onClick={() => removeBlock("one")} disabled={saving} style={dangerBtn}>
                  <Trash2 size={15} /> {viewBlock.type === "simple"
                    ? "Cancelar esta reserva (solo esta cancha y día)"
                    : "Quitar este (solo esta cancha y día)"}
                </button>
                {viewBlock.blockGroupId && (
                  <button onClick={() => removeBlock("series")} disabled={saving} style={dangerBtnSolid}>
                    <Trash2 size={15} /> {viewBlock.type === "simple"
                      ? "Cancelar toda la serie (todas las canchas y semanas)"
                      : "Quitar toda la serie (todas las canchas y semanas)"}
                  </button>
                )}
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* ── Modal: gestionar canchas ── */}
      {courtsModal && (
        <Modal onClose={() => setCourtsModal(false)} title="Canchas">
          <CourtsManager courts={courts} onChanged={() => { router.refresh(); }} onClose={() => setCourtsModal(false)} />
        </Modal>
      )}
    </div>
  );
}

// ── subcomponentes ──────────────────────────────────────────────────────────
function CourtCountCard({ initial, onDone }: { initial: number; onDone: () => void }) {
  const [count, setCount] = useState(initial);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await fetch("/api/courts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count }),
      });
      onDone();
    } finally { setSaving(false); }
  }
  return (
    <div style={{ background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 16, padding: 22 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#6B6660", marginBottom: 12 }}>¿Cuántas canchas tenés?</div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <button onClick={() => setCount((c) => Math.max(0, c - 1))} style={stepBtn}>−</button>
        <span style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: 32, color: "#221F1B", minWidth: 40, textAlign: "center" }}>{count}</span>
        <button onClick={() => setCount((c) => Math.min(40, c + 1))} style={stepBtn}>+</button>
        <button onClick={save} disabled={saving || count < 1} style={{ ...primaryBtn, marginLeft: "auto", opacity: saving || count < 1 ? 0.6 : 1 }}>
          {saving ? "Creando…" : "Crear canchas"}
        </button>
      </div>
    </div>
  );
}

function CourtsManager({ courts, onChanged, onClose }: { courts: Court[]; onChanged: () => void; onClose: () => void }) {
  const [count, setCount] = useState(courts.length);
  const [names, setNames] = useState<Record<string, string>>(Object.fromEntries(courts.map((c) => [c.id, c.name])));
  const [saving, setSaving] = useState(false);

  async function saveCount() {
    setSaving(true);
    try {
      await fetch("/api/courts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count }),
      });
      onChanged();
      onClose();
    } finally { setSaving(false); }
  }
  async function saveName(courtId: string) {
    const name = names[courtId]?.trim();
    if (!name) return;
    await fetch("/api/courts", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courtId, name }),
    });
    onChanged();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Group label="Cantidad de canchas">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button onClick={() => setCount((c) => Math.max(1, c - 1))} style={stepBtn}>−</button>
          <span style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: 28, color: "#221F1B", minWidth: 36, textAlign: "center" }}>{count}</span>
          <button onClick={() => setCount((c) => Math.min(40, c + 1))} style={stepBtn}>+</button>
          <button onClick={saveCount} disabled={saving} style={{ ...primaryBtn, marginLeft: "auto", opacity: saving ? 0.6 : 1 }}>
            {saving ? "Guardando…" : "Aplicar"}
          </button>
        </div>
        <div style={{ fontSize: 12, color: "#928B7E", marginTop: 6 }}>
          Reducir la cantidad no borra el historial: solo oculta las canchas sobrantes.
        </div>
      </Group>

      <Group label="Nombres">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {courts.map((c) => (
            <input
              key={c.id}
              value={names[c.id] ?? ""}
              onChange={(e) => setNames((p) => ({ ...p, [c.id]: e.target.value }))}
              onBlur={() => saveName(c.id)}
              style={inputStyle}
            />
          ))}
        </div>
      </Group>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const isMobile = useIsMobile();
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.42)",
      display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center",
      padding: isMobile ? 0 : 20,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "#F8F6F0",
        borderRadius: isMobile ? "18px 18px 0 0" : 18,
        width: "100%", maxWidth: 560,
        maxHeight: isMobile ? "92vh" : "88vh", overflowY: "auto", padding: "18px 18px 28px",
        boxShadow: isMobile ? "0 -8px 30px -10px rgba(0,0,0,.25)" : "0 20px 50px -12px rgba(0,0,0,.35)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: 22, color: "#221F1B" }}>{title}</div>
          <button onClick={onClose} aria-label="Cerrar" style={{
            width: 34, height: 34, borderRadius: 9, border: "1px solid #E0DACE", background: "#fff",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#54504A",
          }}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#6B6660", letterSpacing: ".03em" }}>{label}</div>
      {children}
    </div>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} style={{
      padding: "7px 13px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit",
      border: `1px solid ${active ? "#C96442" : "#E0DACE"}`,
      background: active ? "#C96442" : "#fff", color: active ? "#fff" : "#6B6660",
    }}>{label}</button>
  );
}

function TimeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{
      padding: "9px 11px", borderRadius: 9, border: "1px solid #E0DACE", background: "#fff",
      fontSize: 14, color: "#221F1B", fontFamily: "inherit", outline: "none",
    }}>
      {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
    </select>
  );
}

const primaryBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, background: "#C96442", color: "#fff",
  border: "none", borderRadius: 10, padding: "9px 16px", fontWeight: 600, fontSize: 13.5,
  cursor: "pointer", fontFamily: "inherit", boxShadow: "0 2px 8px -2px rgba(201,100,66,.5)",
};
const ghostBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", color: "#6B6660",
  border: "1px solid #E0DACE", borderRadius: 10, padding: "9px 14px", fontWeight: 600, fontSize: 13.5,
  cursor: "pointer", fontFamily: "inherit",
};
const navBtn: React.CSSProperties = {
  width: 38, height: 38, borderRadius: 10, border: "1px solid #E0DACE", background: "#FCFBF8",
  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#54504A", flexShrink: 0,
};
const stepBtn: React.CSSProperties = {
  width: 38, height: 38, borderRadius: 10, border: "1px solid #E0DACE", background: "#fff",
  cursor: "pointer", fontSize: 20, color: "#54504A", fontFamily: "inherit",
};
const dangerBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center", background: "#fff",
  color: "#B0492E", border: "1px solid #F2D6C5", borderRadius: 10, padding: "10px 14px",
  fontWeight: 600, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit",
};
const dangerBtnSolid: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 8, justifyContent: "center", background: "#B0492E",
  color: "#fff", border: "none", borderRadius: 10, padding: "10px 14px",
  fontWeight: 600, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit",
};
const inputStyle: React.CSSProperties = {
  border: "1px solid #E0D9CC", background: "#fff", borderRadius: 10, padding: "10px 12px",
  fontSize: 14, color: "#221F1B", fontFamily: "inherit", outline: "none", width: "100%",
};
