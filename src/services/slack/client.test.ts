import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyCallbackSchedulingFailure } from "./client";

const callback = {
  call_id: "call-1",
  idempotency_key: "call-1:schedule_callback",
  primary_route: "new_project" as const,
  customer_name: "Test Caller",
  callback_subject: "New project",
  callback_summary: "Needs help selecting materials.",
  callback_date: "2026-08-17",
  callback_time: "10:00",
  callback_phone: "+13035550101",
  customer_email: "caller@example.com",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("callback failure Slack notification", () => {
  it("opens a private conversation with Travis and posts the callback details", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, channel: { id: "D123" } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const notified = await notifyCallbackSchedulingFailure(
      { SLACK_BOT_TOKEN: "test-token" } as never,
      callback,
    );

    expect(notified).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://slack.com/api/conversations.open",
      expect.objectContaining({
        body: JSON.stringify({ users: "U01ACN50K8U" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://slack.com/api/chat.postMessage",
      expect.objectContaining({
        body: expect.stringContaining("Needs help selecting materials."),
      }),
    );
  });

  it("reports failure when Slack is unavailable or not configured", async () => {
    expect(
      await notifyCallbackSchedulingFailure({} as never, callback),
    ).toBe(false);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      ok: false,
      error: "not_in_channel",
    })));

    expect(
      await notifyCallbackSchedulingFailure(
        { SLACK_BOT_TOKEN: "test-token" } as never,
        callback,
      ),
    ).toBe(false);
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
