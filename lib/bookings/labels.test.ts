import { describe, expect, it } from "vitest";
import { bookingTypeLabel } from "@/lib/bookings/labels";

describe("bookingTypeLabel", () => {
  it("muestra 'Reservado' para type='simple' (no 'Turno libre')", () => {
    expect(bookingTypeLabel("simple")).toBe("Reservado");
    expect(bookingTypeLabel("simple")).not.toBe("Turno libre");
  });

  it("mantiene las etiquetas del resto de los tipos", () => {
    expect(bookingTypeLabel("clase")).toBe("Clases");
    expect(bookingTypeLabel("fijo")).toBe("Turno fijo");
    expect(bookingTypeLabel("americano")).toBe("Americano");
    expect(bookingTypeLabel("torneo")).toBe("Torneo");
    expect(bookingTypeLabel("bloqueo")).toBe("Cerrado");
  });

  it("tipo desconocido → fallback 'Cerrado'", () => {
    expect(bookingTypeLabel("loquesea")).toBe("Cerrado");
  });
});
