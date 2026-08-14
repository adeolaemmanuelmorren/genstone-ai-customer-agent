import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../customerio/client", () => ({
  sendCustomerIoEmail: vi.fn(),
}));
vi.mock("../slack/client", () => ({
  notifyCallbackSchedulingFailure: vi.fn(),
}));

import { sendCustomerIoEmail } from "../customerio/client";
import { notifyCallbackSchedulingFailure } from "../slack/client";
import { scheduleCallbackTool } from "./retell-tools";

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

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-12T18:00:00.000Z"));
  vi.mocked(sendCustomerIoEmail).mockReset();
  vi.mocked(notifyCallbackSchedulingFailure).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("callback delivery failure", () => {
  it("reports that the team was notified only after Slack accepts the alert", async () => {
    vi.mocked(sendCustomerIoEmail).mockRejectedValue(new Error("delivery failed"));
    vi.mocked(notifyCallbackSchedulingFailure).mockResolvedValue(true);

    const result = await scheduleCallbackTool({} as never, {} as never, callback);

    expect(result.result_code).toBe("delivery_failed_notified");
    expect(notifyCallbackSchedulingFailure).toHaveBeenCalledOnce();
  });

  it("does not claim notification when the Slack alert also fails", async () => {
    vi.mocked(sendCustomerIoEmail).mockRejectedValue(new Error("delivery failed"));
    vi.mocked(notifyCallbackSchedulingFailure).mockResolvedValue(false);

    const result = await scheduleCallbackTool({} as never, {} as never, callback);

    expect(result.result_code).toBe("delivery_failed_unnotified");
    expect(result.safe_summary).not.toContain("team was notified");
  });
});
