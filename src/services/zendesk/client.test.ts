import { afterEach, describe, expect, it, vi } from "vitest";

import type { CustomerAgentEnv } from "../../types/env";
import { appendPrivateZendeskComment, createZendeskCase } from "./client";

const env = {
  ZENDESK_GENSTONE_API_EMAIL: "service@example.com",
  ZENDESK_GESNTONE_API_TOKEN: "test-token",
} as CustomerAgentEnv;

const metadata = {
  customerName: "Test Caller",
  customerEmail: "caller@example.com",
  phone: "+18085550101",
  callerType: "customer" as const,
  country: "united_states" as const,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Zendesk answering-service tickets", () => {
  it("creates a private unassigned ticket with deterministic sorting fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ticketResponse());
    vi.stubGlobal("fetch", fetchMock);

    await createZendeskCase(env, {
      subject: "GenStone caller follow-up",
      privateComment: "Private call summary",
      metadata,
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    const ticket = body.ticket;

    expect(ticket).toMatchObject({
      type: "question",
      priority: "normal",
      status: "new",
      group_id: 26_273_508,
      comment: { body: "Private call summary", public: false },
      requester: { name: "Test Caller", email: "caller@example.com" },
      tags: ["answer_connect", "answering_service", "customer"],
    });
    expect(ticket).not.toHaveProperty("assignee_id");
    expect(ticket.custom_fields).toEqual([
      { id: 27_432_028, value: "Test Caller" },
      { id: 81_047_148, value: "+18085550101" },
      { id: 360_025_854_713, value: "customer" },
      { id: 360_026_303_754, value: "answering_service" },
      { id: 360_026_226_033, value: "united_states" },
    ]);
  });

  it("appends later call details as a private comment", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ticketResponse());
    vi.stubGlobal("fetch", fetchMock);

    await appendPrivateZendeskComment(env, {
      ticketId: "123",
      privateComment: "Two additional units were reported broken.",
    });

    const [url, request] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/api/v2/tickets/123.json");
    expect(request.method).toBe("PUT");
    expect(JSON.parse(String(request.body))).toEqual({
      ticket: {
        comment: {
          body: "Two additional units were reported broken.",
          public: false,
        },
      },
    });
  });
});

function ticketResponse(): Response {
  return new Response(JSON.stringify({
    ticket: {
      id: 123,
      subject: "GenStone caller follow-up",
      status: "new",
    },
  }));
}
