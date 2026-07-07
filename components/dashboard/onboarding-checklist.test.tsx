import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OnboardingChecklist } from "./onboarding-checklist";

const noop = () => {};

describe("OnboardingChecklist", () => {
  it("no renderiza nada si open es false", () => {
    const html = renderToStaticMarkup(
      <OnboardingChecklist
        open={false}
        onClose={noop}
        clubInfoDone={false}
        courtsDone={false}
        step3Done={false}
        onAckStep3={noop}
      />,
    );
    expect(html).toBe("");
  });

  it("con todo incompleto, muestra los 3 pasos con sus CTAs y el checkbox de paso 3", () => {
    const html = renderToStaticMarkup(
      <OnboardingChecklist
        open={true}
        onClose={noop}
        clubInfoDone={false}
        courtsDone={false}
        step3Done={false}
        onAckStep3={noop}
      />,
    );
    expect(html).toContain("Cargá la información de tu club");
    expect(html).toContain("Ir a Ajustes → Mi Club");
    expect(html).toContain("Definí cuántas canchas tenés");
    expect(html).toContain("Ir a Agenda semanal");
    expect(html).toContain("el bot la va a mostrar como disponible para reservar");
    expect(html).toContain("Ya cargué mis horarios fijos");
  });

  it("con todo completo, no muestra CTAs de pasos pendientes ni el checkbox del paso 3", () => {
    const html = renderToStaticMarkup(
      <OnboardingChecklist
        open={true}
        onClose={noop}
        clubInfoDone={true}
        courtsDone={true}
        step3Done={true}
        onAckStep3={noop}
      />,
    );
    expect(html).not.toContain("Ir a Ajustes → Mi Club");
    expect(html).not.toContain("Ya cargué mis horarios fijos");
  });
});
