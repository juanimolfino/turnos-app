"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, SlidersHorizontal, BarChart2, LogOut } from "lucide-react";
import { Logo } from "@/components/ui/logo";

interface SidebarProps {
  clubName: string;
  courtCount: number;
  initials: string;
}

const NAV = [
  { href: "/dashboard", label: "Agenda del día", Icon: Calendar },
  { href: "/ajustes", label: "Ajustes", Icon: SlidersHorizontal },
  { href: "/estadisticas", label: "Estadísticas", Icon: BarChart2 },
];

export function Sidebar({ clubName, courtCount, initials }: SidebarProps) {
  const pathname = usePathname();

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
