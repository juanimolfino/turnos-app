"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Users, LayoutDashboard, LogOut } from "lucide-react";
import { Logo } from "@/components/ui/logo";

const NAV = [
  { href: "/superadmin", label: "Resumen", Icon: LayoutDashboard, exact: true },
  { href: "/superadmin/clubs", label: "Clubs", Icon: Building2 },
  { href: "/superadmin/admins", label: "Admins", Icon: Users },
];

export function SuperadminSidebar({ adminEmail }: { adminEmail: string }) {
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
        Super Admin
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {NAV.map(({ href, label, Icon, exact }) => {
          const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
          return (
            <Link key={href} href={href} style={{
              display: "flex", alignItems: "center", gap: 11,
              border: active ? "1px solid #E7E1D6" : "1px solid transparent",
              background: active ? "#FFFFFF" : "transparent",
              color: active ? "#221F1B" : "#6B6660",
              borderRadius: 10, padding: "10px 12px",
              fontSize: 14, fontWeight: 600, textDecoration: "none",
              transition: "background .1s"
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
            width: 34, height: 34, borderRadius: 9, background: "#F0E9FF",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 700, color: "#6B4E9E", fontSize: 12, flexShrink: 0
          }}>
            SA
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "#221F1B" }}>
              {adminEmail}
            </div>
            <div style={{ fontSize: 11, color: "#8A6BC4", fontWeight: 600 }}>
              Super Admin
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
