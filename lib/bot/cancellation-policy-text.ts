import type { PaymentMode } from "@/lib/db/schema";

export type CancellationPolicyTextInput = {
  paymentMode: PaymentMode;
  refundEnabled: boolean;
  refundCutoffHours: number;
};

export function cancellationPolicyText(input: CancellationPolicyTextInput): string {
  if (input.paymentMode === "none") {
    return 'Si necesitás cancelar, escribime "cancelar" y tu código de reserva.';
  }

  const pago = input.paymentMode === "partial" ? "seña" : "pago";
  if (input.refundEnabled) {
    return `Podés cancelar hasta ${input.refundCutoffHours} horas antes para recuperar tu ${pago}.`;
  }

  return `Esta reserva no admite devolución de la ${pago} si cancelás.`;
}
