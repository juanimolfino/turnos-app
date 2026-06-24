"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, CalendarRange, SlidersHorizontal, BarChart2, LogOut, Menu, X } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { useIsMobile } from "@/hooks/use-is-mobile";

interface SidebarProps {
  clubName: string;
  courtCount: number;
  initials: string;
}

const NAV = [
  { href: "/dashboard", label: "Agenda del día", Icon: Calendar },
  { href: "/agenda", label: "Agenda semanal", Icon: CalendarRange },
  { href: "/ajustes", label: "Ajustes", Icon: SlidersHorizontal },
  { href: "/estadisticas", label: "Estadísticas", Icon: BarChart2 },
];

export function Sidebar({ clubName, courtCount, initials }: SidebarProps) {
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  if (isMobile) {
    return (
      <>
        {/* Top bar */}
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, height: 56, zIndex: 100,
          background: "#FCFBF8", borderBottom: "1px solid #E7E1D6",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 16px", gap: 10
        }}>
          <Logo size="sm" />
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span style={{
              fontSize: 13.5, fontWeight: 600, color: "#221F1B",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160
            }}>
              {clubName}
            </span>
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="Abrir menú"
              style={{
                width: 36, height: 36, borderRadius: 9, background: "transparent",
                border: "1px solid #E0DACE", cursor: "pointer", color: "#54504A",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
              }}
            >
              <Menu size={18} />
            </button>
          </div>
        </div>

        {/* Bottom nav */}
        <nav style={{
          position: "fixed", bottom: 0, left: 0, right: 0, height: 58, zIndex: 100,
          background: "#FCFBF8", borderTop: "1px solid #E7E1D6", display: "flex"
        }}>
          {NAV.map(({ href, label, Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link key={href} href={href} style={{
                flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", gap: 3, textDecoration: "none",
                color: active ? "#C96442" : "#928B7E",
                borderTop: `2px solid ${active ? "#C96442" : "transparent"}`,
                fontSize: 10, fontWeight: 600, paddingTop: 2
              }}>
                <Icon size={20} />
                <span style={{ lineHeight: 1 }}>{
                  label === "Agenda del día" ? "Hoy"
                  : label === "Agenda semanal" ? "Semana"
                  : label === "Estadísticas" ? "Stats"
                  : label
                }</span>
              </Link>
            );
          })}
        </nav>

        {/* Drawer overlay */}
        {drawerOpen && (
          <div
            style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,.4)" }}
            onClick={() => setDrawerOpen(false)}
          >
            <div
              style={{
                position: "absolute", top: 0, left: 0, bottom: 0, width: 280,
                background: "#FCFBF8", padding: "16px 16px 24px",
                display: "flex", flexDirection: "column", overflowY: "auto"
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Drawer header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <Logo size="sm" />
                <button
                  onClick={() => setDrawerOpen(false)}
                  aria-label="Cerrar menú"
                  style={{
                    width: 34, height: 34, borderRadius: 9, background: "transparent",
                    border: "1px solid #E0DACE", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", color: "#54504A"
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Club info */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 4px 16px", borderBottom: "1px solid #EFEAE0", marginBottom: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 9, background: "#EDE7DB",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 700, color: "#6B6660", fontSize: 14, flexShrink: 0
                }}>
                  {initials}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{clubName}</div>
                  <div style={{ fontSize: 12, color: "#928B7E" }}>Plan club · {courtCount} canchas</div>
                </div>
              </div>

              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: "#A39C8F", textTransform: "uppercase", padding: "0 8px 8px" }}>
                Panel
              </div>

              {/* Nav links */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                {NAV.map(({ href, label, Icon }) => {
                  const active = pathname === href || pathname.startsWith(href + "/");
                  return (
                    <Link key={href} href={href} onClick={() => setDrawerOpen(false)} style={{
                      display: "flex", alignItems: "center", gap: 11,
                      border: active ? "1px solid #E7E1D6" : "1px solid transparent",
                      background: active ? "#FFFFFF" : "transparent",
                      color: active ? "#221F1B" : "#6B6660",
                      borderRadius: 10, padding: "10px 12px",
                      fontSize: 14, fontWeight: 600, textDecoration: "none"
                    }}>
                      <Icon size={18} />
                      {label}
                    </Link>
                  );
                })}
              </div>

              {/* Logout */}
              <div style={{ borderTop: "1px solid #EEE9DF", paddingTop: 14 }}>
                <form action="/logout" method="post">
                  <button type="submit" style={{
                    display: "flex", alignItems: "center", gap: 9, width: "100%",
                    border: "1px solid #E7E1D6", background: "#fff", color: "#6B6660",
                    borderRadius: 10, padding: "9px 12px", fontSize: 13.5,
                    fontWeight: 600, cursor: "pointer", fontFamily: "inherit"
                  }}>
                    <LogOut size={16} />
                    Cerrar sesión
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // Desktop sidebar
  return (
    <div style={{
      width: 248, flexShrink: 0, background: "#FCFBF8",
      borderRight: "1px solid #E7E1D6", display: "flex",
      flexDirection: "column", padding: "20px 16px"
    }}>
      <div style={{ padding: "4px 8px 22px" }}>
        <Logo size="sm" />
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", color: "#A39C8F", textTransform: "uppercase", padding: "0 8px 8px" }}>
        Panel
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {NAV.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link key={href} href={href} style={{
              display: "flex", alignItems: "center", gap: 11,
              border: active ? "1px solid #E7E1D6" : "1px solid transparent",
              background: active ? "#FFFFFF" : "transparent",
              color: active ? "#221F1B" : "#6B6660",
              borderRadius: 10, padding: "10px 12px",
              fontSize: 14, fontWeight: 600, cursor: "pointer",
              textDecoration: "none", transition: "background .1s"
            }}>
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ borderTop: "1px solid #EEE9DF", paddingTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 4px 12px" }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9, background: "#EDE7DB",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 700, color: "#6B6660", fontSize: 14, flexShrink: 0
          }}>
            {initials}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {clubName}
            </div>
            <div style={{ fontSize: 12, color: "#928B7E" }}>
              Plan club · {courtCount} canchas
            </div>
          </div>
        </div>
        <form action="/logout" method="post">
          <button type="submit" style={{
            display: "flex", alignItems: "center", gap: 9, width: "100%",
            border: "1px solid #E7E1D6", background: "#fff", color: "#6B6660",
            borderRadius: 10, padding: "9px 12px", fontSize: 13.5,
            fontWeight: 600, cursor: "pointer", fontFamily: "inherit"
          }}>
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}
