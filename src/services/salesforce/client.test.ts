import { afterEach, describe, expect, it, vi } from "vitest";

import { lookupSalesforceContact } from "./client";
import type { CustomerAgentEnv } from "../../types/env";

const env = {
  CLOUDRUN_SALESFORCE_API_KEY: "test-key",
  CLOUDRUN_SALESFORCE_API_URL: "https://salesforce.example.com",
} as CustomerAgentEnv;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("lookupSalesforceContact", () => {
  it("uses phone first and falls back to email only after a not-found response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          record: {
            Id: "contact-1",
            FirstName: "Test",
            LastName: "Contact",
            Email: "test@example.com",
          },
        },
      })));
    vi.stubGlobal("fetch", fetchMock);

    const contact = await lookupSalesforceContact(env, {
      phone: "8085550100",
      email: "test@example.com",
    });

    expect(contact.id).toBe("contact-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://salesforce.example.com/v1/contacts?phone=8085550100",
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      "https://salesforce.example.com/v1/contacts?email=test%40example.com",
    );
  });

  it("does not hide a non-not-found phone error with an email fallback", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(lookupSalesforceContact(env, {
      phone: "8085550100",
      email: "test@example.com",
    })).rejects.toMatchObject({ status: 500 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
