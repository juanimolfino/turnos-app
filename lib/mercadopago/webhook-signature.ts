import { createHmac, timingSafeEqual } from "crypto";

function parseSignature(signature: string | null) {
  if (!signature) return null;

  const parts = Object.fromEntries(
    signature
      .split(",")
      .map((part) => part.trim().split("="))
      .filter(([key, value]) => key && value),
  );

  if (!parts.ts || !parts.v1) return null;
  return { ts: parts.ts, v1: parts.v1 };
}

export function verifyMercadoPagoWebhookSignature(input: {
  signature: string | null;
  requestId: string | null;
  dataId: string;
  secret: string;
}) {
  const parsed = parseSignature(input.signature);
  if (!parsed || !input.requestId) return false;

  const manifest = `id:${input.dataId};request-id:${input.requestId};ts:${parsed.ts};`;
  const expected = createHmac("sha256", input.secret).update(manifest).digest("hex");

  try {
    const expectedBuffer = Buffer.from(expected, "hex");
    const receivedBuffer = Buffer.from(parsed.v1, "hex");
    return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
  } catch {
    return false;
  }
}
