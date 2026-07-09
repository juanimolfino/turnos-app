import type { ChatTurn } from "@/lib/bot/brain";
import type { Intent } from "@/lib/bot/intent";
import type { LugarDisponibilidad } from "@/lib/bot/search";

// Respuesta determinística de disponibilidad: enumera los turnos reales que
// devuelve la búsqueda, sin resumir ni inventar horarios. Agnóstico al canal.

// ── Validación de horarios (anti-invención) ──────────────────────────────────
function normHora(t: string): string {
  const [h, m] = t.split(":");
  return `${h.padStart(2, "0")}:${m}`;
}

function fechaHumana(date: string | null): string {
  if (!date) return "ese día";
  try {
    return new Date(`${date}T12:00:00`).toLocaleDateString("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  } catch {
    return date;
  }
}

function joinNatural(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} y ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`;
}

export function formatearDisponibilidadTexto(intent: Intent, lugares: LugarDisponibilidad[]): string {
  const fecha = fechaHumana(intent.date);
  const horaPedida = intent.time ? normHora(intent.time) : null;
  const dondePedido = intent.club ? ` en ${intent.club}` : "";

  if (lugares.length === 0) {
    if (horaPedida) {
      return `Disculpá, no tengo un turno a las ${horaPedida} de ${fecha}${dondePedido}. ¿Querés que busque en otro horario o en otro día?`;
    }
    return `Para ${fecha} no encontré turnos disponibles. Si querés, busco otro día u otra franja.`;
  }

  // ¿Pidió una hora puntual que no coincide con ningún turno libre? Entonces
  // avisamos que a esa hora no hay y ofrecemos las opciones reales que sí tenemos.
  const hayHoraExacta = horaPedida
    ? lugares.some((lugar) => lugar.slots.some((slot) => normHora(slot.start) === horaPedida))
    : true;

  const lines = [
    horaPedida && !hayHoraExacta
      ? `Disculpá, a las ${horaPedida} de ${fecha} no tengo un turno libre${dondePedido}, pero estas son las opciones que sí tengo:`
      : `Para ${fecha}, tenés estos turnos disponibles:`,
  ];

  for (const lugar of lugares) {
    lines.push("");
    lines.push(`En ${lugar.lugar}${lugar.barrio ? `, ${lugar.barrio}` : ""}:`);

    const byCourts = new Map<string, { courtNames: string[]; starts: string[] }>();
    for (const slot of lugar.slots) {
      const courtNames = slot.canchas.map((cancha) => cancha.name);
      const key = courtNames.join("|");
      const existing = byCourts.get(key);
      if (existing) {
        existing.starts.push(slot.start);
      } else {
        byCourts.set(key, { courtNames, starts: [slot.start] });
      }
    }

    for (const group of byCourts.values()) {
      lines.push(`- ${joinNatural(group.courtNames)} a las ${joinNatural(group.starts)}.`);
    }
  }

  lines.push("");
  lines.push("Decime cuál querés y te ayudo con la reserva.");
  return lines.join("\n");
}

/** Horarios que el bot PUEDE nombrar: los start/end reales de cada slot, más la
 * hora que el usuario pidió (puede mencionarla para decir "a esa hora no hay"). */
export function horariosPermitidos(lugares: LugarDisponibilidad[], horaPedida: string | null): Set<string> {
  const set = new Set<string>();
  for (const lugar of lugares) {
    for (const s of lugar.slots) {
      set.add(normHora(s.start));
      set.add(normHora(s.end));
    }
  }
  if (horaPedida) set.add(normHora(horaPedida));
  return set;
}

/** Devuelve los horarios HH:MM que aparecen en el texto pero NO están permitidos
 * (inventados/interpolados por el modelo). Vacío = la respuesta solo usa datos reales. */
export function horariosInventados(text: string, lugares: LugarDisponibilidad[], horaPedida: string | null): string[] {
  const permitidos = horariosPermitidos(lugares, horaPedida);
  const encontrados = (text.match(/\b\d{1,2}:\d{2}\b/g) ?? []).map(normHora);
  return [...new Set(encontrados)].filter((t) => !permitidos.has(t));
}

export async function redactarRespuesta(input: {
  history: ChatTurn[];
  userText: string;
  intent: Intent;
  lugares: LugarDisponibilidad[];
}): Promise<string> {
  return formatearDisponibilidadTexto(input.intent, input.lugares);
}
