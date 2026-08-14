import { describe, expect, it, vi } from "vitest";
import type { Queryable } from "./db";
import {
  confirmOrderReference,
  getNextOrderReference,
  getVerifiedOrderReference,
  storeOrderReferences,
} from "./references-repository";

describe("order candidate persistence", () => {
  it("stores one ordered candidate set with one database write", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const db = { query } as unknown as Queryable;

    const references = await storeOrderReferences(db, {
      companyId: "genstone",
      callId: "call-1",
      orders: [
        orderReference("100", "First order"),
        orderReference("99", "Second order"),
      ],
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(references).toHaveLength(2);
    expect(references[0]?.lookupId).toBe(references[1]?.lookupId);
    expect(references.map((reference) => reference.candidateRank)).toEqual([0, 1]);
  });

  it("loads the next candidate from the retained set", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [storedOrderRow("token-1", 0, "100")] })
      .mockResolvedValueOnce({ rows: [storedOrderRow("token-2", 1, "99")] });
    const db = { query } as unknown as Queryable;

    const next = await getNextOrderReference(
      db,
      "genstone",
      "call-1",
      "token-1",
    );

    expect(next).toMatchObject({
      token: "token-2",
      candidateRank: 1,
      orderNumber: "99",
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]?.[1]).toEqual([
      "genstone",
      "call-1",
      "lookup-1",
      1,
    ]);
  });

  it("marks one call-scoped order as verified before downstream use", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ token: "token-1" }] })
      .mockResolvedValueOnce({ rows: [storedOrderRow("token-1", 0, "100")] });
    const db = { query } as unknown as Queryable;

    const confirmed = await confirmOrderReference(db, "genstone", "call-1", "token-1");

    expect(confirmed?.orderNumber).toBe("100");
    expect(query.mock.calls[0]?.[0]).toContain("set order_verified = true");
    expect(query.mock.calls[0]?.[1]).toEqual(["genstone", "call-1", "token-1"]);
  });

  it("loads downstream orders only when the stored reference is verified", async () => {
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ token: "token-1" }] })
      .mockResolvedValueOnce({ rows: [storedOrderRow("token-1", 0, "100")] });
    const db = { query } as unknown as Queryable;

    const verified = await getVerifiedOrderReference(db, "genstone", "call-1", "token-1");

    expect(verified?.orderNumber).toBe("100");
    expect(query.mock.calls[0]?.[0]).toContain("order_verified = true");
  });
});

function orderReference(wooOrderId: string, itemName: string) {
  return {
    wooOrderId,
    orderNumber: wooOrderId,
    orderTypeSummary: "an order",
    orderStatusSummary: "processing",
    items: [{ name: itemName, quantity: 1 }],
  };
}

function storedOrderRow(token: string, candidateRank: number, orderNumber: string) {
  return {
    token,
    lookup_id: "lookup-1",
    candidate_rank: candidateRank,
    woo_order_id: orderNumber,
    order_number: orderNumber,
    order_email: "caller@example.com",
    order_phone: "3035550100",
    order_type_summary: "an order",
    order_status_summary: "processing",
    caller_safe_items: [{ name: "Panel", quantity: 1 }],
  };
}
