export const DEFAULT_PLATFORM_FEE_PCT = 0;

export function getPlatformFeePct(
  env?: { PLATFORM_FEE_PCT?: string },
): number {
  const raw = (env ?? process.env).PLATFORM_FEE_PCT;
  if (raw == null || raw.trim() === "") return DEFAULT_PLATFORM_FEE_PCT;

  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error("PLATFORM_FEE_PCT must be a number between 0 and 100");
  }
  return value;
}

export function calculateMarketplaceFee(amount: number, feePct = getPlatformFeePct()): number {
  if (feePct <= 0 || amount <= 0) return 0;
  return Math.round((amount * feePct) / 100);
}
