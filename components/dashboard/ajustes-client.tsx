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

type Tab = "plantilla" | "clases" | "fijos" | "eventos" | "miclub";

interface ClubSettings {
  address?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  phone?: string | null;
  requiresPayment?: boolean;
  paymentDeadlineHours?: number;
  mercadopagoAccessToken?: string | null;
  apiKey?: string | null;
}

interface AjustesClientProps {
  clases: { id: string; prof: string; day: string; time: string; court: string }[];
  fijos: { id: string; who: string; day: string; time: string; court: string }[];
  eventos: { id: string; name: string; date: string; time: string; courts: string; cupos: string; state: string }[];
  club?: ClubSettings;
}

function Field({ label, value, onChange, placeholder, type = "text", mono }: {
  label: string; value: string; onChange?: (v: string) => void; placeholder?: string; type?: string; mono?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: "#6B6660", letterSpacing: ".04em" }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={onChange ? e => onChange(e.target.value) : undefined}
        readOnly={!onChange}
        placeholder={placeholder}
        style={{
          padding: "10px 12px", borderRadius: 9, border: "1px solid #E0DACE",
          fontSize: 13.5, fontFamily: mono ? "monospace" : "inherit",
          background: onChange ? "#FCFBF8" : "#F4F1EA", color: "#221F1B", outline: "none",
        }}
      />
    </div>
  );
}

function MiClubTab({ initial }: { initial: ClubSettings }) {
  const [address, setAddress] = useState(initial.address ?? "");
  const [city, setCity] = useState(initial.city ?? "");
  const [neighborhood, setNeighborhood] = useState(initial.neighborhood ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [requiresPayment, setRequiresPayment] = useState(initial.requiresPayment ?? false);
  const [deadlineHours, setDeadlineHours] = useState(String(initial.paymentDeadlineHours ?? 24));
  const [mpToken, setMpToken] = useState(initial.mercadopagoAccessToken ?? "");
  const [apiKey, setApiKey] = useState(initial.apiKey ?? "");
  const [saving, setSaving] = useState(false);
  const [genning, setGenning] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true); setError(""); setSaved(false);
    try {
      const res = await fetch("/api/clubs/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: address || null,
          city: city || null,
          neighborhood: neighborhood || null,
          phone: phone || null,
          requiresPayment,
          paymentDeadlineHours: parseInt(deadlineHours) || 24,
          mercadopagoAccessToken: mpToken || null,
        }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "Error al guardar"); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { setError("Error de conexión"); }
    finally { setSaving(false); }
  }

  async function generateKey() {
    setGenning(true); setError("");
    try {
      const res = await fetch("/api/clubs/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generateApiKey: true }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "Error"); return; }
      const { club } = await res.json();
      setApiKey(club.apiKey ?? "");
    } catch { setError("Error de conexión"); }
    finally { setGenning(false); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {error && (
        <div style={{ background: "#FCEEE9", border: "1px solid #F1D3CB", borderRadius: 10, padding: "10px 14px", fontSize: 13.5, color: "#B23A28" }}>{error}</div>
      )}
      {saved && (
        <div style={{ background: "#E9F3EA", border: "1px solid #CFE6D2", borderRadius: 10, padding: "10px 14px", fontSize: 13.5, color: "#2F7D4E", fontWeight: 600 }}>✓ Cambios guardados</div>
      )}

      {/* Información del club */}
      <div style={{ background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#221F1B", letterSpacing: ".04em", textTransform: "uppercase" }}>Información del club</div>
        <Field label="Dirección" value={address} onChange={setAddress} placeholder="Av. Corrientes 1234" />
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}><Field label="Ciudad" value={city} onChange={setCity} placeholder="Buenos Aires" /></div>
          <div style={{ flex: 1 }}><Field label="Barrio" value={neighborhood} onChange={setNeighborhood} placeholder="Palermo" /></div>
        </div>
        <Field label="Teléfono de contacto" value={phone} onChange={setPhone} placeholder="+54 11 4567-8901" type="tel" />
      </div>

      {/* Pagos */}
      <div style={{ background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#221F1B", letterSpacing: ".04em", textTransform: "uppercase" }}>Pagos y MercadoPago</div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#221F1B" }}>Requerir pago para confirmar reservas</div>
            <div style={{ fontSize: 12.5, color: "#928B7E", marginTop: 2 }}>El bot enviará un link de MercadoPago y confirmará al pagar</div>
          </div>
          <button onClick={() => setRequiresPayment(!requiresPayment)} style={{
            width: 44, height: 26, borderRadius: 999,
            background: requiresPayment ? "#C96442" : "#D0C9BF",
            border: "none", cursor: "pointer", position: "relative", transition: "background .2s", flexShrink: 0,
          }}>
            <span style={{
              position: "absolute", top: 3, left: requiresPayment ? 21 : 3, width: 20, height: 20,
              borderRadius: "50%", background: "#fff", transition: "left .2s", display: "block"
            }} />
          </button>
        </div>

        {requiresPayment && (
          <Field
            label="Horas límite para pagar"
            value={deadlineHours}
            onChange={setDeadlineHours}
            placeholder="24"
            type="number"
          />
        )}

        <Field
          label="Access Token de MercadoPago"
          value={mpToken}
          onChange={setMpToken}
          placeholder="APP_USR-..."
          type="password"
        />
      </div>

      {/* API Key */}
      <div style={{ background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#221F1B", letterSpacing: ".04em", textTransform: "uppercase" }}>API Key del bot</div>
        <div style={{ fontSize: 13, color: "#6B6660" }}>Esta clave permite que el bot de WhatsApp consulte y cree reservas en tu club. Tratala como una contraseña.</div>

        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <Field label="Clave actual" value={apiKey || "(sin clave generada)"} mono />
          </div>
          <button onClick={generateKey} disabled={genning} style={{
            background: "#221F1B", color: "#fff", border: "none", borderRadius: 9,
            padding: "10px 16px", fontWeight: 600, fontSize: 13, cursor: genning ? "not-allowed" : "pointer",
            fontFamily: "inherit", whiteSpace: "nowrap", opacity: genning ? 0.6 : 1,
          }}>
            {genning ? "Generando…" : apiKey ? "Regenerar clave" : "Generar clave"}
          </button>
        </div>
        {apiKey && (
          <button onClick={() => navigator.clipboard.writeText(apiKey)} style={{
            background: "#fff", border: "1px solid #E0DACE", borderRadius: 9, padding: "9px 14px",
            fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", alignSelf: "flex-start",
          }}>
            Copiar clave
          </button>
        )}
      </div>

      <button onClick={save} disabled={saving} style={{
        background: "#C96442", color: "#fff", border: "none", borderRadius: 11, padding: "13px 20px",
        fontWeight: 700, fontSize: 14.5, cursor: saving ? "not-allowed" : "pointer",
        fontFamily: "inherit", opacity: saving ? 0.7 : 1,
      }}>
        {saving ? "Guardando…" : "Guardar cambios"}
      </button>
    </div>
  );
}

export function AjustesClient({ clases, fijos, eventos, club = {} }: AjustesClientProps) {
  const [tab, setTab] = useState<Tab>("plantilla");

  const tabs: { key: Tab; label: string }[] = [
    { key: "plantilla", label: "Plantilla semanal" },
    { key: "clases", label: "Clases" },
    { key: "fijos", label: "Turnos fijos" },
    { key: "eventos", label: "Eventos" },
    { key: "miclub", label: "Mi Club" },
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
      </div>

      {/* Tabs */}
      <div style={{ display: "inline-flex", gap: 4, background: "#EAE4D8", borderRadius: 12, padding: 4, width: "max-content", flexWrap: "wrap" }}>
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

      {/* Mi Club */}
      {tab === "miclub" && <MiClubTab initial={club} />}
    </div>
  );
}
