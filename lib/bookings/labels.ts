// Etiquetas user-facing de los tipos de booking en el panel del admin.
// 'simple' = "Reservado" (una reserva real): NO confundir con el "Libre" (verde)
// de un hueco vacío en la grilla.

export const BOOKING_TYPE_LABELS: Record<string, string> = {
  simple: "Reservado",
  clase: "Clases",
  fijo: "Turno fijo",
  americano: "Americano",
  torneo: "Torneo",
  bloqueo: "Cerrado",
  evento: "Americano", // legacy: se muestra como americano
};

export function bookingTypeLabel(type: string): string {
  return BOOKING_TYPE_LABELS[type] ?? "Cerrado";
}

export function bookingStatusLabel(status: string): string {
  if (status === "pendiente") return "Pendiente de pago";
  if (status === "confirmado") return "Confirmado";
  if (status === "cancelado") return "Cancelado";
  return status;
}

export function bookingPanelLabel(type: string, status: string): string {
  if (status === "pendiente") return bookingStatusLabel(status);
  return bookingTypeLabel(type);
}
