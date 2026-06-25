/**
 * Utilidades de fecha/hora atadas a la zona horaria del club, para que
 * "hoy" y la hora actual no dependan del reloj UTC del servidor ni del
 * navegador del usuario.
 */

const DEFAULT_TZ = "America/Argentina/Buenos_Aires";

/** Fecha de hoy (YYYY-MM-DD) en la zona horaria indicada. */
export function todayInTz(tz: string = DEFAULT_TZ): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

/** { date: YYYY-MM-DD, minutes: minutos desde medianoche } en la tz indicada. */
export function nowInTz(tz: string = DEFAULT_TZ): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const hour = get("hour") === "24" ? "00" : get("hour");
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(hour) * 60 + Number(get("minute")),
  };
}
