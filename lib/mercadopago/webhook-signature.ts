import { createHmac, timingSafeEqual } from "crypto";

function parseSignature(signature: string | null) {
  if (!signature) return null;

  const parts: Record<string, string> = {};
  for (const part of signature.split(",")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key && value) parts[key] = value;
  }

  if (!parts.ts || !parts.v1) return null;
  return { ts: parts.ts, v1: parts.v1 };
}

export function inspectMercadoPagoWebhookSignature(input: {
  signature: string | null;
  requestId: string | null;
  dataId: string;
  secret: string;
}) {
  const parsed = parseSignature(input.signature);
  if (!parsed) return { valid: false, reason: "missing_signature_parts" as const };
  if (!input.requestId) return { valid: false, reason: "missing_request_id" as const };

  const manifest = `id:${input.dataId};request-id:${input.requestId};ts:${parsed.ts};`;
  const expected = createHmac("sha256", input.secret.trim()).update(manifest).digest("hex");

  try {
    const expectedBuffer = Buffer.from(expected, "hex");
    const receivedBuffer = Buffer.from(parsed.v1, "hex");
    const valid = expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
    return { valid, manifest, receivedV1: parsed.v1, expectedHash: expected };
  } catch {
    return { valid: false, manifest, receivedV1: parsed.v1, expectedHash: expected, reason: "invalid_v1_format" as const };
  }
}

export function verifyMercadoPagoWebhookSignature(input: {
  signature: string | null;
  requestId: string | null;
  dataId: string;
  secret: string;
}) {
  return inspectMercadoPagoWebhookSignature(input).valid;
}
