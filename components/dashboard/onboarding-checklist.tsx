"use client";

interface OnboardingChecklistProps {
  open: boolean;
  onClose: () => void;
  onNavigate: () => void;
  clubInfoDone: boolean;
  courtsDone: boolean;
  step3Done: boolean;
  onAckStep3: () => void;
}

function Step({ number, title, description, done, href, cta, onNavigate }: {
  number: number; title: string; description: string; done: boolean; href: string; cta: string; onNavigate: () => void;
}) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "14px 0", borderBottom: "1px solid #EFEAE0" }}>
      <div style={{
        width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 13, fontWeight: 700,
        background: done ? "#2F7D4E" : "#EAE4D8",
        color: done ? "#fff" : "#6B6660",
      }}>
        {done ? "✓" : number}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: "#221F1B" }}>{title}</div>
        <div style={{ fontSize: 13, color: "#6B6660", marginTop: 3, lineHeight: 1.45 }}>{description}</div>
        {!done && (
          <a href={href} onClick={onNavigate} style={{
            display: "inline-block", marginTop: 8, fontSize: 13, fontWeight: 700,
            color: "#C96442", textDecoration: "none"
          }}>
            {cta} →
          </a>
        )}
      </div>
    </div>
  );
}

export function OnboardingChecklist({
  open, onClose, onNavigate, clubInfoDone, courtsDone, step3Done, onAckStep3,
}: OnboardingChecklistProps) {
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 500, background: "rgba(34,31,27,.45)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#FCFBF8", borderRadius: 18, maxWidth: 480, width: "100%",
          maxHeight: "90vh", overflowY: "auto", padding: "26px 26px 22px",
          boxShadow: "0 20px 60px rgba(0,0,0,.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 24, color: "#221F1B" }}>
              Terminemos de configurar tu club
            </div>
            <div style={{ fontSize: 13.5, color: "#6B6660", marginTop: 6, lineHeight: 1.5 }}>
              El bot reserva turnos automáticamente a partir de tu agenda. Completá estos 3 pasos
              para que la disponibilidad que ofrece sea siempre correcta.
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              width: 30, height: 30, borderRadius: 8, border: "1px solid #E7E1D6", background: "#fff",
              color: "#6B6660", cursor: "pointer", flexShrink: 0, fontSize: 16, lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ marginTop: 16 }}>
          <Step
            number={1}
            title="Cargá la información de tu club"
            description="Dirección, teléfono, precio de las canchas, método de pago (0%, seña o 100%) y, si vas a cobrar online, conectá Mercado Pago."
            done={clubInfoDone}
            href="/ajustes"
            cta="Ir a Ajustes"
            onNavigate={onNavigate}
          />
          <Step
            number={2}
            title="Definí cuántas canchas tenés"
            description="En Agenda semanal configurá la cantidad de canchas de tu club."
            done={courtsDone}
            href="/agenda"
            cta="Ir a Agenda semanal"
            onNavigate={onNavigate}
          />

          <div style={{ display: "flex", gap: 12, padding: "14px 0" }}>
            <div style={{
              width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 700,
              background: step3Done ? "#2F7D4E" : "#EAE4D8",
              color: step3Done ? "#fff" : "#6B6660",
            }}>
              {step3Done ? "✓" : 3}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: "#221F1B" }}>
                Cargá los horarios que NO están disponibles
              </div>
              <div style={{ fontSize: 13, color: "#6B6660", marginTop: 3, lineHeight: 1.45 }}>
                Clases, turnos fijos y torneos se cargan en Agenda semanal. Importante: si una franja
                horaria de una cancha no tiene nada cargado ahí, el bot la va a mostrar como
                disponible para reservar.
              </div>
              <a href="/agenda" onClick={onNavigate} style={{
                display: "inline-block", marginTop: 8, fontSize: 13, fontWeight: 700,
                color: "#C96442", textDecoration: "none",
              }}>
                Ir a Agenda semanal →
              </a>
              {!step3Done && (
                <label style={{
                  display: "flex", alignItems: "center", gap: 8, marginTop: 10,
                  fontSize: 13, color: "#6B6660", cursor: "pointer",
                }}>
                  <input type="checkbox" checked={step3Done} onChange={onAckStep3} />
                  Ya cargué mis horarios fijos (o no tengo por ahora)
                </label>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: 8, width: "100%", padding: "10px 16px", borderRadius: 10,
            border: "1px solid #E7E1D6", background: "#fff", color: "#6B6660",
            fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}
        >
          Ahora no, seguir más tarde
        </button>
      </div>
    </div>
  );
}
