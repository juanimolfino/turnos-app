"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AdminInviteForm({ onSuccess }: { onSuccess?: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "superadmin">("admin");
  const [venueName, setVenueName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean; inviteLink?: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const res = await fetch("/api/admin/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role, venueName: role === "admin" ? venueName : undefined })
    });

    const data = await res.json();
    setLoading(false);

    if (res.ok) {
      if (data.emailSent === false && data.inviteLink) {
        setMessage({
          text: "No se pudo enviar el email automático. Copiá este link y mandáselo al usuario.",
          ok: true,
          inviteLink: data.inviteLink,
        });
        return;
      }
      setMessage({ text: `Invitación enviada a ${email}`, ok: true });
      setEmail("");
      setVenueName("");
      onSuccess?.();
    } else {
      setMessage({ text: data.error ?? "Error al enviar la invitación", ok: false });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border bg-card p-5">
      <h3 className="font-semibold">Invitar usuario</h3>
      <Input
        type="email"
        required
        placeholder="email@ejemplo.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <div className="flex gap-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="radio"
            name="role"
            value="admin"
            checked={role === "admin"}
            onChange={() => setRole("admin")}
          />
          Admin (dueño de cancha)
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="radio"
            name="role"
            value="superadmin"
            checked={role === "superadmin"}
            onChange={() => setRole("superadmin")}
          />
          Super Admin
        </label>
      </div>
      {role === "admin" && (
        <Input
          type="text"
          required
          placeholder="Nombre de la cancha de padel"
          value={venueName}
          onChange={(e) => setVenueName(e.target.value)}
        />
      )}
      <Button type="submit" disabled={loading}>
        {loading ? "Enviando..." : "Enviar invitación"}
      </Button>
      {message && (
        <div className="space-y-2">
          <p className={`text-sm ${message.ok ? "text-green-600" : "text-destructive"}`}>
            {message.text}
          </p>
          {message.inviteLink && (
            <Input
              readOnly
              value={message.inviteLink}
              onFocus={(event) => event.currentTarget.select()}
            />
          )}
        </div>
      )}
    </form>
  );
}
