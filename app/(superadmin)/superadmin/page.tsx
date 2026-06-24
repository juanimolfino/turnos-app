import { getSuperadminStats, getAllClubs, getAllAdmins } from "@/lib/db/queries";

export const metadata = { title: "Super Admin · Cancha" };

const ROLE_LABEL: Record<string, string> = { superadmin: "Super Admin", admin: "Admin" };
const ROLE_STYLE: Record<string, { bg: string; color: string }> = {
  superadmin: { bg: "#F1EAF7", color: "#6B4E9E" },
  admin: { bg: "#EAF0F8", color: "#3D5C93" },
};

export default async function SuperadminPage() {
  const [stats, allClubs, allAdmins] = await Promise.all([
    getSuperadminStats(),
    getAllClubs(),
    getAllAdmins(),
  ]);

  const today = new Date().toLocaleDateString("es-AR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });

  return (
    <div className="sa-page" style={{ padding: "24px 28px 48px", display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div className="sa-header" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div className="sa-title" style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: 28, color: "#221F1B", lineHeight: 1.1 }}>
            Panel de control
          </div>
          <div style={{ fontSize: 14, color: "#928B7E", marginTop: 4, textTransform: "capitalize" }}>{today}</div>
        </div>
      </div>

      {/* KPIs */}
      <div className="sa-kpis" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {[
          { label: "Clubs registrados", value: stats.clubs, sub: "en la plataforma" },
          { label: "Canchas totales", value: stats.courts, sub: "entre todos los clubs" },
          { label: "Admins del sistema", value: stats.admins, sub: "superadmins + admins" },
        ].map(({ label, value, sub }) => (
          <div key={label} style={{ background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 14, padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "#A39C8F" }}>
              {label}
            </div>
            <div style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: 36, margin: "8px 0 4px", color: "#221F1B" }}>
              {value}
            </div>
            <div style={{ fontSize: 12.5, color: "#928B7E" }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Clubs */}
      <div style={{ background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 16, overflow: "hidden" }}>
        <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #EFEAE0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#221F1B" }}>Clubs registrados</div>
          <a href="/superadmin/clubs" style={{ fontSize: 13, color: "#C96442", fontWeight: 600, textDecoration: "none" }}>
            Ver todos →
          </a>
        </div>
        {allClubs.length === 0 ? (
          <div style={{ padding: "28px 20px", textAlign: "center", color: "#928B7E", fontSize: 14 }}>
            No hay clubs registrados aún.
          </div>
        ) : (
          <div className="sa-table-wrap"><table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F7F4EE" }}>
                {["Club", "Canchas", "Admins asignados", "Plan"].map((h) => (
                  <th key={h} style={{ padding: "10px 20px", textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "#A39C8F" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allClubs.map((club) => (
                <tr key={club.id} style={{ borderTop: "1px solid #EFEAE0" }}>
                  <td style={{ padding: "13px 20px" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#221F1B" }}>{club.name}</div>
                    <div style={{ fontSize: 12, color: "#928B7E", marginTop: 2 }}>
                      Creado {new Date(club.createdAt).toLocaleDateString("es-AR")}
                    </div>
                  </td>
                  <td style={{ padding: "13px 20px", fontSize: 14, color: "#6B6660" }}>{club.courtCount}</td>
                  <td style={{ padding: "13px 20px" }}>
                    {club.admins.length === 0 ? (
                      <span style={{ fontSize: 13, color: "#C2887A", fontWeight: 600 }}>Sin admin</span>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        {club.admins.map((a) => (
                          <span key={a.email} style={{ fontSize: 13, color: "#6B6660" }}>{a.email}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "13px 20px" }}>
                    <span style={{ background: "#E9F3EA", color: "#2F7D4E", borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 600 }}>
                      {club.plan}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>

      {/* Admins */}
      <div style={{ background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 16, overflow: "hidden" }}>
        <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid #EFEAE0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#221F1B" }}>Admins del sistema</div>
          <a href="/superadmin/admins" style={{ fontSize: 13, color: "#C96442", fontWeight: 600, textDecoration: "none" }}>
            Invitar admin →
          </a>
        </div>
        <div className="sa-table-wrap"><table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#F7F4EE" }}>
              {["Email", "Rol", "Club", "Registrado"].map((h) => (
                <th key={h} style={{ padding: "10px 20px", textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "#A39C8F" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allAdmins.map((admin) => {
              const st = ROLE_STYLE[admin.role ?? "admin"];
              return (
                <tr key={admin.id} style={{ borderTop: "1px solid #EFEAE0" }}>
                  <td style={{ padding: "12px 20px", fontSize: 14, color: "#221F1B", fontWeight: 500 }}>{admin.email}</td>
                  <td style={{ padding: "12px 20px" }}>
                    <span style={{ background: st.bg, color: st.color, borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 700 }}>
                      {ROLE_LABEL[admin.role ?? "admin"]}
                    </span>
                  </td>
                  <td style={{ padding: "12px 20px", fontSize: 13.5, color: "#6B6660" }}>
                    {admin.venueName ?? "—"}
                  </td>
                  <td style={{ padding: "12px 20px", fontSize: 13, color: "#928B7E" }}>
                    {new Date(admin.createdAt).toLocaleDateString("es-AR")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
