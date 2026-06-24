"use client";

import { useState } from "react";

interface SlotCell {
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

interface DrawerProps {
  slot: { start: string; end: string; cell: SlotCell; date: string } | null;
  onClose: () => void;
  onSuccess?: () => void;
}

const STATUS_STYLES = {
  libre:   { bg: "#E9F3EA", bd: "#CFE6D2", fg: "#2F7D4E", dot: "#3E9B63", label: "Libre" },
  simple:  { bg: "#FFFFFF", bd: "#E7E1D6", fg: "#7A746A", dot: "#B8B0A2", label: "Reservado" },
  clase:   { bg: "#EAF0F8", bd: "#D3DEF0", fg: "#3D5C93", dot: "#5B7FBE", label: "Clase" },
  fijo:    { bg: "#F1EAF7", bd: "#E2D4EF", fg: "#6B4E9E", dot: "#8A6BC4", label: "Turno fijo" },
  evento:  { bg: "#FBEBE2", bd: "#F2D6C5", fg: "#B0572C", dot: "#C96442", label: "Americano" },
  bloqueo: { bg: "#F3E7E2", bd: "#EDD0C5", fg: "#9A5E4C", dot: "#C2887A", label: "Bloqueado" },
};

type View = "detail" | "reservar" | "bloquear" | "cancelar";

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

function Btn({ label, primary, danger, onClick, loading }: { label: string; primary?: boolean; danger?: boolean; onClick: () => void; loading?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        width: "100%", textAlign: "left",
        background: primary ? "#C96442" : danger ? "#FCEEE9" : "#fff",
        color: primary ? "#fff" : danger ? "#B23A28" : "#221F1B",
        border: `1px solid ${primary ? "#C96442" : danger ? "#F1D3CB" : "#E0DACE"}`,
        borderRadius: 11, padding: "13px 15px",
        fontSize: 14, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
        fontFamily: "inherit", opacity: loading ? 0.6 : 1,
      }}
    >
      {loading ? "Cargando…" : label}
    </button>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: "#6B6660", letterSpacing: ".04em" }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          padding: "10px 12px", borderRadius: 9, border: "1px solid #E0DACE",
          fontSize: 14, fontFamily: "inherit", background: "#FCFBF8", color: "#221F1B",
          outline: "none",
        }}
      />
    </div>
  );
}

export function SlotDrawer({ slot, onClose, onSuccess }: DrawerProps) {
  const [view, setView] = useState<View>("detail");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Reservar form
  const [rName, setRName] = useState("");
  const [rPhone, setRPhone] = useState("");
  const [rPrice, setRPrice] = useState("");
  const [rNotes, setRNotes] = useState("");
  const [rType, setRType] = useState<"simple" | "fijo">("simple");

  // Bloquear form
  const [bNotes, setBNotes] = useState("");

  function reset() {
    setView("detail");
    setError("");
    setRName(""); setRPhone(""); setRPrice(""); setRNotes(""); setRType("simple");
    setBNotes("");
  }

  function handleClose() { reset(); onClose(); }

  async function doReservar() {
    if (!slot) return;
    if (!rName.trim() || !rPhone.trim()) { setError("Nombre y teléfono son requeridos"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courtId: slot.cell.courtId,
          date: slot.date,
          startTime: slot.start,
          endTime: slot.end,
          type: rType,
          status: "confirmado",
          customerName: rName.trim(),
          customerPhone: rPhone.trim(),
          price: rPrice ? parseInt(rPrice) : null,
          paymentStatus: rPrice ? "impago" : null,
          notes: rNotes.trim() || null,
        }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "Error al guardar"); return; }
      reset(); onSuccess?.(); onClose();
    } catch { setError("Error de conexión"); }
    finally { setLoading(false); }
  }

  async function doBloquear() {
    if (!slot) return;
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courtId: slot.cell.courtId,
          date: slot.date,
          startTime: slot.start,
          endTime: slot.end,
          type: "bloqueo",
          status: "confirmado",
          notes: bNotes.trim() || "Bloqueado",
        }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "Error al guardar"); return; }
      reset(); onSuccess?.(); onClose();
    } catch { setError("Error de conexión"); }
    finally { setLoading(false); }
  }

  async function doCancelar() {
    if (!slot?.cell.bookingId) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/bookings/${slot.cell.bookingId}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "Error al cancelar"); return; }
      reset(); onSuccess?.(); onClose();
    } catch { setError("Error de conexión"); }
    finally { setLoading(false); }
  }

  if (!slot) return null;

  const { start, end, cell, date } = slot;
  const st = STATUS_STYLES[cell.status] ?? STATUS_STYLES.libre;
  const hasClient = !!cell.customer || !!cell.professor;
  const clientName = cell.customer?.name ?? cell.professor?.name ?? "";
  const clientPhone = cell.customer?.phone ?? "";
  const initial = clientName.trim().charAt(0).toUpperCase();

  return (
    <>
      <div onClick={handleClose} style={{ position: "fixed", inset: 0, background: "rgba(34,31,27,.18)", zIndex: 30 }} />
      <div style={{
        position: "fixed", top: 0, right: 0, height: "100vh", width: 392,
        maxWidth: "92vw", background: "#FCFBF8", borderLeft: "1px solid #E7E1D6",
        boxShadow: "-14px 0 44px -22px rgba(0,0,0,.4)", zIndex: 31,
        display: "flex", flexDirection: "column"
      }}>
        {/* Header */}
        <div style={{ padding: "22px 22px 18px", borderBottom: "1px solid #EFEAE0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            {view !== "detail" && (
              <button onClick={() => { setView("detail"); setError(""); }}
                style={{ border: "none", background: "none", color: "#A39C8F", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0, marginBottom: 4, fontFamily: "inherit" }}>
                ← Volver
              </button>
            )}
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#A39C8F" }}>
              {view === "detail" ? "Turno seleccionado" : view === "reservar" ? "Nueva reserva" : view === "bloquear" ? "Bloquear horario" : "Cancelar turno"}
            </div>
            <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 24, lineHeight: 1.15, marginTop: 3, color: "#221F1B" }}>
              {start} – {end}
            </div>
            <div style={{ fontSize: 14, color: "#6B6660" }}>{cell.courtName} · {formatDate(date)}</div>
          </div>
          <button onClick={handleClose} style={{
            width: 32, height: 32, border: "1px solid #E0DACE", background: "#fff",
            borderRadius: 9, cursor: "pointer", color: "#6B6660", fontSize: 16,
            display: "flex", alignItems: "center", justifyContent: "center"
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>

          {error && (
            <div style={{ background: "#FCEEE9", border: "1px solid #F1D3CB", borderRadius: 10, padding: "10px 14px", fontSize: 13.5, color: "#B23A28" }}>
              {error}
            </div>
          )}

          {/* DETAIL VIEW */}
          {view === "detail" && (
            <>
              <div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: st.bg, border: `1px solid ${st.bd}`, borderRadius: 999, padding: "6px 13px" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: st.dot, display: "inline-block" }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: st.fg }}>{st.label}</span>
                </div>
                {cell.sub && <div style={{ fontSize: 13.5, color: "#6B6660", marginTop: 8 }}>{cell.sub}</div>}
              </div>

              {hasClient && (
                <div style={{ background: "#fff", border: "1px solid #E7E1D6", borderRadius: 12, padding: 15 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 42, height: 42, borderRadius: "50%", background: "#EDE7DB", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#6B6660", fontSize: 16 }}>
                      {initial}
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#221F1B" }}>{clientName}</div>
                      {clientPhone && <div style={{ fontSize: 13, color: "#6B6660" }}>{clientPhone}</div>}
                    </div>
                  </div>
                </div>
              )}

              {cell.event && (
                <div style={{ background: "#FBEBE2", border: "1px solid #F2D6C5", borderRadius: 12, padding: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#B0572C" }}>{cell.event.name}</div>
                  <div style={{ fontSize: 13, color: "#9A5E4C", marginTop: 4 }}>
                    {cell.event.registeredCount}/{cell.event.capacity} inscriptos
                    {cell.event.category ? ` · ${cell.event.category}` : ""}
                  </div>
                </div>
              )}

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#A39C8F", marginBottom: 10 }}>Acciones</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {cell.status === "libre" && (
                    <>
                      <Btn label="Reservar turno" primary onClick={() => setView("reservar")} />
                      <Btn label="Bloquear horario" onClick={() => setView("bloquear")} />
                    </>
                  )}
                  {(cell.status === "simple" || cell.status === "fijo") && (
                    <>
                      <Btn label="Cancelar y avisar al cliente" danger onClick={() => setView("cancelar")} />
                    </>
                  )}
                  {cell.status === "bloqueo" && cell.bookingId && (
                    <Btn label="Liberar horario" danger onClick={() => setView("cancelar")} />
                  )}
                  {cell.status === "clase" && cell.bookingId && (
                    <Btn label="Liberar horario" danger onClick={() => setView("cancelar")} />
                  )}
                  {cell.status === "evento" && cell.bookingId && (
                    <Btn label="Cancelar evento" danger onClick={() => setView("cancelar")} />
                  )}
                </div>
              </div>

              <div style={{ display: "flex", gap: 9, alignItems: "flex-start", background: "#F4F1EA", borderRadius: 11, padding: "12px 14px" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#3E9B63", marginTop: 5, flexShrink: 0, display: "inline-block" }} />
                <div style={{ fontSize: 12.5, color: "#6B6660", lineHeight: 1.45 }}>
                  Al dar de baja un turno, el cliente recibe el aviso automáticamente por WhatsApp y mail.
                </div>
              </div>
            </>
          )}

          {/* RESERVAR VIEW */}
          {view === "reservar" && (
            <>
              <div style={{ display: "flex", gap: 8 }}>
                {(["simple", "fijo"] as const).map(t => (
                  <button key={t} onClick={() => setRType(t)} style={{
                    flex: 1, padding: "9px 0", borderRadius: 9, border: `1px solid ${rType === t ? "#C96442" : "#E0DACE"}`,
                    background: rType === t ? "#C96442" : "#fff", color: rType === t ? "#fff" : "#54504A",
                    fontWeight: 600, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit"
                  }}>
                    {t === "simple" ? "Turno simple" : "Turno fijo"}
                  </button>
                ))}
              </div>

              <Field label="Nombre del cliente *" value={rName} onChange={setRName} placeholder="Ej. Juan Pérez" />
              <Field label="Teléfono *" value={rPhone} onChange={setRPhone} placeholder="+54 9 11 1234-5678" type="tel" />
              <Field label="Precio (ARS)" value={rPrice} onChange={setRPrice} placeholder="Ej. 15000" type="number" />
              <Field label="Notas" value={rNotes} onChange={setRNotes} placeholder="Opcional" />

              <Btn label="Confirmar reserva" primary onClick={doReservar} loading={loading} />
            </>
          )}

          {/* BLOQUEAR VIEW */}
          {view === "bloquear" && (
            <>
              <div style={{ fontSize: 14, color: "#6B6660" }}>Este horario quedará bloqueado y no aparecerá como disponible.</div>
              <Field label="Motivo del bloqueo" value={bNotes} onChange={setBNotes} placeholder="Ej. Mantenimiento, reservado para evento…" />
              <Btn label="Bloquear horario" primary onClick={doBloquear} loading={loading} />
            </>
          )}

          {/* CANCELAR VIEW */}
          {view === "cancelar" && (
            <>
              <div style={{ background: "#FCEEE9", border: "1px solid #F1D3CB", borderRadius: 12, padding: "14px 16px" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#B23A28", marginBottom: 4 }}>
                  {cell.status === "bloqueo" ? "¿Liberar este horario?" : "¿Cancelar este turno?"}
                </div>
                <div style={{ fontSize: 13, color: "#9A5E4C" }}>
                  {cell.status === "bloqueo"
                    ? "El horario volverá a estar disponible para reservas."
                    : "Esta acción no se puede deshacer. El cliente recibirá un aviso."}
                </div>
              </div>
              {hasClient && (
                <div style={{ background: "#fff", border: "1px solid #E7E1D6", borderRadius: 11, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#EDE7DB", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#6B6660", fontSize: 14 }}>
                    {initial}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#221F1B" }}>{clientName}</div>
                    {clientPhone && <div style={{ fontSize: 12, color: "#6B6660" }}>{clientPhone}</div>}
                  </div>
                </div>
              )}
              <Btn label={cell.status === "bloqueo" ? "Sí, liberar horario" : "Sí, cancelar turno"} danger onClick={doCancelar} loading={loading} />
              <Btn label="Volver" onClick={() => setView("detail")} />
            </>
          )}
        </div>
      </div>
    </>
  );
}
