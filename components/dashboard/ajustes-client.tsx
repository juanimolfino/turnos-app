"use client";

import { useState } from "react";
import { useIsMobile } from "@/hooks/use-is-mobile";

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
type PaymentMode = "none" | "partial" | "full";

interface ClubSettings {
  address?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  phone?: string | null;
  requiresPayment?: boolean;
  paymentMode?: PaymentMode;
  depositPct?: number;
  refundEnabled?: boolean;
  refundCutoffHours?: number;
  paymentDeadlineHours?: number;
  apiKey?: string | null;
  courts?: { id: string; name: string; price: number }[];
  mercadoPago?: {
    connected: boolean;
    mercadoPagoUserId?: string | null;
    liveMode?: boolean | null;
    expiresAt?: Date | string | null;
    connectedAt?: Date | string | null;
    updatedAt?: Date | string | null;
  };
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
  const isMobile = useIsMobile();
  const [address, setAddress] = useState(initial.address ?? "");
  const [city, setCity] = useState(initial.city ?? "");
  const [neighborhood, setNeighborhood] = useState(initial.neighborhood ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>(initial.paymentMode ?? (initial.requiresPayment ? "full" : "none"));
  const [depositPct, setDepositPct] = useState(String(initial.depositPct ?? 25));
  const [refundEnabled, setRefundEnabled] = useState(Boolean(initial.refundEnabled));
  const [refundCutoffHours, setRefundCutoffHours] = useState(String(initial.refundCutoffHours ?? 24));
  const [courtPrices, setCourtPrices] = useState(() => (initial.courts ?? []).map((court) => ({ ...court, price: String(court.price ?? 0) })));
  const [deadlineHours, setDeadlineHours] = useState(String(initial.paymentDeadlineHours ?? 24));
  const [apiKey, setApiKey] = useState(initial.apiKey ?? "");
  const [mercadoPago, setMercadoPago] = useState(initial.mercadoPago ?? { connected: false });
  const [saving, setSaving] = useState(false);
  const [genning, setGenning] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [disconnectConfirm, setDisconnectConfirm] = useState("");
  const [saved, setSaved] = useState(false);
  const mpStatus = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("mp");
  const [error, setError] = useState(mpStatus === "error" ? "No se pudo conectar Mercado Pago. Intentá de nuevo." : "");
  const notice = mpStatus === "connected" ? "Mercado Pago conectado" : "";

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
          paymentMode,
          depositPct: parseInt(depositPct) || 25,
          refundEnabled,
          refundCutoffHours: parseInt(refundCutoffHours) || 24,
          paymentDeadlineHours: parseInt(deadlineHours) || 24,
          courtPrices: courtPrices.map((court) => ({
            courtId: court.id,
            price: parseInt(court.price) || 0,
          })),
        }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "Error al guardar"); return; }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { setError("Error de conexión"); }
    finally { setSaving(false); }
  }

  async function disconnectMercadoPago() {
    setDisconnecting(true); setError("");
    try {
      const res = await fetch("/api/mercadopago/oauth/disconnect", { method: "POST" });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "No se pudo desvincular Mercado Pago"); return; }
      setMercadoPago({ connected: false });
      setPaymentMode("none");
      setShowDisconnectModal(false);
      setDisconnectConfirm("");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch { setError("Error de conexión"); }
    finally { setDisconnecting(false); }
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
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {error && (
        <div style={{ background: "#FCEEE9", border: "1px solid #F1D3CB", borderRadius: 10, padding: "10px 14px", fontSize: 13.5, color: "#B23A28" }}>{error}</div>
      )}
      {saved && (
        <div style={{ background: "#E9F3EA", border: "1px solid #CFE6D2", borderRadius: 10, padding: "10px 14px", fontSize: 13.5, color: "#2F7D4E", fontWeight: 600 }}>✓ Cambios guardados</div>
      )}
      {notice && (
        <div style={{ background: "#E9F3EA", border: "1px solid #CFE6D2", borderRadius: 10, padding: "10px 14px", fontSize: 13.5, color: "#2F7D4E", fontWeight: 600 }}>{notice}</div>
      )}

      <div style={{ background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#221F1B", letterSpacing: ".04em", textTransform: "uppercase" }}>Información del club</div>
        <Field label="Dirección" value={address} onChange={setAddress} placeholder="Av. Corrientes 1234" />
        <div style={{ display: "flex", gap: 12, flexDirection: isMobile ? "column" : "row" }}>
          <div style={{ flex: 1 }}><Field label="Ciudad" value={city} onChange={setCity} placeholder="Buenos Aires" /></div>
          <div style={{ flex: 1 }}><Field label="Barrio" value={neighborhood} onChange={setNeighborhood} placeholder="Palermo" /></div>
        </div>
        <Field label="Teléfono de contacto" value={phone} onChange={setPhone} placeholder="+54 11 4567-8901" type="tel" />
      </div>

      <div style={{ background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#221F1B", letterSpacing: ".04em", textTransform: "uppercase" }}>Pagos y Mercado Pago</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 12 }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#6B6660", letterSpacing: ".04em" }}>MODO DE PAGO</label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                style={{
                  padding: "10px 12px", borderRadius: 9, border: "1px solid #E0DACE",
                  fontSize: 13.5, background: "#FCFBF8", color: "#221F1B", outline: "none", fontFamily: "inherit",
                }}
              >
                <option value="none">Sin pago online (0%)</option>
                <option value="partial">Seña parcial</option>
                <option value="full">Pago completo (100%)</option>
              </select>
            </div>
            {paymentMode === "partial" && (
              <div style={{ width: isMobile ? "100%" : 180 }}>
                <Field label="% DE SEÑA" value={depositPct} onChange={setDepositPct} placeholder="25" type="number" />
              </div>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#6B6660", letterSpacing: ".04em" }}>PRECIO POR CANCHA</div>
            {courtPrices.length === 0 ? (
              <div style={{ fontSize: 13, color: "#928B7E", border: "1px dashed #D6CEC0", borderRadius: 10, padding: 12 }}>Creá canchas desde Agenda semanal para configurar precios.</div>
            ) : (
              courtPrices.map((court) => (
                <div key={court.id} style={{ display: "flex", alignItems: "center", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
                  <div style={{ flex: 1, width: isMobile ? "100%" : "auto", fontSize: 13.5, fontWeight: 600, color: "#221F1B" }}>{court.name}</div>
                  <div style={{ width: isMobile ? "100%" : 180 }}>
                    <Field
                      label="PRECIO ARS"
                      value={court.price}
                      onChange={(value) => setCourtPrices((current) => current.map((item) => item.id === court.id ? { ...item, price: value } : item))}
                      placeholder="100"
                      type="number"
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          {paymentMode !== "none" && !mercadoPago.connected && (
            <div style={{ background: "#FCEEE9", border: "1px solid #F1D3CB", borderRadius: 10, padding: "10px 12px", fontSize: 13, color: "#B23A28" }}>
              Para pedir pago online primero conectá Mercado Pago. El servidor también bloquea guardar este estado.
            </div>
          )}
        </div>

        {paymentMode !== "none" && (
          <Field label="Horas límite para pagar" value={deadlineHours} onChange={setDeadlineHours} placeholder="24" type="number" />
        )}

        <div style={{ borderTop: "1px solid #E7E1D6", paddingTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#6B6660", letterSpacing: ".04em", textTransform: "uppercase" }}>Política de cancelación</div>
            <div style={{ fontSize: 12.5, color: "#928B7E", marginTop: 4 }}>
              Define si el club devuelve la seña cuando un cliente cancela con anticipación.
            </div>
          </div>
          <div style={{ display: "flex", gap: 12, flexDirection: isMobile ? "column" : "row" }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#6B6660", letterSpacing: ".04em" }}>¿ACEPTA DEVOLUCIÓN?</label>
              <select
                value={refundEnabled ? "yes" : "no"}
                onChange={(e) => setRefundEnabled(e.target.value === "yes")}
                style={{
                  padding: "10px 12px", borderRadius: 9, border: "1px solid #E0DACE",
                  fontSize: 13.5, background: "#FCFBF8", color: "#221F1B", outline: "none", fontFamily: "inherit",
                }}
              >
                <option value="no">No, la seña no se devuelve</option>
                <option value="yes">Sí, con anticipación mínima</option>
              </select>
            </div>
            {refundEnabled && (
              <div style={{ width: isMobile ? "100%" : 220 }}>
                <Field label="HORAS DE ANTICIPACIÓN" value={refundCutoffHours} onChange={setRefundCutoffHours} placeholder="24" type="number" />
              </div>
            )}
          </div>
          {!refundEnabled && (
            <div style={{ background: "#F4F1EA", border: "1px solid #E0DACE", borderRadius: 10, padding: "10px 12px", fontSize: 13, color: "#6B6660" }}>
              Los clientes no podrán recuperar la seña al cancelar. La seña funciona como compromiso de asistencia.
            </div>
          )}
          {refundEnabled && (
            <div style={{ background: "#E9F3EA", border: "1px solid #CFE6D2", borderRadius: 10, padding: "10px 12px", fontSize: 13, color: "#2F7D4E" }}>
              Estado actual: se devuelve la seña si cancelan con al menos {parseInt(refundCutoffHours) || 24} horas de anticipación.
            </div>
          )}
        </div>

        <div style={{ border: "1px solid #E0DACE", background: "#FFFFFF", borderRadius: 12, padding: 14, display: "flex", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", gap: 12, alignItems: isMobile ? "stretch" : "center" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#221F1B" }}>
              {mercadoPago.connected ? "Mercado Pago conectado" : "Mercado Pago no conectado"}
            </div>
            <div style={{ fontSize: 12.5, color: "#928B7E", marginTop: 3 }}>
              {mercadoPago.connected
                ? "La cuenta del club ya autorizó a Cancha. No mostramos credenciales en el panel."
                : "Conectá la cuenta del club para poder cobrar a nombre del club en una fase posterior."}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexDirection: isMobile ? "column" : "row", width: isMobile ? "100%" : "auto" }}>
            <a href="/api/mercadopago/oauth/start" style={{
              display: "inline-flex", justifyContent: "center", alignItems: "center",
              background: "#221F1B", color: "#fff", borderRadius: 9, padding: "10px 16px",
              fontWeight: 700, fontSize: 13, textDecoration: "none", whiteSpace: "nowrap",
            }}>
              {mercadoPago.connected ? "Reconectar Mercado Pago" : "Conectar Mercado Pago"}
            </a>
            {mercadoPago.connected && (
              <button onClick={() => setShowDisconnectModal(true)} style={{
                background: "#fff", color: "#B23A28", border: "1px solid #F1D3CB", borderRadius: 9,
                padding: "10px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
              }}>
                Desvincular Mercado Pago
              </button>
            )}
          </div>
        </div>
      </div>

      {showDisconnectModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(34,31,27,.35)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
          <div style={{ width: "100%", maxWidth: 520, background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 14, padding: 20, boxShadow: "0 18px 45px rgba(0,0,0,.18)", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#221F1B" }}>Desvincular Mercado Pago</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13.5, color: "#4B4640", lineHeight: 1.45 }}>
              <div>Al desvincular, el club dejará de poder cobrar por el bot.</div>
              <div>Las nuevas reservas que requieran pago no van a funcionar hasta reconectar Mercado Pago.</div>
              <div>Las reservas ya pagadas no se ven afectadas: la plata ya está en la cuenta de Mercado Pago del club.</div>
              <div>Para evitar un estado inconsistente, el modo de pago se va a cambiar a &quot;Sin pago online&quot;.</div>
            </div>
            <Field label='ESCRIBÍ "DESVINCULAR" PARA CONFIRMAR' value={disconnectConfirm} onChange={setDisconnectConfirm} placeholder="DESVINCULAR" />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
              <button onClick={() => { setShowDisconnectModal(false); setDisconnectConfirm(""); }} disabled={disconnecting} style={{
                background: "#fff", border: "1px solid #E0DACE", borderRadius: 9, padding: "10px 16px",
                fontSize: 13, fontWeight: 700, cursor: disconnecting ? "not-allowed" : "pointer", fontFamily: "inherit",
              }}>
                Cancelar
              </button>
              <button onClick={disconnectMercadoPago} disabled={disconnecting || disconnectConfirm !== "DESVINCULAR"} style={{
                background: "#B23A28", color: "#fff", border: "none", borderRadius: 9, padding: "10px 16px",
                fontSize: 13, fontWeight: 800, cursor: disconnecting || disconnectConfirm !== "DESVINCULAR" ? "not-allowed" : "pointer",
                fontFamily: "inherit", opacity: disconnecting || disconnectConfirm !== "DESVINCULAR" ? 0.55 : 1,
              }}>
                {disconnecting ? "Desvinculando…" : "Confirmar desvinculación"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#221F1B", letterSpacing: ".04em", textTransform: "uppercase" }}>API Key del bot</div>
        <div style={{ fontSize: 13, color: "#6B6660" }}>Esta clave permite que el bot de WhatsApp consulte y cree reservas en tu club. Tratala como una contraseña.</div>

        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexDirection: isMobile ? "column" : "row" }}>
          <div style={{ flex: 1, width: isMobile ? "100%" : "auto" }}>
            <Field label="Clave actual" value={apiKey || "(sin clave generada)"} mono />
          </div>
          <button onClick={generateKey} disabled={genning} style={{
            background: "#221F1B", color: "#fff", border: "none", borderRadius: 9,
            padding: "10px 16px", fontWeight: 600, fontSize: 13, cursor: genning ? "not-allowed" : "pointer",
            fontFamily: "inherit", whiteSpace: "nowrap", opacity: genning ? 0.6 : 1,
            width: isMobile ? "100%" : "auto",
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
  const isMobile = useIsMobile();

  const tabs: { key: Tab; label: string }[] = [
    { key: "plantilla", label: "Plantilla" },
    { key: "clases", label: "Clases" },
    { key: "fijos", label: "Fijos" },
    { key: "eventos", label: "Eventos" },
    { key: "miclub", label: "Mi Club" },
  ];

  return (
    <div style={{ padding: isMobile ? "12px 14px 32px" : "24px 28px 40px", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div>
        <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: isMobile ? 24 : 28, lineHeight: 1.1, color: "#221F1B" }}>
          Ajustes de la agenda
        </div>
        {!isMobile && (
          <div style={{ fontSize: 14, color: "#6B6660", marginTop: 4 }}>
            Configurás una vez y se repite cada semana. Después editás los días puntuales desde la agenda.
          </div>
        )}
      </div>

      {/* Tabs — scrollable on mobile */}
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"], marginLeft: -2, paddingLeft: 2 }}>
        <div style={{ display: "inline-flex", gap: 4, background: "#EAE4D8", borderRadius: 12, padding: 4, minWidth: "max-content" }}>
          {tabs.map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)} style={{
              background: tab === key ? "#FFFFFF" : "transparent",
              color: tab === key ? "#221F1B" : "#6B6660",
              boxShadow: tab === key ? "0 1px 2px rgba(0,0,0,.05)" : "none",
              border: "none", borderRadius: 9, padding: isMobile ? "8px 14px" : "9px 16px",
              fontWeight: 600, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit",
              whiteSpace: "nowrap"
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Plantilla — horizontal scroll */}
      {tab === "plantilla" && (
        <div style={{ background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 16, padding: 16, overflowX: "auto" }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10, minWidth: 640 }}>
            <div style={{ width: 88, flexShrink: 0 }} />
            <div style={{ flex: 1, display: "flex", gap: 8 }}>
              {WEEK_DAYS.map(d => (
                <div key={d} style={{ flex: 1, textAlign: "center", fontSize: 12.5, fontWeight: 700, color: "#6B6660" }}>{d}</div>
              ))}
            </div>
          </div>
          {PLANTILLA.map((band) => (
            <div key={band.band} style={{ display: "flex", gap: 8, marginBottom: 8, minWidth: 640 }}>
              <div style={{ width: 88, flexShrink: 0, paddingTop: 8 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "#221F1B" }}>{band.band}</div>
                <div style={{ fontSize: 11, color: "#A39C8F" }}>{band.time}</div>
              </div>
              <div style={{ flex: 1, display: "flex", gap: 8 }}>
                {band.cells.map((c, i) => (
                  <div key={i} style={{ flex: 1, minWidth: 0, background: c.bg, border: `1px solid ${c.bd}`, borderRadius: 9, padding: "10px 6px", minHeight: 50, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: 11.5, fontWeight: 600, color: c.fg, cursor: "pointer" }}>{c.label}</div>
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
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ width: 4, height: 36, borderRadius: 4, background: "#5B7FBE", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#221F1B" }}>{c.prof}</div>
                <div style={{ fontSize: 13, color: "#6B6660" }}>{c.day} · {c.time}</div>
              </div>
              {!isMobile && <div style={{ background: "#EAF0F8", color: "#3D5C93", borderRadius: 999, padding: "5px 12px", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }}>{c.court}</div>}
              <span style={{ fontSize: 13, color: "#C96442", fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>Editar</span>
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
            <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 12, background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ width: 4, height: 36, borderRadius: 4, background: "#8A6BC4", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#221F1B" }}>{f.who}</div>
                <div style={{ fontSize: 13, color: "#6B6660" }}>Todos los {f.day} · {f.time}</div>
              </div>
              {!isMobile && <div style={{ background: "#F1EAF7", color: "#6B4E9E", borderRadius: 999, padding: "5px 12px", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap" }}>{f.court}</div>}
              <span style={{ fontSize: 13, color: "#C96442", fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>Editar</span>
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
            <div key={e.id} style={{ background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 12, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#C96442", display: "inline-block", flexShrink: 0 }} />
                    <span style={{ fontSize: 15, fontWeight: 700, color: "#221F1B" }}>{e.name}</span>
                  </div>
                  <div style={{ fontSize: 13, color: "#6B6660", marginTop: 4 }}>{e.date} · {e.time}{!isMobile && ` · ${e.courts}`}</div>
                </div>
                <div style={{ background: "#FBEBE2", color: "#B0572C", borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>{e.state}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 13, color: "#6B6660" }}>Inscriptos: <strong style={{ color: "#221F1B" }}>{e.cupos}</strong></div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={{ background: "#fff", border: "1px solid #E0DACE", borderRadius: 9, padding: "7px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Ver inscriptos</button>
                  <button style={{ background: "#fff", border: "1px solid #E0DACE", borderRadius: 9, padding: "7px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Editar</button>
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
