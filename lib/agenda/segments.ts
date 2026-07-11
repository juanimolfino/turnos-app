export type AgendaBoundsBlock = { startTime: string; endTime: string };
export type OpeningWindow = { open: string; close: string };

/**
 * Calcula los límites (bordes) de las franjas de la "Agenda del día" a partir de
 * los bloques del día y la ventana de apertura del club.
 *
 * Regla clave: los bordes de apertura/cierre sirven para mostrar los tramos
 * LIBRES antes del primer bloque y después del último, pero NO deben partir un
 * bloque que los cruza. Ej: turno fijo 22:00–23:30 con cierre 23:00 → el 23:00
 * NO es un límite (cae dentro del bloque), así que el turno se muestra entero y
 * no se duplica en dos franjas (22:00–23:00 y 23:00–23:30).
 *
 * Los bordes de los bloques siempre cuentan (incluso si caen dentro de otro
 * bloque de otra cancha, en la vista "Todas"): así cada bloque se segmenta bien.
 */
export function computeAgendaBounds(
  blocks: AgendaBoundsBlock[],
  openingWindow: OpeningWindow,
): string[] {
  const blockBounds = blocks.flatMap((b) => [b.startTime, b.endTime]);

  const isInteriorToBlock = (t: string) =>
    blocks.some((b) => b.startTime < t && t < b.endTime);

  // La apertura/cierre solo entran como límite si no caen dentro de un bloque.
  const windowBounds = [openingWindow.open, openingWindow.close].filter(
    (t) => !isInteriorToBlock(t),
  );

  return Array.from(new Set([...windowBounds, ...blockBounds])).sort();
}
