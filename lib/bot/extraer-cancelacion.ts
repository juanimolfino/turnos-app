import type { ChatTurn } from "@/lib/bot/brain";

export type AccionCancelacion =
  | { tipo: "ninguna" }
  | { tipo: "pedir_codigo" }
  | { tipo: "codigo_invalido" }
  | { tipo: "cancelar"; bookingCode: string };

const BOOKING_CODE_RE = /\b([A-Z]{3}[0-9]{3})\b/i;
const INVALID_CODE_TOKEN_RE = /\b(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*[0-9])[A-Z0-9]{3,8}\b/i;

function quiereCancelar(text: string): boolean {
  const normalized = text.toLowerCase();
  return /\b(cancel|cancelar|cancelo|cancelame|anular|anul[ao]|baja|dar de baja)\b/.test(normalized);
}

function rechazaCancelar(text: string): boolean {
  const normalized = text.toLowerCase();
  return /\b(no|nono|nope)\b.{0,24}\b(cancel|cancelar|cancelo|cancelame|anular|dar de baja)\b/.test(normalized);
}

function cambiaATurnoOReserva(text: string): boolean {
  const normalized = text.toLowerCase();
  return /\b(reserv|turno|turnos|cancha|canchas|jugar|juego|hay algo|disponible|disponibilidad|horario|horarios)\b/.test(normalized);
}

function botPidioCodigo(history: ChatTurn[]): boolean {
  const lastAssistant = [...history].reverse().find((turn) => turn.role === "assistant");
  if (!lastAssistant) return false;
  return /c[oó]digo/.test(lastAssistant.content.toLowerCase()) && /reserva|cancel/.test(lastAssistant.content.toLowerCase());
}

export function extraerAccionCancelacion(history: ChatTurn[]): AccionCancelacion {
  const lastUser = [...history].reverse().find((turn) => turn.role === "user");
  if (!lastUser) return { tipo: "ninguna" };

  const text = lastUser.content.trim();
  const validCode = text.match(BOOKING_CODE_RE)?.[1]?.toUpperCase();
  if (validCode) return { tipo: "cancelar", bookingCode: validCode };

  const cancelIntent = quiereCancelar(text);
  const awaitingCode = botPidioCodigo(history.slice(0, -1));
  if (rechazaCancelar(text) || (awaitingCode && !cancelIntent && cambiaATurnoOReserva(text))) {
    return { tipo: "ninguna" };
  }
  if (!cancelIntent && !awaitingCode) return { tipo: "ninguna" };

  if (INVALID_CODE_TOKEN_RE.test(text)) return { tipo: "codigo_invalido" };
  return { tipo: "pedir_codigo" };
}
