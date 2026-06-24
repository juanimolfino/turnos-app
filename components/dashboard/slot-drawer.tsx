"use client";

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
}

const STATUS_STYLES = {
  libre:   { bg: "#E9F3EA", bd: "#CFE6D2", fg: "#2F7D4E", dot: "#3E9B63", label: "Libre" },
  simple:  { bg: "#FFFFFF", bd: "#E7E1D6", fg: "#7A746A", dot: "#B8B0A2", label: "Reservado" },
  clase:   { bg: "#EAF0F8", bd: "#D3DEF0", fg: "#3D5C93", dot: "#5B7FBE", label: "Clase" },
  fijo:    { bg: "#F1EAF7", bd: "#E2D4EF", fg: "#6B4E9E", dot: "#8A6BC4", label: "Turno fijo" },
  evento:  { bg: "#FBEBE2", bd: "#F2D6C5", fg: "#B0572C", dot: "#C96442", label: "Americano" },
  bloqueo: { bg: "#F3E7E2", bd: "#EDD0C5", fg: "#9A5E4C", dot: "#C2887A", label: "Bloqueado" },
};

function actionsFor(status: string) {
  const P = (label: string) => ({ label, bg: "#C96442", fg: "#fff", bd: "#C96442" });
  const N = (label: string) => ({ label, bg: "#fff", fg: "#221F1B", bd: "#E0DACE" });
  const D = (label: string) => ({ label, bg: "#FCEEE9", fg: "#B23A28", bd: "#F1D3CB" });
  const map: Record<string, ReturnType<typeof P>[]> = {
    libre:   [P("Reservar turno"), N("Marcar como clase"), N("Crear americano / torneo"), N("Bloquear horario")],
    simple:  [P("Ver datos del cliente"), N("Pasar a turno fijo"), N("Reprogramar"), D("Dar de baja y avisar")],
    fijo:    [P("Ver datos del cliente"), N("Editar recurrencia"), D("Suspender sólo por hoy")],
    clase:   [P("Ver clase"), N("Cambiar profesor"), D("Liberar horario")],
    evento:  [P("Ver inscriptos"), N("Editar evento"), N("Compartir link de inscripción"), D("Cancelar evento")],
    bloqueo: [N("Liberar horario")],
  };
  return map[status] ?? [];
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

export function SlotDrawer({ slot, onClose }: DrawerProps) {
  if (!slot) return null;

  const { start, end, cell, date } = slot;
  const st = STATUS_STYLES[cell.status] ?? STATUS_STYLES.libre;
  const actions = actionsFor(cell.status);
  const hasClient = !!cell.customer || !!cell.professor;
  const clientName = cell.customer?.name ?? cell.professor?.name ?? "";
  const clientPhone = cell.customer?.phone ?? "";
  const initial = clientName.trim().charAt(0).toUpperCase();

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(34,31,27,.18)", zIndex: 30 }} />
      <div style={{
        position: "fixed", top: 0, right: 0, height: "100vh", width: 392,
        maxWidth: "92vw", background: "#FCFBF8", borderLeft: "1px solid #E7E1D6",
        boxShadow: "-14px 0 44px -22px rgba(0,0,0,.4)", zIndex: 31,
        display: "flex", flexDirection: "column"
      }}>
        {/* Header */}
        <div style={{ padding: "22px 22px 18px", borderBottom: "1px solid #EFEAE0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#A39C8F" }}>
              Turno seleccionado
            </div>
            <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 24, lineHeight: 1.15, marginTop: 3, color: "#221F1B" }}>
              {start} – {end}
            </div>
            <div style={{ fontSize: 14, color: "#6B6660" }}>
              {cell.courtName} · {formatDate(date)}
            </div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, border: "1px solid #E0DACE", background: "#fff",
            borderRadius: 9, cursor: "pointer", color: "#6B6660", fontSize: 16,
            display: "flex", alignItems: "center", justifyContent: "center"
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px", display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Status chip */}
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: st.bg, border: `1px solid ${st.bd}`, borderRadius: 999, padding: "6px 13px" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: st.dot, display: "inline-block" }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: st.fg }}>{st.label}</span>
            </div>
            {cell.sub && (
              <div style={{ fontSize: 13.5, color: "#6B6660", marginTop: 8 }}>{cell.sub}</div>
            )}
          </div>

          {/* Client card */}
          {hasClient && (
            <div style={{ background: "#fff", border: "1px solid #E7E1D6", borderRadius: 12, padding: 15 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: "50%", background: "#EDE7DB",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 700, color: "#6B6660", fontSize: 16
                }}>
                  {initial}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#221F1B" }}>{clientName}</div>
                  {clientPhone && <div style={{ fontSize: 13, color: "#6B6660" }}>{clientPhone}</div>}
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#A39C8F", marginBottom: 10 }}>
              Acciones
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {actions.map((a, i) => (
                <button key={i} style={{
                  width: "100%", textAlign: "left", background: a.bg, color: a.fg,
                  border: `1px solid ${a.bd}`, borderRadius: 11, padding: "13px 15px",
                  fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit"
                }}>
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div style={{ display: "flex", gap: 9, alignItems: "flex-start", background: "#F4F1EA", borderRadius: 11, padding: "12px 14px" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#3E9B63", marginTop: 5, flexShrink: 0, display: "inline-block" }} />
            <div style={{ fontSize: 12.5, color: "#6B6660", lineHeight: 1.45 }}>
              Al dar de baja un turno, el cliente recibe el aviso automáticamente por WhatsApp y mail.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
