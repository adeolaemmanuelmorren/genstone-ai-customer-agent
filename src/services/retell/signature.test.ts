import { describe, expect, it } from "vitest";
import { hmacSha256Hex } from "../../lib/crypto";
import { verifyRetellSignature } from "./signature";
import Retell from "retell-sdk";

describe("verifyRetellSignature", () => {
  it("accepts a current signature made from the exact raw body", async () => {
    const now = Date.now();
    const rawBody = '{"event":"call_ended"}';
    const timestamp = String(now);
    const digest = await hmacSha256Hex("test-secret", `${rawBody}${timestamp}`);

    await expect(verifyRetellSignature({
      rawBody,
      secret: "test-secret",
      signature: `v=${timestamp},d=${digest}`,
      now,
    })).resolves.toBe(true);
    await expect(
      Retell.verify(rawBody, "test-secret", `v=${timestamp},d=${digest}`),
    ).resolves.toBe(true);
  });

  it("rejects a body changed after signing", async () => {
    const now = 1_800_000_000_000;
    const timestamp = String(now);
    const digest = await hmacSha256Hex("test-secret", `{}${timestamp}`);

    await expect(verifyRetellSignature({
      rawBody: '{"changed":true}',
      secret: "test-secret",
      signature: `v=${timestamp},d=${digest}`,
      now,
    })).resolves.toBe(false);
  });

  it("rejects signatures older than five minutes", async () => {
    const now = 1_800_000_000_000;
    const timestamp = String(now - 5 * 60 * 1000 - 1);
    const digest = await hmacSha256Hex("test-secret", `{}${timestamp}`);

    await expect(verifyRetellSignature({
      rawBody: "{}",
      secret: "test-secret",
      signature: `v=${timestamp},d=${digest}`,
      now,
    })).resolves.toBe(false);
  });
});
