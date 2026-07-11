"use client";

import { useState } from "react";
import { useIsMobile } from "@/hooks/use-is-mobile";

type PaymentMode = "none" | "partial" | "full";

// Aviso para el admin del club cuando su conexión con Mercado Pago está por vencer
// (≤30 días) o ya venció. El token de MP dura 180 días; la renovación automática
// (cron) cubre el caso normal, pero si esa renovación falla (refresh_token
// inválido, permiso revocado) el único arreglo es que el club reconecte a mano.
export function mpExpiryWarning(expiresAt: Date | string | null | undefined) {
  if (!expiresAt) return null;
  const days = Math.floor((new Date(expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 0) {
    return {
      title: "Tu conexión con Mercado Pago venció",
      subtitle: "Mientras esté vencida, las reservas que requieren pago no se van a poder cobrar. Reconectala para reactivar los cobros.",
      bg: "#FCEBE7", border: "#EDC7BC", fg: "#B0492E",
    };
  }
  if (days <= 30) {
    return {
      title: `Tu conexión con Mercado Pago vence en ${days} día${days === 1 ? "" : "s"}`,
      subtitle: "Reconectala antes de que venza para seguir cobrando sin cortes. Es rápido y no perdés ninguna configuración ni las reservas ya pagadas.",
      bg: "#FBF1DD", border: "#EBDCB6", fg: "#8A6415",
    };
  }
  return null;
}

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
  openingWindow?: { open: string; close: string };
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
  club?: ClubSettings;
}

function timeOptions(startMin: number, endMin: number, extra: string[] = []): string[] {
  const opts: string[] = [];
  for (let m = startMin; m <= endMin; m += 30) {
    opts.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return [...opts, ...extra];
}
// Apertura: cada 30 min de 06:00 a 23:00. Cierre: de 07:00 a 23:30, más 23:59
// (para clubes que operan "hasta medianoche").
const OPEN_OPTIONS = timeOptions(6 * 60, 23 * 60);
const CLOSE_OPTIONS = timeOptions(7 * 60, 23 * 60 + 30, ["23:59"]);

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
  const [openTime, setOpenTime] = useState(initial.openingWindow?.open ?? "08:00");
  const [closeTime, setCloseTime] = useState(initial.openingWindow?.close ?? "23:00");
  const [deadlineHours, setDeadlineHours] = useState(String(initial.paymentDeadlineHours ?? 24));
  const [mercadoPago, setMercadoPago] = useState(initial.mercadoPago ?? { connected: false });
  const [saving, setSaving] = useState(false);
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
          openTime,
          closeTime,
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
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#221F1B", letterSpacing: ".04em", textTransform: "uppercase" }}>Horario de atención</div>
          <div style={{ fontSize: 12.5, color: "#928B7E", marginTop: 4 }}>
            Define desde y hasta qué hora opera tu club. La agenda y el bot usan este horario para
            mostrar la disponibilidad; fuera de él, no se ofrecen turnos.
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, flexDirection: isMobile ? "column" : "row" }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#6B6660", letterSpacing: ".04em" }}>ABRE</label>
            <select
              value={openTime}
              onChange={(e) => setOpenTime(e.target.value)}
              style={{ padding: "10px 12px", borderRadius: 9, border: "1px solid #E0DACE", fontSize: 13.5, background: "#FCFBF8", color: "#221F1B", outline: "none", fontFamily: "inherit" }}
            >
              {OPEN_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#6B6660", letterSpacing: ".04em" }}>CIERRA</label>
            <select
              value={closeTime}
              onChange={(e) => setCloseTime(e.target.value)}
              style={{ padding: "10px 12px", borderRadius: 9, border: "1px solid #E0DACE", fontSize: 13.5, background: "#FCFBF8", color: "#221F1B", outline: "none", fontFamily: "inherit" }}
            >
              {CLOSE_OPTIONS.map((t) => <option key={t} value={t}>{t === "23:59" ? "23:59 (medianoche)" : t}</option>)}
            </select>
          </div>
        </div>
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

        {(() => {
          const warn = mercadoPago.connected ? mpExpiryWarning(mercadoPago.expiresAt) : null;
          if (!warn) return null;
          return (
            <div style={{ border: `1px solid ${warn.border}`, background: warn.bg, borderRadius: 12, padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: warn.fg }}>{warn.title}</div>
              <div style={{ fontSize: 13, color: "#54504A", marginTop: 4, lineHeight: 1.5 }}>{warn.subtitle}</div>
              <div style={{ fontSize: 13, color: "#54504A", marginTop: 10, fontWeight: 700 }}>Cómo reconectar (2 minutos):</div>
              <ol style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13, color: "#54504A", lineHeight: 1.6 }}>
                <li>Tocá el botón <strong>“Reconectar Mercado Pago”</strong> acá abajo.</li>
                <li>Te lleva a Mercado Pago: iniciá sesión con <strong>la misma cuenta del club</strong> y tocá <strong>“Autorizar”</strong>.</li>
                <li>Volvés solo a esta página. Listo: queda renovada por otros 6 meses.</li>
              </ol>
              <div style={{ fontSize: 12.5, color: "#8A8377", marginTop: 10, lineHeight: 1.5 }}>
                <strong>No toques “Desvincular”.</strong> Desvincular apaga los cobros del club; con <strong>Reconectar</strong> alcanza para renovar la conexión sin perder nada.
              </div>
            </div>
          );
        })()}

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

export function AjustesClient({ club = {} }: AjustesClientProps) {
  const isMobile = useIsMobile();

  return (
    <div style={{ padding: isMobile ? "12px 14px 32px" : "24px 28px 40px", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div>
        <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: isMobile ? 24 : 28, lineHeight: 1.1, color: "#221F1B" }}>
          Ajustes del club
        </div>
        {!isMobile && (
          <div style={{ fontSize: 14, color: "#6B6660", marginTop: 4 }}>
            Configurá los datos del club, precios, pagos online y política de cancelación.
          </div>
        )}
      </div>

      <MiClubTab initial={club} />
    </div>
  );
}
