export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const boxSize = size === "sm" ? 24 : size === "lg" ? 36 : 30;
  const ballSize = size === "sm" ? 8 : size === "lg" ? 13 : 11;
  const fontSize = size === "sm" ? 18 : size === "lg" ? 28 : 24;
  const radius = size === "sm" ? 7 : size === "lg" ? 10 : 9;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <div style={{
        width: boxSize, height: boxSize, borderRadius: radius,
        background: "#C96442", display: "flex", alignItems: "center",
        justifyContent: "center", boxShadow: "0 1px 3px rgba(0,0,0,.18)", flexShrink: 0
      }}>
        <div style={{ width: ballSize, height: ballSize, borderRadius: "50%", background: "#fff" }} />
      </div>
      <span style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize, letterSpacing: ".2px", lineHeight: 1 }}>
        Cancha
      </span>
    </div>
  );
}
