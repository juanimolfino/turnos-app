import Link from "next/link";
import {
  getSuperadminBotPlayerById,
  getSuperadminBotPlayerReservations,
  getSuperadminBotPlayers,
  type SuperadminBotPlayer,
  type SuperadminBotPlayerReservation,
} from "@/lib/db/queries";

export const metadata = { title: "Clientes · Super Admin" };

const pageSize = 10;

function formatDate(value: Date | string | null) {
  if (!value) return "Sin reservas";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }
  return new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function makeHref(params: Record<string, string | number | null | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && String(value).trim() !== "") search.set(key, String(value));
  });
  const qs = search.toString();
  return `/superadmin/clientes${qs ? `?${qs}` : ""}`;
}

function firstValue(values: string[], fallback = "Sin dato") {
  return values.find(Boolean) ?? fallback;
}

const styles = {
  page: {
    minHeight: "100%",
    padding: "24px 28px 96px",
    color: "#221F1B",
    display: "flex",
    flexDirection: "column" as const,
    gap: 18,
  },
  title: { fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 34, lineHeight: 1, margin: 0 },
  subtitle: { margin: "8px 0 0", color: "#6B6660", fontSize: 14, maxWidth: 760, lineHeight: 1.45 },
  searchBox: {
    background: "#FCFBF8",
    border: "1px solid #E7E1D6",
    borderRadius: 16,
    padding: 16,
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap" as const,
  },
  input: {
    flex: "1 1 280px",
    border: "1px solid #D8D1C5",
    borderRadius: 10,
    background: "#fff",
    padding: "10px 11px",
    fontSize: 14,
    fontFamily: "inherit",
    color: "#221F1B",
    outline: "none",
    minHeight: 40,
  },
  button: {
    border: "1px solid #7D61B4",
    background: "#8A6BC4",
    color: "#fff",
    borderRadius: 10,
    padding: "10px 14px",
    fontSize: 14,
    fontWeight: 700,
    fontFamily: "inherit",
    cursor: "pointer",
    minHeight: 40,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
  },
  ghost: {
    border: "1px solid #E0DACE",
    background: "#fff",
    color: "#6B6660",
    borderRadius: 10,
    padding: "9px 12px",
    fontSize: 13,
    fontWeight: 700,
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "minmax(320px, .95fr) minmax(420px, 1.35fr)",
    gap: 16,
    alignItems: "start",
  },
  panel: { background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 16, overflow: "hidden" },
  panelHeader: { padding: "15px 16px", borderBottom: "1px solid #EFEAE0", background: "#F6F1E8" },
  table: { width: "100%", borderCollapse: "collapse" as const },
  th: {
    textAlign: "left" as const,
    fontSize: 11,
    letterSpacing: ".08em",
    textTransform: "uppercase" as const,
    color: "#A39C8F",
    padding: "12px 14px",
    borderBottom: "1px solid #EFEAE0",
  },
  td: { padding: "13px 14px", borderBottom: "1px solid #EFEAE0", verticalAlign: "top" as const, fontSize: 14 },
};

export default async function SuperadminClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; player?: string; offset?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const selectedPlayerId = params.player?.trim() || null;
  const offset = Math.max(0, Number(params.offset ?? 0) || 0);

  const players = await getSuperadminBotPlayers(q);
  const selectedPlayer =
    selectedPlayerId ? await getSuperadminBotPlayerById(selectedPlayerId) : players[0] ?? null;
  const history = selectedPlayer
    ? await getSuperadminBotPlayerReservations(selectedPlayer.id, offset, pageSize)
    : { reservations: [], total: 0, limit: pageSize, offset: 0 };

  return (
    <div style={styles.page}>
      <div>
        <h1 style={styles.title}>Clientes del bot</h1>
        <p style={styles.subtitle}>
          Vista global para superadmin. Muestra identidades que usaron el bot, sus datos locales por club y el historial de reservas sin exponer esta información a los clubes entre sí.
        </p>
      </div>

      <form action="/superadmin/clientes" style={styles.searchBox}>
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por nombre, teléfono, email o id del canal"
          style={styles.input}
        />
        <button type="submit" style={styles.button}>Buscar</button>
        {q && <Link href="/superadmin/clientes" style={styles.ghost}>Limpiar</Link>}
      </form>

      <div style={styles.grid}>
        <section style={styles.panel}>
          <div style={styles.panelHeader}>
            <div style={{ fontWeight: 800 }}>Jugadores</div>
            <div style={{ marginTop: 4, fontSize: 13, color: "#6B6660" }}>{players.length} resultado{players.length === 1 ? "" : "s"}</div>
          </div>

          {players.length === 0 ? (
            <EmptyState text={q ? "No hay clientes del bot que coincidan con la búsqueda." : "Todavía no hay clientes creados por el bot."} />
          ) : (
            <div style={{ display: "grid" }}>
              {players.map((player) => (
                <PlayerRow
                  key={player.id}
                  player={player}
                  selected={selectedPlayer?.id === player.id}
                  q={q}
                />
              ))}
            </div>
          )}
        </section>

        <section style={styles.panel}>
          {selectedPlayer ? (
            <>
              <div style={styles.panelHeader}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>{firstValue(selectedPlayer.names)}</div>
                    <div style={{ marginTop: 4, fontSize: 13, color: "#6B6660" }}>
                      {selectedPlayer.channel} · {selectedPlayer.channelUserId}
                    </div>
                  </div>
                  <Badge label={`${selectedPlayer.bookingCount} reserva${selectedPlayer.bookingCount === 1 ? "" : "s"}`} />
                </div>
                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {selectedPlayer.phones.map((phone) => <Badge key={phone} label={phone} tone="neutral" />)}
                  {selectedPlayer.clubs.map((club) => <Badge key={club} label={club} tone="club" />)}
                </div>
              </div>

              <ReservationsTable reservations={history.reservations} />

              <div style={{ padding: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 13, color: "#6B6660" }}>
                  Mostrando {history.total === 0 ? 0 : history.offset + 1}-{Math.min(history.offset + history.limit, history.total)} de {history.total}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {history.offset > 0 && (
                    <Link href={makeHref({ q, player: selectedPlayer.id, offset: Math.max(0, history.offset - pageSize) })} style={styles.ghost}>
                      Anteriores 10
                    </Link>
                  )}
                  {history.offset + history.limit < history.total && (
                    <Link href={makeHref({ q, player: selectedPlayer.id, offset: history.offset + pageSize })} style={styles.button}>
                      Ver 10 más
                    </Link>
                  )}
                </div>
              </div>
            </>
          ) : (
            <EmptyState text="Seleccioná un cliente para ver su historial de reservas." />
          )}
        </section>
      </div>
    </div>
  );
}

function PlayerRow({ player, selected, q }: { player: SuperadminBotPlayer; selected: boolean; q: string }) {
  return (
    <Link
      href={makeHref({ q, player: player.id, offset: 0 })}
      style={{
        display: "grid",
        gap: 6,
        padding: "14px 16px",
        textDecoration: "none",
        color: "#221F1B",
        borderBottom: "1px solid #EFEAE0",
        background: selected ? "#F5F0FF" : "transparent",
        boxShadow: selected ? "inset 3px 0 0 #8A6BC4" : "none",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <strong>{firstValue(player.names)}</strong>
        <span style={{ fontSize: 12, color: "#8A6BC4", fontWeight: 800 }}>{player.bookingCount}</span>
      </div>
      <div style={{ fontSize: 13, color: "#6B6660" }}>
        {firstValue(player.phones, player.channelUserId)}
      </div>
      <div style={{ fontSize: 12, color: "#928B7E" }}>
        {player.clubCount} club{player.clubCount === 1 ? "" : "es"} · última: {formatDate(player.lastBookingAt)}
      </div>
    </Link>
  );
}

function ReservationsTable({ reservations }: { reservations: SuperadminBotPlayerReservation[] }) {
  if (reservations.length === 0) return <EmptyState text="Este cliente todavía no tiene reservas registradas." />;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Fecha</th>
            <th style={styles.th}>Club / cancha</th>
            <th style={styles.th}>Cliente local</th>
            <th style={styles.th}>Estado</th>
            <th style={styles.th}>Código</th>
          </tr>
        </thead>
        <tbody>
          {reservations.map((booking) => (
            <tr key={booking.id}>
              <td style={styles.td}>
                <strong>{formatDate(booking.date)}</strong>
                <div style={{ marginTop: 3, color: "#6B6660", fontSize: 13 }}>{booking.startTime} - {booking.endTime}</div>
              </td>
              <td style={styles.td}>
                <strong>{booking.clubName}</strong>
                <div style={{ marginTop: 3, color: "#6B6660", fontSize: 13 }}>{booking.courtName}</div>
              </td>
              <td style={styles.td}>
                <strong>{booking.customerName}</strong>
                {booking.customerPhone && <div style={{ marginTop: 3, color: "#6B6660", fontSize: 13 }}>{booking.customerPhone}</div>}
              </td>
              <td style={styles.td}>
                <Badge label={booking.status} tone={booking.status === "confirmado" ? "ok" : booking.status === "cancelado" ? "danger" : "pending"} />
                {booking.paymentStatus && <div style={{ marginTop: 6 }}><Badge label={booking.paymentStatus} tone="neutral" /></div>}
              </td>
              <td style={styles.td}>{booking.bookingCode ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Badge({ label, tone }: { label: string; tone?: "ok" | "danger" | "pending" | "neutral" | "club" }) {
  const palette =
    tone === "ok" ? { bg: "#EAF6EF", color: "#28794C", border: "#CBE8D6" } :
    tone === "danger" ? { bg: "#FFF6F2", color: "#B0572C", border: "#E2B8AA" } :
    tone === "pending" ? { bg: "#FFF8E6", color: "#8A6415", border: "#F0DCA5" } :
    tone === "club" ? { bg: "#F0E9FF", color: "#6B4E9E", border: "#E0D4F5" } :
    { bg: "#fff", color: "#6B6660", border: "#E7E1D6" };
  return (
    <span style={{
      display: "inline-flex",
      border: `1px solid ${palette.border}`,
      background: palette.bg,
      color: palette.color,
      borderRadius: 999,
      padding: "4px 8px",
      fontSize: 12,
      fontWeight: 800,
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ padding: "42px 18px", textAlign: "center", color: "#928B7E", fontSize: 14 }}>
      {text}
    </div>
  );
}
