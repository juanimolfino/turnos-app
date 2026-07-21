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
  const normalized = lastAssistant.content.toLowerCase();
  const askedForCancelCode = /pasame|pas[aá]melo|enviame|mandame/.test(normalized) && /c[oó]digo/.test(normalized) && /cancel/.test(normalized);
  const retryAfterMissingBooking = /no encontr[eé]/.test(normalized) && /reserva/.test(normalized) && /pas[aá]melo de nuevo/.test(normalized);
  return askedForCancelCode || retryAfterMissingBooking;
}

export function extraerAccionCancelacion(history: ChatTurn[]): AccionCancelacion {
  const lastUser = [...history].reverse().find((turn) => turn.role === "user");
  if (!lastUser) return { tipo: "ninguna" };

  const text = lastUser.content.trim();
  const cancelIntent = quiereCancelar(text);
  const awaitingCode = botPidioCodigo(history.slice(0, -1));
  if (rechazaCancelar(text)) {
    return { tipo: "ninguna" };
  }
  if (!cancelIntent && !awaitingCode) return { tipo: "ninguna" };

  const validCode = text.match(BOOKING_CODE_RE)?.[1]?.toUpperCase();
  if (validCode) return { tipo: "cancelar", bookingCode: validCode };

  if (INVALID_CODE_TOKEN_RE.test(text)) return { tipo: "codigo_invalido" };
  return { tipo: "pedir_codigo" };
}
