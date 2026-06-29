import type { PaymentMode } from "@/lib/db/schema";

export type PaymentAmountInput = {
  courtPrice: number | null | undefined;
  paymentMode: PaymentMode;
  depositPct: number | null | undefined;
};

export function calculateBookingPaymentAmount(input: PaymentAmountInput): number {
  const price = Math.max(0, Math.trunc(input.courtPrice ?? 0));

  if (input.paymentMode === "none") return 0;
  if (input.paymentMode === "full") return price;

  const pct = Math.min(100, Math.max(1, Math.trunc(input.depositPct ?? 25)));
  return Math.round((price * pct) / 100);
}
