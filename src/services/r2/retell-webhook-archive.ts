import { sha256Hex } from "../../lib/crypto";

export interface WebhookArchive {
  objectKey: string;
  sha256: string;
  sizeBytes: number;
}

export async function describeWebhookArchive(options: {
  rawBody: string;
  callId?: string;
  providerEventId?: string;
  now?: Date;
}): Promise<WebhookArchive> {
  const sha256 = await sha256Hex(options.rawBody);
  const date = options.now ?? new Date();
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const callId = sanitizeKeyPart(options.callId ?? "unknown-call");
  const eventId = sanitizeKeyPart(options.providerEventId ?? sha256);

  return {
    objectKey: `retell/webhooks/${year}/${month}/${callId}/${eventId}.json`,
    sha256,
    sizeBytes: new TextEncoder().encode(options.rawBody).byteLength,
  };
}

export async function archiveRetellWebhook(
  bucket: R2Bucket,
  rawBody: string,
  archive: WebhookArchive,
): Promise<void> {
  await bucket.put(archive.objectKey, rawBody, {
    httpMetadata: { contentType: "application/json" },
    customMetadata: { sha256: archive.sha256 },
  });
}

function sanitizeKeyPart(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 160);
  return sanitized || "unknown";
}
