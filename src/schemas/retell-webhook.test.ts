import { describe, expect, it } from "vitest";
import { normalizeRetellWebhook } from "./retell-webhook";

describe("normalizeRetellWebhook", () => {
  it("keeps transfer event type separate from call status", () => {
    const event = normalizeRetellWebhook({
      event: "transfer_started",
      call: { call_id: "call-1" },
    });

    expect(event.eventType).toBe("transfer_started");
    expect(event.callStatus).toBeUndefined();
  });

  it("extracts searchable post-call analysis", () => {
    const event = normalizeRetellWebhook({
      event: "call_analyzed",
      call: {
        call_id: "call-1",
        call_analysis: {
          custom_analysis_data: {
            primary_route: "existing_order",
            call_outcome: "support_follow_up",
            order_verified: true,
            capability_gap_summary: "Unsupported request",
          },
        },
      },
    });

    expect(event).toMatchObject({
      primaryRoute: "existing_order",
      callOutcome: "support_follow_up",
      orderVerified: true,
      capabilityGapSummary: "Unsupported request",
    });
  });
});
