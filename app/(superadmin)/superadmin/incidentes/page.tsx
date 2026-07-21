import { auditPaymentOperationalIncidents, getOperationalIncidents } from "@/lib/db/queries";

export const metadata = { title: "Incidentes · Super Admin" };

function fmtDate(value: Date) {
  return new Intl.DateTimeFormat("es-CR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Costa_Rica",
  }).format(value);
}

function toneFor(severity: string) {
  if (severity === "critical") return { bg: "#FEE2E2", border: "#FECACA", color: "#991B1B", label: "Crítico" };
  if (severity === "warning") return { bg: "#FEF3C7", border: "#FDE68A", color: "#92400E", label: "Atención" };
  return { bg: "#DBEAFE", border: "#BFDBFE", color: "#1E40AF", label: "Info" };
}

export default async function SuperadminIncidentesPage({
  searchParams,
}: {
  searchParams: Promise<{ audit?: string }>;
}) {
  const params = await searchParams;
  const audit = params.audit === "1" ? await auditPaymentOperationalIncidents() : null;
  const incidents = await getOperationalIncidents(100);
  const openCount = incidents.filter((incident) => incident.status === "open").length;
  const criticalCount = incidents.filter((incident) => incident.severity === "critical").length;
  const whatsappCount = incidents.filter((incident) => incident.customerChannel === "whatsapp").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: "#221F1B" }}>Incidentes operativos</h1>
          <p style={{ margin: "6px 0 0", color: "#6B6660", maxWidth: 760 }}>
            Reportes internos para detectar pagos o reservas del bot que requieren revisión. Especialmente útil para ver si usuarios de WhatsApp tuvieron problemas después de pagar.
          </p>
        </div>
        <form action="/superadmin/incidentes" method="get">
          <input type="hidden" name="audit" value="1" />
          <button type="submit" style={{
            border: "1px solid #8A6BC4",
            background: "#8A6BC4",
            color: "#fff",
            borderRadius: 10,
            padding: "10px 14px",
            fontWeight: 800,
            cursor: "pointer",
          }}>
            Analizar pagos
          </button>
        </form>
      </div>

      {audit && (
        <div style={{ border: "1px solid #D8CDEB", background: "#F7F2FF", color: "#4C3578", borderRadius: 12, padding: 14, fontWeight: 700 }}>
          Auditoría ejecutada: {audit.scanned} pagos inconsistentes encontrados o ya reportados.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        {[
          ["Abiertos", openCount],
          ["Críticos", criticalCount],
          ["WhatsApp", whatsappCount],
          ["Últimos reportes", incidents.length],
        ].map(([label, value]) => (
          <div key={label} style={{ border: "1px solid #E7E1D6", background: "#fff", borderRadius: 14, padding: 16 }}>
            <div style={{ color: "#8A8275", fontSize: 13, fontWeight: 700 }}>{label}</div>
            <div style={{ color: "#221F1B", fontSize: 28, fontWeight: 900, marginTop: 4 }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ border: "1px solid #E7E1D6", background: "#fff", borderRadius: 16, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #EFEAE0", display: "flex", justifyContent: "space-between", gap: 12 }}>
          <strong style={{ color: "#221F1B" }}>Últimos 100 incidentes</strong>
          <span style={{ color: "#8A8275", fontSize: 13 }}>Se guardan desde webhooks y auditorías manuales</span>
        </div>

        {incidents.length === 0 ? (
          <div style={{ padding: 28, color: "#6B6660" }}>No hay incidentes reportados.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
              <thead>
                <tr style={{ background: "#FCFBF8", color: "#8A8275", fontSize: 12, textTransform: "uppercase", letterSpacing: ".06em" }}>
                  <th style={{ textAlign: "left", padding: "12px 14px" }}>Estado</th>
                  <th style={{ textAlign: "left", padding: "12px 14px" }}>Tipo</th>
                  <th style={{ textAlign: "left", padding: "12px 14px" }}>Club / cliente</th>
                  <th style={{ textAlign: "left", padding: "12px 14px" }}>Reserva / pago</th>
                  <th style={{ textAlign: "left", padding: "12px 14px" }}>Mensaje</th>
                  <th style={{ textAlign: "left", padding: "12px 14px" }}>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((incident) => {
                  const tone = toneFor(incident.severity);
                  return (
                    <tr key={incident.id} style={{ borderTop: "1px solid #EFEAE0", verticalAlign: "top" }}>
                      <td style={{ padding: "13px 14px" }}>
                        <span style={{ display: "inline-flex", border: "1px solid " + tone.border, background: tone.bg, color: tone.color, borderRadius: 999, padding: "4px 9px", fontSize: 12, fontWeight: 800 }}>
                          {tone.label}
                        </span>
                        <div style={{ color: "#8A8275", fontSize: 12, marginTop: 6 }}>{incident.status}</div>
                      </td>
                      <td style={{ padding: "13px 14px", color: "#221F1B", fontWeight: 800 }}>
                        {incident.type}
                        <div style={{ color: "#8A8275", fontSize: 12, fontWeight: 600, marginTop: 5 }}>{incident.source}</div>
                      </td>
                      <td style={{ padding: "13px 14px", color: "#221F1B" }}>
                        <div style={{ fontWeight: 800 }}>{incident.clubName ?? "Sin club"}</div>
                        <div style={{ color: "#6B6660", fontSize: 13 }}>{incident.customerName ?? "Sin cliente"}</div>
                        {incident.customerPhone && <div style={{ color: "#8A8275", fontSize: 12 }}>{incident.customerPhone}</div>}
                        {incident.customerChannel === "whatsapp" && (
                          <span style={{ display: "inline-flex", marginTop: 6, background: "#DCFCE7", color: "#166534", borderRadius: 999, padding: "3px 8px", fontSize: 12, fontWeight: 800 }}>WhatsApp</span>
                        )}
                      </td>
                      <td style={{ padding: "13px 14px", color: "#221F1B" }}>
                        <div>Código: <strong>{incident.bookingCode ?? "—"}</strong></div>
                        <div style={{ color: "#6B6660", fontSize: 13 }}>Pago: {incident.paymentId ?? "—"}</div>
                        <div style={{ color: "#8A8275", fontSize: 12 }}>Reserva {incident.bookingStatus ?? "—"} · pago {incident.paymentStatus ?? "—"}</div>
                        {incident.paymentReviewReason && <div style={{ color: "#B45309", fontSize: 12 }}>Revisión: {incident.paymentReviewReason}</div>}
                      </td>
                      <td style={{ padding: "13px 14px", color: "#221F1B", maxWidth: 340 }}>
                        <div>{incident.message}</div>
                        {incident.details != null ? (
                          <pre style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word", background: "#F7F5EF", border: "1px solid #E7E1D6", borderRadius: 8, padding: 8, color: "#6B6660", fontSize: 11, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                            {JSON.stringify(incident.details, null, 2)}
                          </pre>
                        ) : null}
                      </td>
                      <td style={{ padding: "13px 14px", color: "#6B6660", whiteSpace: "nowrap" }}>{fmtDate(incident.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
