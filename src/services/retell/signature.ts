import { hmacSha256Hex, timingSafeEqual } from "../../lib/crypto";

const SIGNATURE_PATTERN = /^v=(\d+),d=([a-f0-9]+)$/iu;
const MAX_SIGNATURE_AGE_MS = 5 * 60 * 1000;

export async function verifyRetellSignature(options: {
  rawBody: string;
  secret: string | undefined;
  signature: string | undefined;
  now?: number;
}): Promise<boolean> {
  if (!options.secret || !options.signature) {
    return false;
  }

  const match = SIGNATURE_PATTERN.exec(options.signature);
  if (!match) {
    return false;
  }

  const timestamp = Number(match[1]);
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const now = options.now ?? Date.now();
  if (Math.abs(now - timestamp) > MAX_SIGNATURE_AGE_MS) {
    return false;
  }

  const expectedDigest = await hmacSha256Hex(
    options.secret,
    `${options.rawBody}${match[1]}`,
  );

  return timingSafeEqual(expectedDigest, match[2].toLowerCase());
}
