import type { PaymentRow } from "@/lib/db/queries";

// Vista de solo lectura de movimientos de dinero (trazabilidad). Presentacional:
// sin estado ni hooks, se renderiza server-side. La usan el admin (su club) y el
// superadmin (global, con columna de club).

const TZ = "America/Argentina/Buenos_Aires";

function formatMoney(amount: number | null): string {
  if (amount == null) return "—";
  return `$${new Intl.NumberFormat("es-AR").format(amount)}`;
}

function formatDateTime(value: Date | string | null): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("es-AR", {
      timeZone: TZ, day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "—";
  }
}

function formatDay(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-");
    return `${d}/${m}/${y}`;
  }
  return value;
}

// Etiqueta legible para el motivo de revisión que guarda el sistema.
const REVIEW_LABEL: Record<string, string> = {
  amount_mismatch: "Monto no coincide",
  not_pending: "Pago tardío (ya no pendiente)",
  hold_expired: "Pago tardío (hold vencido)",
  refund_failed: "Falló la devolución",
  refund_not_approved: "Devolución no aprobada",
  refund_missing_credentials: "Devolución sin credenciales",
};

const styles = {
  page: { minHeight: "100%", padding: "24px 28px 96px", color: "#221F1B", display: "flex", flexDirection: "column" as const, gap: 18 },
  title: { fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 34, lineHeight: 1, margin: 0 },
  subtitle: { margin: "8px 0 0", color: "#6B6660", fontSize: 14, maxWidth: 720, lineHeight: 1.45 },
  tiles: { display: "flex", gap: 12, flexWrap: "wrap" as const },
  tile: { flex: "1 1 160px", background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 14, padding: "14px 16px" },
  tileLabel: { fontSize: 12, fontWeight: 700, color: "#928B7E", letterSpacing: ".03em", textTransform: "uppercase" as const },
  tileValue: { fontSize: 24, fontWeight: 800, marginTop: 6, fontFamily: "'Instrument Serif', Georgia, serif" },
  panel: { background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 16, overflow: "hidden" },
  table: { width: "100%", borderCollapse: "collapse" as const },
  th: { textAlign: "left" as const, fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase" as const, color: "#A39C8F", padding: "12px 14px", borderBottom: "1px solid #EFEAE0", background: "#F6F1E8", whiteSpace: "nowrap" as const },
  td: { padding: "13px 14px", borderBottom: "1px solid #EFEAE0", verticalAlign: "top" as const, fontSize: 14 },
  mono: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, color: "#6B6660" },
};

function Badge({ label, tone }: { label: string; tone: "ok" | "danger" | "pending" | "neutral" | "refund" }) {
  const palette =
    tone === "ok" ? { bg: "#EAF6EF", color: "#28794C", border: "#CBE8D6" } :
    tone === "danger" ? { bg: "#FFF6F2", color: "#B0572C", border: "#E2B8AA" } :
    tone === "pending" ? { bg: "#FFF8E6", color: "#8A6415", border: "#F0DCA5" } :
    tone === "refund" ? { bg: "#EAF1F8", color: "#315E82", border: "#D4E3EF" } :
    { bg: "#fff", color: "#6B6660", border: "#E7E1D6" };
  return (
    <span style={{ display: "inline-flex", border: `1px solid ${palette.border}`, background: palette.bg, color: palette.color, borderRadius: 999, padding: "4px 8px", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

function paymentTone(status: string | null): "ok" | "pending" | "neutral" {
  if (status === "pagado" || status === "senado") return "ok";
  if (status === "impago") return "pending";
  return "neutral";
}

export function PaymentsView({ rows, showClub, subtitle }: { rows: PaymentRow[]; showClub: boolean; subtitle: string }) {
  const cobrado = rows.filter((r) => r.paidAt).reduce((acc, r) => acc + (r.amount ?? 0), 0);
  const devuelto = rows.filter((r) => r.refundedAt).reduce((acc, r) => acc + (r.amount ?? 0), 0);

  return (
    <div style={styles.page}>
      <div>
        <h1 style={styles.title}>Pagos</h1>
        <p style={styles.subtitle}>{subtitle}</p>
      </div>

      <div style={styles.tiles}>
        <div style={styles.tile}>
          <div style={styles.tileLabel}>Cobrado</div>
          <div style={{ ...styles.tileValue, color: "#28794C" }}>{formatMoney(cobrado)}</div>
        </div>
        <div style={styles.tile}>
          <div style={styles.tileLabel}>Devuelto</div>
          <div style={{ ...styles.tileValue, color: "#B0572C" }}>{formatMoney(devuelto)}</div>
        </div>
        <div style={styles.tile}>
          <div style={styles.tileLabel}>Neto</div>
          <div style={{ ...styles.tileValue, color: "#221F1B" }}>{formatMoney(cobrado - devuelto)}</div>
        </div>
        <div style={styles.tile}>
          <div style={styles.tileLabel}>Movimientos</div>
          <div style={{ ...styles.tileValue, color: "#221F1B" }}>{rows.length}</div>
        </div>
      </div>

      <div style={styles.panel}>
        {rows.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center", color: "#928B7E", fontSize: 14 }}>
            Todavía no hay movimientos de dinero. Cuando alguien pague una reserva por el bot, va a aparecer acá.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Turno</th>
                  <th style={styles.th}>Cliente</th>
                  {showClub && <th style={styles.th}>Club</th>}
                  <th style={styles.th}>Cancha</th>
                  <th style={styles.th}>Monto</th>
                  <th style={styles.th}>Pago</th>
                  <th style={styles.th}>Devolución</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const reviewLabel = r.paymentReviewReason ? REVIEW_LABEL[r.paymentReviewReason] ?? r.paymentReviewReason : null;
                  return (
                    <tr key={r.id}>
                      <td style={styles.td}>
                        <strong>{formatDay(r.date)}</strong>
                        <div style={{ marginTop: 3, color: "#6B6660", fontSize: 13 }}>{r.startTime}–{r.endTime}</div>
                        {r.bookingCode && <div style={{ marginTop: 3, ...styles.mono }}>{r.bookingCode}</div>}
                      </td>
                      <td style={styles.td}>
                        <strong>{r.customerName ?? "—"}</strong>
                        {r.customerPhone && <div style={{ marginTop: 3, color: "#6B6660", fontSize: 13 }}>{r.customerPhone}</div>}
                      </td>
                      {showClub && <td style={styles.td}>{r.clubName}</td>}
                      <td style={styles.td}>{r.courtName}</td>
                      <td style={styles.td}>
                        <strong>{formatMoney(r.amount)}</strong>
                        <div style={{ marginTop: 5 }}>
                          <Badge label={r.paymentStatus ?? "—"} tone={paymentTone(r.paymentStatus)} />
                        </div>
                      </td>
                      <td style={styles.td}>
                        {r.paidAt ? (
                          <>
                            <div style={{ color: "#28794C", fontWeight: 700, fontSize: 13 }}>Acreditado</div>
                            <div style={{ marginTop: 3, color: "#6B6660", fontSize: 13 }}>{formatDateTime(r.paidAt)}</div>
                          </>
                        ) : (
                          <span style={{ color: "#A39C8F", fontSize: 13 }}>Sin acreditar</span>
                        )}
                        {r.mpPaymentId && <div style={{ marginTop: 3, ...styles.mono }}>MP {r.mpPaymentId}</div>}
                        {reviewLabel && <div style={{ marginTop: 5 }}><Badge label={reviewLabel} tone="danger" /></div>}
                      </td>
                      <td style={styles.td}>
                        {r.refundedAt || r.refundStatus ? (
                          <>
                            <Badge
                              label={r.refundStatus === "refunded" ? "Devuelto" : r.refundStatus === "failed" ? "Falló" : r.refundStatus ?? "—"}
                              tone={r.refundStatus === "refunded" ? "refund" : r.refundStatus === "failed" ? "danger" : "pending"}
                            />
                            {r.refundedAt && <div style={{ marginTop: 3, color: "#6B6660", fontSize: 13 }}>{formatDateTime(r.refundedAt)}</div>}
                            {r.mpRefundId && <div style={{ marginTop: 3, ...styles.mono }}>MP {r.mpRefundId}</div>}
                          </>
                        ) : (
                          <span style={{ color: "#A39C8F", fontSize: 13 }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p style={{ fontSize: 12.5, color: "#928B7E", lineHeight: 1.5, margin: 0 }}>
        El dinero se acredita en la cuenta de Mercado Pago del club. El id “MP …” es el identificador del pago/devolución en Mercado Pago:
        podés buscarlo en tu cuenta de MP (Actividad) para ver el detalle oficial del movimiento.
      </p>
    </div>
  );
}
