"use client";

import { useState } from "react";

const WEEK_DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const PLANTILLA = [
  { band: "Mañana", time: "08 – 16h", cells: [
    { bg: "#EAF0F8", bd: "#D3DEF0", fg: "#3D5C93", label: "Clases" },
    { bg: "#EAF0F8", bd: "#D3DEF0", fg: "#3D5C93", label: "Clases" },
    { bg: "#EAF0F8", bd: "#D3DEF0", fg: "#3D5C93", label: "Clases" },
    { bg: "#EAF0F8", bd: "#D3DEF0", fg: "#3D5C93", label: "Clases" },
    { bg: "#EAF0F8", bd: "#D3DEF0", fg: "#3D5C93", label: "Clases" },
    { bg: "#EAF0F8", bd: "#D3DEF0", fg: "#3D5C93", label: "Clases" },
    { bg: "#EAF0F8", bd: "#D3DEF0", fg: "#3D5C93", label: "Clases" },
  ]},
  { band: "Tarde", time: "16 – 20h", cells: [
    { bg: "#E9F3EA", bd: "#CFE6D2", fg: "#2F7D4E", label: "Abiertos" },
    { bg: "#EAF0F8", bd: "#D3DEF0", fg: "#3D5C93", label: "Clase + abiertos" },
    { bg: "#E9F3EA", bd: "#CFE6D2", fg: "#2F7D4E", label: "Abiertos" },
    { bg: "#EAF0F8", bd: "#D3DEF0", fg: "#3D5C93", label: "Clase + abiertos" },
    { bg: "#E9F3EA", bd: "#CFE6D2", fg: "#2F7D4E", label: "Abiertos" },
    { bg: "#E9F3EA", bd: "#CFE6D2", fg: "#2F7D4E", label: "Abiertos" },
    { bg: "#E9F3EA", bd: "#CFE6D2", fg: "#2F7D4E", label: "Abiertos" },
  ]},
  { band: "Noche", time: "20 – 23:30h", cells: [
    { bg: "#E9F3EA", bd: "#CFE6D2", fg: "#2F7D4E", label: "Abiertos" },
    { bg: "#FBEBE2", bd: "#F2D6C5", fg: "#B0572C", label: "Americano" },
    { bg: "#E9F3EA", bd: "#CFE6D2", fg: "#2F7D4E", label: "Abiertos" },
    { bg: "#E9F3EA", bd: "#CFE6D2", fg: "#2F7D4E", label: "Abiertos" },
    { bg: "#F1EAF7", bd: "#E2D4EF", fg: "#6B4E9E", label: "Fijos + abiertos" },
    { bg: "#FBEBE2", bd: "#F2D6C5", fg: "#B0572C", label: "Torneo" },
    { bg: "#E9F3EA", bd: "#CFE6D2", fg: "#2F7D4E", label: "Abiertos" },
  ]},
];

type Tab = "plantilla" | "clases" | "fijos" | "eventos";

interface AjustesClientProps {
  clases: { id: string; prof: string; day: string; time: string; court: string }[];
  fijos: { id: string; who: string; day: string; time: string; court: string }[];
  eventos: { id: string; name: string; date: string; time: string; courts: string; cupos: string; state: string }[];
}

export function AjustesClient({ clases, fijos, eventos }: AjustesClientProps) {
  const [tab, setTab] = useState<Tab>("plantilla");

  const tabs: { key: Tab; label: string }[] = [
    { key: "plantilla", label: "Plantilla semanal" },
    { key: "clases", label: "Clases" },
    { key: "fijos", label: "Turnos fijos" },
    { key: "eventos", label: "Eventos" },
  ];

  return (
    <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
        <div>
          <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 28, lineHeight: 1.1, color: "#221F1B" }}>
            Ajustes de la agenda
          </div>
          <div style={{ fontSize: 14, color: "#6B6660", marginTop: 4 }}>
            Configurás una vez y se repite cada semana. Después editás los días puntuales desde la agenda.
          </div>
        </div>
        <button style={{ background: "#C96442", color: "#fff", border: "none", borderRadius: 10, padding: "11px 18px", fontWeight: 600, fontSize: 14, cursor: "pointer", boxShadow: "0 2px 8px -3px rgba(201,100,66,.5)", fontFamily: "inherit" }}>
          Guardar cambios
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "inline-flex", gap: 4, background: "#EAE4D8", borderRadius: 12, padding: 4, width: "max-content" }}>
        {tabs.map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)} style={{
            background: tab === key ? "#FFFFFF" : "transparent",
            color: tab === key ? "#221F1B" : "#6B6660",
            boxShadow: tab === key ? "0 1px 2px rgba(0,0,0,.05)" : "none",
            border: "none", borderRadius: 9, padding: "9px 16px",
            fontWeight: 600, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit"
          }}>{label}</button>
        ))}
      </div>

      {/* Plantilla */}
      {tab === "plantilla" && (
        <div style={{ background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 16, padding: 18, overflowX: "auto" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, minWidth: 760 }}>
            <div style={{ width: 96, flexShrink: 0 }} />
            <div style={{ flex: 1, display: "flex", gap: 8 }}>
              {WEEK_DAYS.map(d => (
                <div key={d} style={{ flex: 1, textAlign: "center", fontSize: 12.5, fontWeight: 700, color: "#6B6660" }}>{d}</div>
              ))}
            </div>
          </div>
          {PLANTILLA.map((band) => (
            <div key={band.band} style={{ display: "flex", gap: 8, marginBottom: 8, minWidth: 760 }}>
              <div style={{ width: 96, flexShrink: 0, paddingTop: 8 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "#221F1B" }}>{band.band}</div>
                <div style={{ fontSize: 11, color: "#A39C8F" }}>{band.time}</div>
              </div>
              <div style={{ flex: 1, display: "flex", gap: 8 }}>
                {band.cells.map((c, i) => (
                  <div key={i} style={{ flex: 1, minWidth: 0, background: c.bg, border: `1px solid ${c.bd}`, borderRadius: 9, padding: "11px 8px", minHeight: 52, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: 12, fontWeight: 600, color: c.fg, cursor: "pointer" }}>{c.label}</div>
                ))}
              </div>
            </div>
          ))}
          <div style={{ marginTop: 10, fontSize: 12.5, color: "#928B7E" }}>Tocá cualquier bloque para editar profesores, cupos u horarios de ese día.</div>
        </div>
      )}

      {/* Clases */}
      {tab === "clases" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {clases.map(c => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 14, background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ width: 4, height: 38, borderRadius: 4, background: "#5B7FBE", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#221F1B" }}>{c.prof}</div>
                <div style={{ fontSize: 13, color: "#6B6660" }}>{c.day} · {c.time}</div>
              </div>
              <div style={{ background: "#EAF0F8", color: "#3D5C93", borderRadius: 999, padding: "5px 12px", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }}>{c.court}</div>
              <span style={{ fontSize: 13, color: "#C96442", fontWeight: 600, cursor: "pointer" }}>Editar</span>
            </div>
          ))}
          <button style={{ background: "#fff", border: "1px dashed #CFC8B9", borderRadius: 12, padding: 13, fontSize: 14, fontWeight: 600, color: "#6B6660", cursor: "pointer", fontFamily: "inherit" }}>
            + Agregar clase de profesor
          </button>
        </div>
      )}

      {/* Fijos */}
      {tab === "fijos" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {fijos.map(f => (
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 14, background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ width: 4, height: 38, borderRadius: 4, background: "#8A6BC4", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#221F1B" }}>{f.who}</div>
                <div style={{ fontSize: 13, color: "#6B6660" }}>Todos los {f.day} · {f.time}</div>
              </div>
              <div style={{ background: "#F1EAF7", color: "#6B4E9E", borderRadius: 999, padding: "5px 12px", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }}>{f.court}</div>
              <span style={{ fontSize: 13, color: "#C96442", fontWeight: 600, cursor: "pointer" }}>Editar</span>
            </div>
          ))}
          <button style={{ background: "#fff", border: "1px dashed #CFC8B9", borderRadius: 12, padding: 13, fontSize: 14, fontWeight: 600, color: "#6B6660", cursor: "pointer", fontFamily: "inherit" }}>
            + Agregar turno fijo semanal
          </button>
        </div>
      )}

      {/* Eventos */}
      {tab === "eventos" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {eventos.map(e => (
            <div key={e.id} style={{ background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#C96442", display: "inline-block" }} />
                    <span style={{ fontSize: 15, fontWeight: 700, color: "#221F1B" }}>{e.name}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "#6B6660", marginTop: 5 }}>{e.date} · {e.time} · {e.courts}</div>
                </div>
                <div style={{ background: "#FBEBE2", color: "#B0572C", borderRadius: 999, padding: "5px 12px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{e.state}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, gap: 12 }}>
                <div style={{ fontSize: 13, color: "#6B6660" }}>Inscriptos: <strong style={{ color: "#221F1B" }}>{e.cupos}</strong></div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={{ background: "#fff", border: "1px solid #E0DACE", borderRadius: 9, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Ver inscriptos</button>
                  <button style={{ background: "#fff", border: "1px solid #E0DACE", borderRadius: 9, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Editar</button>
                </div>
              </div>
            </div>
          ))}
          <button style={{ background: "#C96442", color: "#fff", border: "none", borderRadius: 12, padding: 13, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            + Organizar americano o torneo
          </button>
        </div>
      )}
    </div>
  );
}
