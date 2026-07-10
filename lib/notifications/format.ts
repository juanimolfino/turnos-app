const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * "hace X" corto para el feed de la campana. Determinístico (recibe `now` para
 * poder testearlo). Sin dependencias de i18n para no arrastrar peso al cliente.
 */
export function formatRelativeTime(from: Date | string, now: Date = new Date()): string {
  const fromMs = (from instanceof Date ? from : new Date(from)).getTime();
  const diffMs = now.getTime() - fromMs;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "recién";
  if (diffMin < 60) return `hace ${diffMin} min`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `hace ${diffHr} h`;

  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return "ayer";
  return `hace ${diffDays} días`;
}

/**
 * "sáb 12/07 20:00" a partir del date (YYYY-MM-DD) y la hora (HH:MM) de la
 * reserva. Se arma con los componentes de la fecha en horario local del club
 * (los strings ya vienen en la tz del club), sin pasar por UTC.
 */
export function formatBookingWhen(date: string, startTime: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return `${date} ${startTime}`.trim();
  const weekday = new Date(year, month - 1, day).getDay();
  const dd = String(day).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  return `${DIAS[weekday]} ${dd}/${mm} ${startTime}`.trim();
}

export { DIAS, MESES };
