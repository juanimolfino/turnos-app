import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OnboardingChecklist } from "./onboarding-checklist";
import type { OnboardingItem } from "@/lib/onboarding/checklist";

const noop = () => {};

const clubInfoItems: OnboardingItem[] = [
  { label: "Dirección", done: false },
  { label: "Teléfono", done: true },
  { label: "Precio de las canchas", done: false },
  { label: "Método de pago (sin cobro online)", done: true },
];
const courtsItems: OnboardingItem[] = [{ label: "Cantidad de canchas", done: false }];

describe("OnboardingChecklist", () => {
  it("no renderiza nada si open es false", () => {
    const html = renderToStaticMarkup(
      <OnboardingChecklist
        open={false}
        onClose={noop}
        onNavigate={noop}
        clubInfoDone={false}
        courtsDone={false}
        clubInfoItems={clubInfoItems}
        courtsItems={courtsItems}
        step3Done={false}
        onAckStep3={noop}
      />,
    );
    expect(html).toBe("");
  });

  it("con todo incompleto, muestra los 3 pasos, sus CTAs y el disparador de detalle", () => {
    const html = renderToStaticMarkup(
      <OnboardingChecklist
        open={true}
        onClose={noop}
        onNavigate={noop}
        clubInfoDone={false}
        courtsDone={false}
        clubInfoItems={clubInfoItems}
        courtsItems={courtsItems}
        step3Done={false}
        onAckStep3={noop}
      />,
    );
    expect(html).toContain("Cargá la información de tu club");
    expect(html).toContain("Ir a Ajustes");
    expect(html).toContain("Definí cuántas canchas tenés");
    expect(html).toContain("Ir a Agenda semanal");
    expect(html).toContain("el bot la va a mostrar como disponible para reservar");
    expect(html).toContain("Ya cargué mis horarios fijos");
    // El desglose por campo se accede desde el disparador de detalle.
    expect(html).toContain("Ver detalle");
  });

  it("con todo completo, no muestra CTAs de pasos pendientes ni el checkbox del paso 3", () => {
    const html = renderToStaticMarkup(
      <OnboardingChecklist
        open={true}
        onClose={noop}
        onNavigate={noop}
        clubInfoDone={true}
        courtsDone={true}
        clubInfoItems={clubInfoItems.map((i) => ({ ...i, done: true }))}
        courtsItems={courtsItems.map((i) => ({ ...i, done: true }))}
        step3Done={true}
        onAckStep3={noop}
      />,
    );
    expect(html).not.toContain("Ir a Ajustes");
    expect(html).not.toContain("Ya cargué mis horarios fijos");
  });
});
