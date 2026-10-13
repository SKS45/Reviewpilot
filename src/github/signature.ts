import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies GitHub's `X-Hub-Signature-256` header against the raw request body.
 * Must be computed over the exact bytes received, never over re-serialised JSON.
 */
export function verifySignature(secret: string, rawBody: Buffer | string, header: string | undefined): boolean {
  const prefix = "sha256=";
  if (!header || !header.startsWith(prefix)) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const received = Buffer.from(header.slice(prefix.length), "hex");

  // timingSafeEqual throws on length mismatch, and a non-hex header decodes short.
  return received.length === expected.length && timingSafeEqual(received, expected);
}
