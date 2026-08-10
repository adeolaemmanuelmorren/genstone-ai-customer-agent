import { describe, expect, it } from "vitest";
import { describeWebhookArchive } from "./retell-webhook-archive";

describe("describeWebhookArchive", () => {
  it("uses an opaque deterministic key and exact UTF-8 size", async () => {
    const archive = await describeWebhookArchive({
      rawBody: '{"customer":"José"}',
      callId: "call_123",
      providerEventId: "event_456",
      now: new Date("2026-08-08T10:00:00.000Z"),
    });

    expect(archive.objectKey).toBe(
      "retell/webhooks/2026/08/call_123/event_456.json",
    );
    expect(archive.objectKey).not.toContain("José");
    expect(archive.sizeBytes).toBe(new TextEncoder().encode('{"customer":"José"}').byteLength);
    expect(archive.sha256).toHaveLength(64);
  });
});
