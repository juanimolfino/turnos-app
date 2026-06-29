const messages = {
  success: {
    title: "¡Pago recibido!",
    text: "Volvé a Telegram: te mandamos la confirmación ahí.",
  },
  pending: {
    title: "Pago pendiente",
    text: "Mercado Pago todavía está procesando el pago. Volvé a Telegram; cuando se confirme, te avisamos ahí.",
  },
  failure: {
    title: "No se pudo completar el pago",
    text: "Volvé a Telegram para intentar de nuevo o elegir otro turno.",
  },
};

export default async function PaymentResultPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const message = status === "success" || status === "pending" || status === "failure"
    ? messages[status]
    : messages.pending;

  return (
    <main style={{
      minHeight: "100vh",
      display: "grid",
      placeItems: "center",
      padding: 24,
      background: "#f6f7f9",
      color: "#111827",
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <section style={{
        width: "100%",
        maxWidth: 440,
        border: "1px solid #d9dde5",
        borderRadius: 8,
        background: "#ffffff",
        padding: 28,
        boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
      }}>
        <h1 style={{ margin: "0 0 12px", fontSize: 28, lineHeight: 1.15 }}>{message.title}</h1>
        <p style={{ margin: 0, color: "#4b5563", fontSize: 16, lineHeight: 1.5 }}>{message.text}</p>
      </section>
    </main>
  );
}
