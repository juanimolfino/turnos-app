export type OnboardingChecklistInput = {
  address: string | null | undefined;
  phone: string | null | undefined;
  paymentMode: "none" | "partial" | "full" | null | undefined;
  mercadoPagoConnected: boolean;
  activeCourtPrices: number[];
};

export type OnboardingChecklistStatus = {
  clubInfoDone: boolean;
  courtsDone: boolean;
};

/**
 * Deriva el estado del checklist de onboarding del admin a partir de datos ya
 * existentes (club, canchas activas, conexión de Mercado Pago) — sin agregar
 * columnas nuevas para trackear "completado".
 */
export function computeOnboardingChecklist(input: OnboardingChecklistInput): OnboardingChecklistStatus {
  const courtsDone = input.activeCourtPrices.length > 0;
  const pricesOk = courtsDone && input.activeCourtPrices.every((price) => price > 0);
  const paymentOk = input.paymentMode === "none" || input.mercadoPagoConnected;
  const clubInfoDone = Boolean(input.address) && Boolean(input.phone) && pricesOk && paymentOk;

  return { clubInfoDone, courtsDone };
}
