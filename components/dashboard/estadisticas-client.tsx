"use client";

import { useState } from "react";
import { useIsMobile } from "@/hooks/use-is-mobile";

const STAT_BARS = [
  { d: "Lun", h: 62 }, { d: "Mar", h: 78 }, { d: "Mié", h: 70 },
  { d: "Jue", h: 82 }, { d: "Vie", h: 91 }, { d: "Sáb", h: 96 }, { d: "Dom", h: 74 },
];

const FREQ = [
  { who: "Carlos M.", i: "C", turnos: "14 turnos", monto: "$182.000" },
  { who: "Sofía R.", i: "S", turnos: "9 turnos", monto: "$108.000" },
  { who: "Diego P.", i: "D", turnos: "7 turnos", monto: "$84.000" },
  { who: "Grupo Las Pibas", i: "G", turnos: "6 turnos", monto: "$96.000" },
];

type Period = "week" | "month" | "year";

const PERIOD_DATA = {
  week:  { occ: "78%", occTrend: "+6% vs semana pasada", income: "$486.000", incomeTrend: "+12% vs semana pasada", taken: 142, total: 180, free: 38 },
  month: { occ: "74%", occTrend: "+3% vs mes pasado", income: "$1.920.000", incomeTrend: "+8% vs mes pasado", taken: 587, total: 720, free: 133 },
  year:  { occ: "71%", occTrend: "+5% vs año pasado", income: "$18.400.000", incomeTrend: "+15% vs año pasado", taken: 6840, total: 8760, free: 1920 },
};

export function EstadisticasClient() {
  const [period, setPeriod] = useState<Period>("week");
  const isMobile = useIsMobile();
  const d = PERIOD_DATA[period];

  return (
    <div style={{ padding: isMobile ? "12px 14px 32px" : "24px 28px 40px", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "flex-end", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: isMobile ? 24 : 28, lineHeight: 1.1, color: "#221F1B" }}>
            Estadísticas
          </div>
          <div style={{ fontSize: 14, color: "#6B6660", marginTop: 4 }}>
            Cómo viene el club {period === "week" ? "esta semana" : period === "month" ? "este mes" : "este año"}.
          </div>
        </div>
        <div style={{ display: "inline-flex", gap: 4, background: "#EAE4D8", borderRadius: 11, padding: 4 }}>
          {(["week", "month", "year"] as Period[]).map((p) => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              background: period === p ? "#fff" : "transparent",
              color: period === p ? "#221F1B" : "#6B6660",
              boxShadow: period === p ? "0 1px 2px rgba(0,0,0,.05)" : "none",
              border: "none", borderRadius: 8, padding: isMobile ? "7px 11px" : "8px 15px",
              fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit"
            }}>
              {p === "week" ? "Semana" : p === "month" ? "Mes" : "Año"}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs — 2×2 on mobile, 4×1 on desktop */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: 10 }}>
        {[
          { label: "Ocupación", value: d.occ, trend: d.occTrend, trendGreen: true },
          { label: "Ingresos " + (period === "week" ? "semana" : period === "month" ? "mes" : "año"), value: d.income, trend: d.incomeTrend, trendGreen: true },
          { label: "Turnos tomados", value: String(d.taken), trend: `de ${d.total} disponibles`, trendGreen: false },
          { label: "Turnos libres", value: String(d.free), trend: "oportunidad de venta", trendGreen: false },
        ].map((k) => (
          <div key={k.label} style={{ background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 14, padding: isMobile ? 14 : 18 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "#A39C8F" }}>{k.label}</div>
            <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: isMobile ? 24 : 32, margin: "6px 0 2px", color: "#221F1B" }}>{k.value}</div>
            <div style={{ fontSize: 12, color: k.trendGreen ? "#2F7D4E" : "#928B7E", fontWeight: 600, lineHeight: 1.3 }}>{k.trend}</div>
          </div>
        ))}
      </div>

      {/* Chart + Clients — stacked on mobile */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.5fr 1fr", gap: 12 }}>
        <div style={{ background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 16, padding: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: "#221F1B" }}>Ocupación por día</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: isMobile ? 8 : 14, height: 160 }}>
            {STAT_BARS.map((b) => (
              <div key={b.d} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 6, height: "100%" }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: "#6B6660" }}>{b.h}%</div>
                <div style={{ width: "100%", height: `${b.h}%`, background: "linear-gradient(180deg,#4FAE73,#2F7D4E)", borderRadius: "6px 6px 0 0" }} />
                <div style={{ fontSize: 11, color: "#928B7E" }}>{b.d}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 16, padding: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, color: "#221F1B" }}>Clientes frecuentes</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {FREQ.map((cf) => (
              <div key={cf.who} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#EDE7DB", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#6B6660", fontSize: 14, flexShrink: 0 }}>
                  {cf.i}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "#221F1B" }}>{cf.who}</div>
                  <div style={{ fontSize: 12, color: "#928B7E" }}>{cf.turnos}</div>
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "#221F1B", flexShrink: 0 }}>{cf.monto}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom strip — stacked on mobile */}
      <div style={{
        background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 16, padding: 18,
        display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: isMobile ? 16 : 24
      }}>
        <div>
          <div style={{ fontSize: 12.5, color: "#928B7E" }}>Ingresos del mes</div>
          <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 24, marginTop: 4, color: "#221F1B" }}>$1.920.000</div>
        </div>
        <div style={{ borderLeft: isMobile ? "none" : "1px solid #EFEAE0", borderTop: isMobile ? "1px solid #EFEAE0" : "none", paddingLeft: isMobile ? 0 : 24, paddingTop: isMobile ? 16 : 0 }}>
          <div style={{ fontSize: 12.5, color: "#928B7E" }}>Ingresos del año</div>
          <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 24, marginTop: 4, color: "#221F1B" }}>$18.400.000</div>
        </div>
        <div style={{ borderLeft: isMobile ? "none" : "1px solid #EFEAE0", borderTop: isMobile ? "1px solid #EFEAE0" : "none", paddingLeft: isMobile ? 0 : 24, paddingTop: isMobile ? 16 : 0 }}>
          <div style={{ fontSize: 12.5, color: "#928B7E" }}>Eventos este mes</div>
          <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 24, marginTop: 4, color: "#221F1B" }}>6 americanos</div>
        </div>
      </div>
    </div>
  );
}
