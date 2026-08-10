import { describe, expect, it } from "vitest";
import {
  hasValidIdempotencyScope,
  readExistingExecution,
  stableJson,
} from "./retell-tool-routes";

describe("Retell tool idempotency", () => {
  it("replays the original completed result instead of inventing duplicate success", () => {
    expect(readExistingExecution({
      executionStatus: "completed",
      executionOk: false,
      resultCode: "invalid_day_or_time",
      safeSummary: "Choose another time.",
    })).toEqual({
      ok: false,
      result_code: "invalid_day_or_time",
      safe_summary: "Choose another time.",
    });
  });

  it("requires write keys to be scoped to the current call", () => {
    expect(hasValidIdempotencyScope({
      call_id: "call-a",
      idempotency_key: "call-a:schedule_callback",
    })).toBe(true);
    expect(hasValidIdempotencyScope({
      call_id: "call-b",
      idempotency_key: "call-a:schedule_callback",
    })).toBe(false);
  });

  it("hashes equivalent parsed payloads consistently while distinguishing corrections", () => {
    expect(stableJson({ call_id: "call-a", time: "10:00" })).toBe(
      stableJson({ time: "10:00", call_id: "call-a" }),
    );
    expect(stableJson({ call_id: "call-a", time: "10:00" })).not.toBe(
      stableJson({ call_id: "call-a", time: "11:00" }),
    );
  });
});
