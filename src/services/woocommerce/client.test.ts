import { afterEach, describe, expect, it, vi } from "vitest";
import type { CustomerAgentEnv } from "../../types/env";
import {
  findWooOrders,
  getStoredShipment,
  getTrackingUrl,
  normalizeUsPhone,
} from "./client";

const env = {
  WOO_CONSUMER_KEY: "key",
  WOO_CONSUMER_SECRET: "secret",
} as CustomerAgentEnv;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WooCommerce caller-safe helpers", () => {
  it("normalizes supported US phone formats", () => {
    expect(normalizeUsPhone("+1 (303) 555-0100")).toBe("3035550100");
    expect(normalizeUsPhone("303-555-0100")).toBe("3035550100");
    expect(normalizeUsPhone("555-0100")).toBeUndefined();
  });

  it("retrieves an order number directly", async () => {
    const fetchMock = vi.fn().mockResolvedValue(wooOrderResponse());
    vi.stubGlobal("fetch", fetchMock);

    const orders = await findWooOrders(env, {
      identifierType: "order_number",
      identifier: "123",
    });

    expect(orders).toHaveLength(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/orders/123");
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("search=");
  });

  it("searches common phone formats before applying an exact normalized match", async () => {
    const fetchMock = vi.fn().mockImplementation((input: URL) => {
      const search = input.searchParams.get("search");
      return Promise.resolve(search === "(303) 555-0100"
        ? new Response(JSON.stringify([wooOrderPayload("(303) 555-0100")]))
        : new Response("[]"));
    });
    vi.stubGlobal("fetch", fetchMock);

    const orders = await findWooOrders(env, {
      identifierType: "phone",
      identifier: "+1 303 555 0100",
    });

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(orders).toHaveLength(1);
  });

  it("uses successful phone searches when another format times out", async () => {
    const fetchMock = vi.fn().mockImplementation((input: URL) => {
      const search = input.searchParams.get("search");
      if (search === "3035550100") {
        return Promise.reject(new DOMException("Timed out", "TimeoutError"));
      }

      return Promise.resolve(search === "(303) 555-0100"
        ? new Response(JSON.stringify([wooOrderPayload("(303) 555-0100")]))
        : new Response("[]"));
    });
    vi.stubGlobal("fetch", fetchMock);

    const orders = await findWooOrders(env, {
      identifierType: "phone",
      identifier: "+1 303 555 0100",
    });

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(orders).toHaveLength(1);
  });

  it("preserves an error when every phone search fails", async () => {
    const fetchMock = vi.fn().mockRejectedValue(
      new DOMException("Timed out", "TimeoutError"),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(findWooOrders(env, {
      identifierType: "phone",
      identifier: "+1 303 555 0100",
    })).rejects.toMatchObject({ name: "TimeoutError" });
  });

  it("finds orders by an exact normalized billing email", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      wooOrderPayload("3035550100", "Customer@Example.com"),
      wooOrderPayload("3035550101", "someone-else@example.com", 124),
    ])));
    vi.stubGlobal("fetch", fetchMock);

    const orders = await findWooOrders(env, {
      identifierType: "email",
      identifier: " customer@example.com ",
    });

    expect(orders).toHaveLength(1);
    expect(orders[0]?.number).toBe("123");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "search=customer%40example.com",
    );
  });

  it("normalizes shipped dates and builds approved carrier links", () => {
    const shipment = getStoredShipment({
      id: "123",
      number: "123",
      items: [],
      metadata: [
        { key: "_tracking_provider", value: "UPS" },
        { key: "_tracking_number", value: "1Z999" },
        { key: "_date_shipped", value: "1786051200" },
      ],
    });

    expect(shipment).toMatchObject({
      carrier: "UPS",
      trackingNumbers: ["1Z999"],
      shippedDate: "2026-08-06",
    });
    expect(getTrackingUrl("UPS", "1Z999")).toBe(
      "https://www.ups.com/track?tracknum=1Z999",
    );
  });
});

function wooOrderResponse(phone = "3035550100"): Response {
  return new Response(JSON.stringify(wooOrderPayload(phone)));
}

function wooOrderPayload(
  phone = "3035550100",
  email = "customer@example.com",
  id = 123,
) {
  return {
    id,
    number: String(id),
    billing: { phone, email },
    line_items: [{ name: "Panel", quantity: 2 }],
    meta_data: [],
  };
}
