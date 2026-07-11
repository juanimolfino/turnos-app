// Horario de atención del club (cuándo abre/cierra). Es la ventana que usan la
// agenda del día, la agenda semanal y la disponibilidad del bot. Modelo simple:
// una sola ventana para todos los días (per-día queda para una etapa futura).

export const DEFAULT_OPENING_WINDOW = { open: "08:00", close: "23:00" };

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseHHMM(value: string): number | null {
  const match = HHMM.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Normaliza el cierre: "24:00" (medianoche, no es una hora válida) → "23:59".
 * Deja pasar el resto tal cual para que la validación decida.
 */
export function normalizeCloseTime(value: string): string {
  return value === "24:00" ? "23:59" : value;
}

export type OpeningWindowInput = { open: string; close: string };

export type OpeningWindowValidation =
  | { ok: true; value: OpeningWindowInput }
  | { ok: false; error: string };

/**
 * Valida que abra y cierre sean horas válidas (HH:MM, 00:00–23:59) y que el
 * cierre sea posterior a la apertura. Normaliza 24:00 → 23:59 antes de validar.
 */
export function validateOpeningWindow(input: OpeningWindowInput): OpeningWindowValidation {
  const open = input.open;
  const close = normalizeCloseTime(input.close);

  const openMin = parseHHMM(open);
  const closeMin = parseHHMM(close);
  if (openMin === null || closeMin === null) {
    return { ok: false, error: "Horario inválido. Usá el formato HH:MM." };
  }
  if (closeMin <= openMin) {
    return { ok: false, error: "El cierre tiene que ser posterior a la apertura." };
  }
  return { ok: true, value: { open, close } };
}
