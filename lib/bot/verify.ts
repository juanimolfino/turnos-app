import { timingSafeEqual } from "node:crypto";

// Comparación de secretos en tiempo constante. timingSafeEqual exige buffers de
// igual largo, así que normalizamos longitudes manteniendo el comportamiento
// constante (no cortocircuitamos por diferencia de longitud).
export function secretMatches(expected: string, got: string | null): boolean {
  if (!got) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  if (a.length !== b.length) {
    timingSafeEqual(a, a); // comparación dummy para no filtrar la longitud por timing
    return false;
  }
  return timingSafeEqual(a, b);
}
