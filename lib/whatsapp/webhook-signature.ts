import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_PREFIX = "sha256=";

export function verifyWhatsAppSignature(input: {
  appSecret: string;
  body: string;
  signature: string | null;
}) {
  if (!input.signature?.startsWith(SIGNATURE_PREFIX)) return false;

  const expected = `${SIGNATURE_PREFIX}${createHmac("sha256", input.appSecret).update(input.body).digest("hex")}`;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(input.signature);

  if (expectedBuffer.length !== receivedBuffer.length) {
    timingSafeEqual(expectedBuffer, expectedBuffer);
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}
