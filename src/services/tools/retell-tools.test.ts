import { describe, expect, it } from "vitest";
import { isValidCallbackDateTime, summarizeShipment } from "./retell-tools";
import {
  CUSTOMERIO_MESSAGES,
  resolveShipmentEmailRecipient,
} from "../customerio/config";
import {
  callbackScheduleSchema,
  contactLookupSchema,
  prospectFollowUpSchema,
  shipmentEmailSchema,
  supportCaseCreateSchema,
  verifiedOrderSchema,
} from "../../schemas/retell-tools";

const NOW = new Date("2026-08-07T18:00:00.000Z");

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
    callback_confirmed: true,
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
    expect(supportCaseCreateSchema.safeParse(supportInput).success).toBe(true);
    expect(supportCaseCreateSchema.safeParse({
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
    expect(supportCaseCreateSchema.safeParse({
      ...supportInput,
      support_summary_confirmed: true,
    }).success).toBe(false);
  });
});

describe("Retell dynamic-variable normalization", () => {
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

  it("accepts Retell boolean substitutions without weakening confirmation", () => {
    expect(verifiedOrderSchema.parse({
      call_id: "call-1",
      order_candidate_token: "order-token",
      order_items_confirmed: "true",
      order_verified: "true",
    })).toMatchObject({
      order_items_confirmed: true,
      order_verified: true,
    });
  });

  it("accepts a caller-confirmed shipment email destination", () => {
    expect(shipmentEmailSchema.safeParse({
      call_id: "call-1",
      idempotency_key: "call-1:shipment-email",
      order_candidate_token: "order-token",
      order_items_confirmed: true,
      order_verified: true,
      shipment_email_requested: true,
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
