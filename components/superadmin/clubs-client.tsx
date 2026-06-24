"use client";

import { useState } from "react";
import { CreateClubForm } from "./create-club-form";

interface Club {
  id: string;
  name: string;
  plan: string;
  createdAt: Date;
  courtCount: number;
  admins: { email: string | null; role: string | null }[];
}

export function ClubsClient({ clubs }: { clubs: Club[] }) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div style={{ padding: "24px 28px 48px", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: 28, color: "#221F1B" }}>Clubs</div>
          <div style={{ fontSize: 14, color: "#6B6660", marginTop: 4 }}>
            {clubs.length} club{clubs.length !== 1 ? "s" : ""} registrado{clubs.length !== 1 ? "s" : ""}
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          style={{
            background: "#C96442", color: "#fff", border: "none",
            borderRadius: 10, padding: "10px 18px", fontWeight: 600, fontSize: 14,
            cursor: "pointer", fontFamily: "inherit", boxShadow: "0 2px 8px -2px rgba(201,100,66,.5)"
          }}
        >
          + Nuevo club
        </button>
      </div>

      {/* Grid de clubs */}
      {clubs.length === 0 ? (
        <div style={{
          background: "#FCFBF8", border: "1px dashed #CFC8B9", borderRadius: 16,
          padding: "48px 24px", textAlign: "center", color: "#928B7E"
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🏓</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#6B6660", marginBottom: 6 }}>No hay clubs aún</div>
          <div style={{ fontSize: 14 }}>Creá el primer club para empezar.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
          {clubs.map((club) => (
            <ClubCard key={club.id} club={club} />
          ))}
        </div>
      )}

      {showForm && <CreateClubForm onClose={() => setShowForm(false)} />}
    </div>
  );
}

function ClubCard({ club }: { club: Club }) {
  const initials = club.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div style={{
      background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 16,
      padding: 20, display: "flex", flexDirection: "column", gap: 14
    }}>
      {/* Club header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, background: "#EDE7DB",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 700, color: "#6B6660", fontSize: 15, flexShrink: 0
        }}>
          {initials}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#221F1B" }}>{club.name}</div>
          <div style={{ fontSize: 12, color: "#928B7E", marginTop: 2 }}>
            Creado {new Date(club.createdAt).toLocaleDateString("es-AR")}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div style={{ background: "#F4F1EA", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontSize: 11, color: "#928B7E", fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase" }}>Canchas</div>
          <div style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: 22, color: "#221F1B", marginTop: 2 }}>
            {club.courtCount}
          </div>
        </div>
        <div style={{ background: "#F4F1EA", borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontSize: 11, color: "#928B7E", fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase" }}>Plan</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#2F7D4E", marginTop: 4 }}>{club.plan}</div>
        </div>
      </div>

      {/* Admins */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#A39C8F", marginBottom: 8 }}>
          Admins
        </div>
        {club.admins.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "#FFF5F3", border: "1px solid #F2D6C5", borderRadius: 10 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#C2887A", flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: "#9A5E4C", fontWeight: 600 }}>Sin admin asignado</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {club.admins.map((a) => (
              <div key={a.email} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#F4F1EA", borderRadius: 9 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: "50%", background: "#EDE7DB",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 700, color: "#6B6660", fontSize: 11, flexShrink: 0
                }}>
                  {(a.email ?? "?")[0].toUpperCase()}
                </div>
                <span style={{ fontSize: 13, color: "#221F1B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.email}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
