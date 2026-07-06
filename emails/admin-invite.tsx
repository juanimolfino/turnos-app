import * as React from "react";

export function AdminInviteEmail(input: {
  inviteLink: string;
  role: "admin" | "superadmin";
  venueName?: string;
}) {
  const roleLabel = input.role === "superadmin" ? "superadmin" : "admin";
  return (
    <html>
      <body>
        <h1>Te invitaron a Cancha</h1>
        <p>
          Creá tu contraseña para entrar como {roleLabel}
          {input.venueName ? ` de ${input.venueName}` : ""}.
        </p>
        <p>
          <a href={input.inviteLink}>Crear mi cuenta</a>
        </p>
        <p>Si el botón no funciona, copiá y pegá este enlace en el navegador:</p>
        <p>{input.inviteLink}</p>
      </body>
    </html>
  );
}
