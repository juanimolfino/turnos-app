export type OnboardingChecklistInput = {
  address: string | null | undefined;
  phone: string | null | undefined;
  paymentMode: "none" | "partial" | "full" | null | undefined;
  mercadoPagoConnected: boolean;
  activeCourtPrices: number[];
};

export type OnboardingItem = { label: string; done: boolean };

export type OnboardingChecklistStatus = {
  clubInfoDone: boolean;
  courtsDone: boolean;
};

export type OnboardingChecklistDetail = OnboardingChecklistStatus & {
  clubInfoItems: OnboardingItem[];
  courtsItems: OnboardingItem[];
};

function paymentItem(input: OnboardingChecklistInput): OnboardingItem {
  if (input.paymentMode === "none") return { label: "Método de pago (sin cobro online)", done: true };
  if (input.paymentMode === "partial" || input.paymentMode === "full") {
    return { label: "Mercado Pago conectado", done: input.mercadoPagoConnected };
  }
  return { label: "Método de pago", done: false };
}

/**
 * Deriva el estado del checklist de onboarding del admin a partir de datos ya
 * existentes (club, canchas activas, conexión de Mercado Pago) — sin agregar
 * columnas nuevas para trackear "completado". Devuelve también el desglose por
 * campo para mostrarlo en el hover del checklist.
 */
export function computeOnboardingDetail(input: OnboardingChecklistInput): OnboardingChecklistDetail {
  const courtsDone = input.activeCourtPrices.length > 0;
  const pricesOk = courtsDone && input.activeCourtPrices.every((price) => price > 0);
  const addressOk = Boolean(input.address);
  const phoneOk = Boolean(input.phone);
  const payment = paymentItem(input);
  const clubInfoDone = addressOk && phoneOk && pricesOk && payment.done;

  return {
    clubInfoDone,
    courtsDone,
    clubInfoItems: [
      { label: "Dirección", done: addressOk },
      { label: "Teléfono", done: phoneOk },
      { label: "Precio de las canchas", done: pricesOk },
      payment,
    ],
    courtsItems: [
      { label: "Cantidad de canchas", done: courtsDone },
    ],
  };
}

export function computeOnboardingChecklist(input: OnboardingChecklistInput): OnboardingChecklistStatus {
  const { clubInfoDone, courtsDone } = computeOnboardingDetail(input);
  return { clubInfoDone, courtsDone };
}
