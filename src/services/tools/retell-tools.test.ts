import { describe, expect, it } from "vitest";
import {
  isGenstoneBusinessOpen,
  isValidCallbackDateTime,
  resolveEmployeeLookup,
  resolveSupportRequesterEmail,
  summarizeShipment,
} from "./retell-tools";
import {
  CUSTOMERIO_MESSAGES,
  resolveShipmentEmailRecipient,
} from "../customerio/config";
import {
  callbackScheduleSchema,
  contactLookupSchema,
  orderLookupSchema,
  prospectFollowUpSchema,
  shipmentEmailSchema,
  supportFollowUpSchema,
  verifiedOrderSchema,
} from "../../schemas/retell-tools";

const NOW = new Date("2026-08-07T18:00:00.000Z");

describe("named employee lookup", () => {
  const travis = {
    id: "005-travis",
    name: "Travis McCarthy",
    phone: "+13035550101",
  };

  it("accepts one unique eligible result for a first-name search", () => {
    expect(resolveEmployeeLookup([travis], "Travis")).toEqual({
      ok: true,
      result_code: "found",
      safe_summary: "A unique active employee was found.",
      data: {
        employee_name: "Travis McCarthy",
        transfer_destination: "+13035550101",
      },
    });
  });

  it("uses one exact full-name match when a broad search returns several users", () => {
    expect(resolveEmployeeLookup([
      travis,
      {
        id: "005-travis-two",
        name: "Travis Miller",
        phone: "+13035550102",
      },
    ], "Travis McCarthy")).toHaveProperty("result_code", "found");
  });

  it("reports ambiguity when a partial name matches several eligible users", () => {
    expect(resolveEmployeeLookup([
      travis,
      {
        id: "005-travis-two",
        name: "Travis Miller",
        phone: "+13035550102",
      },
    ], "Travis")).toHaveProperty("result_code", "ambiguous");
  });
});

describe("callback scheduling rules", () => {
  it("accepts a future weekday inside Mountain business hours", () => {
    expect(isValidCallbackDateTime("2026-08-10", "08:30", NOW)).toBe(true);
    expect(isValidCallbackDateTime("2026-08-10", "16:30", NOW)).toBe(true);
  });

  it("rejects same-day, weekend, holiday, and out-of-hours requests", () => {
    expect(isValidCallbackDateTime("2026-08-07", "10:00", NOW)).toBe(false);
    expect(isValidCallbackDateTime("2026-08-08", "10:00", NOW)).toBe(false);
    expect(isValidCallbackDateTime("2026-09-07", "10:00", NOW)).toBe(false);
    expect(isValidCallbackDateTime("2026-08-10", "08:29", NOW)).toBe(false);
    expect(isValidCallbackDateTime("2026-08-10", "16:31", NOW)).toBe(false);
  });
});

describe("live transfer business hours", () => {
  it("opens only during the approved Mountain-time window", () => {
    expect(isGenstoneBusinessOpen(new Date("2026-08-10T14:30:00.000Z"))).toBe(true);
    expect(isGenstoneBusinessOpen(new Date("2026-08-10T22:30:00.000Z"))).toBe(true);
    expect(isGenstoneBusinessOpen(new Date("2026-08-10T14:29:00.000Z"))).toBe(false);
    expect(isGenstoneBusinessOpen(new Date("2026-08-10T22:31:00.000Z"))).toBe(false);
  });

  it("closes on weekends and standard holidays", () => {
    expect(isGenstoneBusinessOpen(new Date("2026-08-08T16:00:00.000Z"))).toBe(false);
    expect(isGenstoneBusinessOpen(new Date("2026-09-07T16:00:00.000Z"))).toBe(false);
  });
});

describe("primary route guards", () => {
  const callbackInput = {
    call_id: "call-1",
    idempotency_key: "call-1:schedule",
    primary_route: "new_project",
    customer_name: "Test Caller",
    callback_subject: "project",
    callback_summary: "Project question",
    callback_date: "2026-08-11",
    callback_time: "10:00",
    callback_phone: "+18085550101",
    customer_email: "caller@example.com",
  };

  const supportInput = {
    call_id: "call-1",
    idempotency_key: "call-1:support",
    primary_route: "existing_order",
    customer_name: "Test Caller",
    confirmed_phone: "+18085550101",
    customer_email: "caller@example.com",
    caller_type: "customer",
    support_summary: "Needs help with an existing order.",
  };

  it("accepts callbacks only for new projects", () => {
    expect(callbackScheduleSchema.safeParse(callbackInput).success).toBe(true);
    expect(callbackScheduleSchema.safeParse({
      ...callbackInput,
      primary_route: "existing_order",
    }).success).toBe(false);
  });

  it("accepts Zendesk writes only for existing orders", () => {
    expect(supportFollowUpSchema.safeParse(supportInput).success).toBe(true);
    expect(supportFollowUpSchema.safeParse({
      ...supportInput,
      primary_route: "new_project",
    }).success).toBe(false);
  });

  it("does not require or accept obsolete prospect and support confirmation ceremonies", () => {
    expect(prospectFollowUpSchema.safeParse({
      call_id: "call-1",
      idempotency_key: "call-1:prospect",
      primary_route: "new_project",
      customer_name: "Test Caller",
      confirmed_phone: "+18085550101",
      customer_email: "caller@example.com",
      project_summary: "Needs project information.",
    }).success).toBe(true);
    expect(prospectFollowUpSchema.safeParse({
      call_id: "call-1",
      idempotency_key: "call-1:prospect",
      primary_route: "new_project",
      customer_name: "Test Caller",
      confirmed_phone: "+18085550101",
      customer_email: "caller@example.com",
      project_summary: "Needs project information.",
      prospect_confirmed: true,
    }).success).toBe(false);
    expect(supportFollowUpSchema.safeParse({
      ...supportInput,
      support_summary_confirmed: true,
    }).success).toBe(false);
  });
});

describe("Retell dynamic-variable normalization", () => {
  it("accepts any supported order identifier or a retained-candidate token", () => {
    for (const [identifier_type, identifier] of [
      ["phone", "+13035550100"],
      ["email", "caller@example.com"],
      ["order_number", "2505000137613"],
    ]) {
      expect(orderLookupSchema.safeParse({
        call_id: "call-1",
        identifier_type,
        identifier,
      }).success).toBe(true);
    }

    expect(orderLookupSchema.safeParse({
      call_id: "call-1",
      previous_order_candidate_token: "candidate-token",
    }).success).toBe(true);
    expect(orderLookupSchema.safeParse({ call_id: "call-1" }).success).toBe(false);
  });

  it("omits unresolved optional values", () => {
    const result = contactLookupSchema.parse({
      call_id: "call-1",
      phone: "+18085550101",
      email: "{{caller_email}}",
    });

    expect(result).toEqual({
      call_id: "call-1",
      phone: "+18085550101",
      email: undefined,
    });
  });

  it("requires only the server-confirmed order reference for downstream reads", () => {
    expect(verifiedOrderSchema.parse({
      call_id: "call-1",
      order_candidate_token: "order-token",
    })).toEqual({
      call_id: "call-1",
      order_candidate_token: "order-token",
    });
  });

  it("accepts a caller-confirmed shipment email destination", () => {
    expect(shipmentEmailSchema.safeParse({
      call_id: "call-1",
      idempotency_key: "call-1:shipment-email",
      order_candidate_token: "order-token",
      shipment_email: "alternate.destination@example.com",
    }).success).toBe(true);
  });
});

describe("shipment speech", () => {
  it("summarizes shipment state without reading tracking numbers", () => {
    const summary = summarizeShipment({
      carrier: "fedex",
      trackingNumbers: ["875540383686", "875540375769", "875540385060"],
      shippedDate: "2026-08-10",
    });

    expect(summary).toBe(
      "Your order shipped on August 10, 2026 with FedEx. There are 3 tracking numbers for the shipment. I don't have a live delivery estimate.",
    );
    expect(summary).not.toContain("875540383686");
  });
});

describe("temporary shipment email safety override", () => {
  it("ignores the caller email and copies the approved internal inbox", () => {
    expect(resolveShipmentEmailRecipient("customer@example.com")).toBe(
      "adeolamorren@gmail.com",
    );
    expect(CUSTOMERIO_MESSAGES.shipmentDetails.blindCopyRecipient).toBe(
      "travis.m@generalsteel.com",
    );
  });
});

describe("generated-voice Zendesk safety override", () => {
  it("uses the controlled inbox as the requester in the isolated QA Worker", () => {
    expect(
      resolveSupportRequesterEmail("voice_qa", "customer@example.com"),
    ).toBe("adeolamorren@gmail.com");
  });

  it("keeps the caller email outside the isolated QA Worker", () => {
    expect(
      resolveSupportRequesterEmail("production", "customer@example.com"),
    ).toBe("customer@example.com");
  });
});
