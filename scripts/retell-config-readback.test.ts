import { describe, expect, it } from "vitest";
import { assertExpectedConfig } from "./retell-config-readback";

describe("Retell configuration readback", () => {
  it("accepts provider-added fields while checking every repository field", () => {
    expect(() => assertExpectedConfig(
      { nodes: [{ id: "start", instruction: "Current prompt" }] },
      {
        nodes: [{ id: "start", instruction: "Current prompt", provider_default: null }],
        provider_timestamp: 123,
      },
      "flow",
    )).not.toThrow();
  });

  it("rejects stale prompts even when node IDs still match", () => {
    expect(() => assertExpectedConfig(
      { nodes: [{ id: "start", instruction: "Current prompt" }] },
      { nodes: [{ id: "start", instruction: "Old prompt" }] },
      "flow",
    )).toThrow("flow.nodes[0].instruction");
  });
});
