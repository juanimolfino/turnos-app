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
