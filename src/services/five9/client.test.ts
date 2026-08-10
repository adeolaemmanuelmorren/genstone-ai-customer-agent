import { afterEach, describe, expect, it, vi } from "vitest";

import { suppressFive9Number } from "./client";
import type { CustomerAgentEnv } from "../../types/env";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("suppressFive9Number", () => {
  it("constructs HTTP Basic authentication from username and password", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      "<addNumbersToDncResponse/>",
      { status: 200 },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const result = await suppressFive9Number({
      FIVE9_USERNAME: "api-user",
      FIVE9_PASSWORD: "api-password",
    } as CustomerAgentEnv, "8083590543");

    expect(result).toBe("suppressed");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.five9.com/wsadmin/v12/AdminWebService",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Basic ${btoa("api-user:api-password")}`,
        }),
      }),
    );
  });

  it("does not classify an HTTP failure containing duplicate as success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      "Duplicate request could not be processed",
      { status: 500 },
    )));

    await expect(suppressFive9Number({
      FIVE9_USERNAME: "api-user",
      FIVE9_PASSWORD: "api-password",
    } as CustomerAgentEnv, "8083590543")).rejects.toThrow(
      "Five9 DNC request failed with 500",
    );
  });
});
