import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export default function HomePage() {
  return (
    <div style={{ minHeight: "100vh", background: "radial-gradient(120% 80% at 80% -10%, #FBF0E9 0%, #F4F1EA 55%)" }}>
      {/* Nav */}
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "22px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Logo />
        <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
          <span style={{ fontSize: 14.5, color: "#6B6660" }}>Producto</span>
          <span style={{ fontSize: 14.5, color: "#6B6660" }}>Cómo funciona</span>
          <span style={{ fontSize: 14.5, color: "#6B6660" }}>Deportes</span>
          <Link href="/login" style={{
            background: "#C96442", color: "#fff", borderRadius: 10,
            padding: "10px 18px", fontWeight: 600, fontSize: 14.5,
            textDecoration: "none", boxShadow: "0 1px 3px rgba(0,0,0,.14)"
          }}>
            Ingresar
          </Link>
        </div>
      </div>

      {/* Hero */}
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "44px 32px 60px", display: "grid", gridTemplateColumns: "1.05fr .95fr", gap: 54, alignItems: "center" }}>
        <div>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "#fff", border: "1px solid #E7E1D6", borderRadius: 999,
            padding: "6px 13px", fontSize: 13, color: "#6B6660"
          }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#3E9B63", display: "inline-block" }} />
            Empezamos con pádel · pronto más deportes
          </div>
          <h1 style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontWeight: 400, fontSize: 58, lineHeight: 1.04,
            letterSpacing: "-.5px", margin: "20px 0 0", color: "#221F1B"
          }}>
            La agenda de tu club,<br />en una sola pantalla.
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.55, color: "#5C574F", maxWidth: 450, margin: "20px 0 0" }}>
            Gestioná turnos, clases, fijos y torneos de todas tus canchas. Sin planillas ni WhatsApp cruzado: mirás el día y sabés al instante qué está libre.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 30 }}>
            <Link href="/login" style={{
              background: "#C96442", color: "#fff", borderRadius: 11,
              padding: "13px 22px", fontWeight: 600, fontSize: 15,
              textDecoration: "none", boxShadow: "0 2px 8px -2px rgba(201,100,66,.5)"
            }}>
              Ingresar al panel
            </Link>
            <Link href="/dashboard" style={{
              background: "#fff", color: "#221F1B", border: "1px solid #E0DACE",
              borderRadius: 11, padding: "13px 22px", fontWeight: 600,
              fontSize: 15, textDecoration: "none"
            }}>
              Ver demo en vivo →
            </Link>
          </div>
          <div style={{ marginTop: 18, fontSize: 13, color: "#928B7E" }}>
            Sin tarjeta · Configurás tu semana en minutos
          </div>
        </div>

        {/* Padel court placeholder */}
        <div style={{
          position: "relative", aspectRatio: "4/3", borderRadius: 18, overflow: "hidden",
          background: "linear-gradient(160deg,#2F7D4E,#214f36)",
          boxShadow: "0 24px 56px -22px rgba(33,79,54,.6)",
          border: "1px solid rgba(255,255,255,.12)"
        }}>
          <div style={{ position: "absolute", top: "13%", bottom: "13%", left: "18%", right: "18%", border: "3px solid rgba(255,255,255,.82)", borderRadius: 3 }} />
          <div style={{ position: "absolute", top: "13%", bottom: "13%", left: "50%", width: 3, background: "rgba(255,255,255,.82)", transform: "translateX(-50%)" }} />
          <div style={{ position: "absolute", left: "18%", right: "18%", top: "34%", height: 2, background: "rgba(255,255,255,.55)" }} />
          <div style={{ position: "absolute", left: "18%", right: "18%", bottom: "34%", height: 2, background: "rgba(255,255,255,.55)" }} />
          <div style={{ position: "absolute", top: "13%", bottom: "13%", left: "33.5%", width: 2, background: "rgba(255,255,255,.4)" }} />
          <div style={{ position: "absolute", top: "13%", bottom: "13%", right: "33.5%", width: 2, background: "rgba(255,255,255,.4)" }} />
          <div style={{
            position: "absolute", left: 14, bottom: 14,
            background: "rgba(0,0,0,.4)", color: "rgba(255,255,255,.92)",
            fontFamily: "'Space Mono', monospace", fontSize: 11,
            padding: "5px 10px", borderRadius: 7
          }}>
            // reemplazá con foto real de la cancha
          </div>
        </div>
      </div>

      {/* Features */}
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 32px 72px", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18 }}>
        {[
          { color: "#E9F3EA", dot: "#3E9B63", title: "Vista del día en vivo", body: "Ves todas las canchas juntas y un semáforo te dice de un vistazo dónde hay lugar." },
          { color: "#F1EAF7", dot: "#8A6BC4", title: "Configurás tu semana", body: "Clases, turnos fijos y torneos se cargan una vez y se repiten solos." },
          { color: "#FBEBE2", dot: "#C96442", title: "Eventos que llenan canchas", body: "Armá americanos y torneos abiertos en dos clics y atraé más clientes." },
        ].map((f) => (
          <div key={f.title} style={{ background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 16, padding: 24 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: f.color, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
              <span style={{ width: 11, height: 11, borderRadius: "50%", background: f.dot, display: "inline-block" }} />
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>{f.title}</div>
            <div style={{ fontSize: 14.5, lineHeight: 1.5, color: "#6B6660" }}>{f.body}</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid #E7E1D6" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "22px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, color: "#928B7E" }}>
          <span>Cancha · plataforma de turnos para clubes deportivos</span>
          <span>Buenos Aires, Argentina</span>
        </div>
      </div>
    </div>
  );
}
