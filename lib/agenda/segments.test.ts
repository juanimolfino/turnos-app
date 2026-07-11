import { describe, expect, it } from "vitest";
import { computeAgendaBounds } from "./segments";

const WINDOW = { open: "08:00", close: "23:00" };

describe("computeAgendaBounds", () => {
  it("REGRESIÓN: un turno fijo que cruza el cierre (22:00–23:30) NO se parte en 23:00", () => {
    const blocks = [
      { startTime: "08:00", endTime: "13:00" }, // clase
      { startTime: "22:00", endTime: "23:30" }, // turno fijo giorgina
    ];
    const bounds = computeAgendaBounds(blocks, WINDOW);
    // 23:00 (cierre) NO debe aparecer: cae dentro del turno fijo.
    expect(bounds).not.toContain("23:00");
    // El día va de 08:00 a 23:30, con hueco libre 13:00–22:00.
    expect(bounds).toEqual(["08:00", "13:00", "22:00", "23:30"]);
  });

  it("muestra tramo libre antes del primer bloque y después del último (dentro de la ventana)", () => {
    const blocks = [{ startTime: "10:00", endTime: "12:00" }];
    const bounds = computeAgendaBounds(blocks, WINDOW);
    // 08:00 (apertura) y 23:00 (cierre) sí entran: no caen dentro de ningún bloque.
    expect(bounds).toEqual(["08:00", "10:00", "12:00", "23:00"]);
  });

  it("un bloque que empieza antes de la apertura no se parte en la apertura", () => {
    const blocks = [{ startTime: "07:00", endTime: "09:00" }];
    const bounds = computeAgendaBounds(blocks, WINDOW);
    expect(bounds).not.toContain("08:00");
    expect(bounds).toEqual(["07:00", "09:00", "23:00"]);
  });

  it("conserva bordes de bloques que caen dentro de otro bloque (vista Todas, varias canchas)", () => {
    const blocks = [
      { startTime: "22:00", endTime: "23:30" }, // cancha 1
      { startTime: "22:30", endTime: "23:00" }, // cancha 2, interior al de cancha 1
    ];
    const bounds = computeAgendaBounds(blocks, WINDOW);
    // Los bordes 22:30 y 23:00 SÍ deben estar (son bordes de bloque), para poder
    // segmentar la cancha 2 aunque queden dentro del bloque de la cancha 1.
    expect(bounds).toContain("22:30");
    expect(bounds).toContain("23:00");
    // Incluye la apertura 08:00 (tramo libre hasta el primer bloque a las 22:00).
    expect(bounds).toEqual(["08:00", "22:00", "22:30", "23:00", "23:30"]);
  });

  it("sin bloques: la grilla es solo la ventana de apertura", () => {
    expect(computeAgendaBounds([], WINDOW)).toEqual(["08:00", "23:00"]);
  });
});
