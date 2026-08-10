import { describe, expect, it } from "vitest";

import {
  buildRetellSimulationDefinitions,
  RETELL_SIMULATION_TOOL_COUNT,
  validateRetellSimulationToolCalls,
} from "./simulation-suite.js";

const target = {
  conversationFlowId: "conversation_flow_test",
  conversationFlowVersion: 2,
};

describe("Retell simulation suite", () => {
  it("defines nine tests against the pinned draft flow", () => {
    const definitions = buildRetellSimulationDefinitions(target);

    expect(definitions).toHaveLength(9);

    for (const definition of definitions) {
      expect(definition.response_engine).toEqual({
        type: "conversation-flow",
        conversation_flow_id: target.conversationFlowId,
        version: target.conversationFlowVersion,
      });
    }
  });

  it("mocks every custom tool in every test", () => {
    const definitions = buildRetellSimulationDefinitions(target);

    for (const definition of definitions) {
      const mocks = definition.tool_mocks ?? [];
      const toolNames = new Set(mocks.map((mock) => mock.tool_name));

      expect(mocks).toHaveLength(RETELL_SIMULATION_TOOL_COUNT);
      expect(toolNames.size).toBe(RETELL_SIMULATION_TOOL_COUNT);
      expect(
        mocks.every((mock) => mock.input_match_rule.type === "any"),
      ).toBe(true);
    }
  });

  it("uses synthetic dynamic variables only", () => {
    const definitions = buildRetellSimulationDefinitions(target);

    for (const definition of definitions) {
      expect(definition.dynamic_variables).toMatchObject({
        call_type: "web_call",
        user_number: "+18085550101",
      });
      expect(definition.dynamic_variables?.call_id).toMatch(/^simulation_/);
    }
  });

  it("checks required and forbidden tools deterministically", () => {
    const name = "GenStone v5 — Verified shipment email accepted";
    const correctTranscript = [
      { role: "tool_call_invocation", name: "lookup_contact" },
      { role: "tool_call_invocation", name: "lookup_order" },
      { role: "tool_call_invocation", name: "lookup_shipment" },
      { role: "tool_call_invocation", name: "email_shipment_tracking" },
      { role: "tool_call_invocation", name: "extract_dynamic_variables" },
    ];

    expect(validateRetellSimulationToolCalls(name, correctTranscript)).toEqual([]);
    expect(
      validateRetellSimulationToolCalls(name, [
        ...correctTranscript.slice(0, 2),
        { role: "tool_call_invocation", name: "create_support_case" },
      ]),
    ).toEqual([
      "Required tool lookup_shipment was not invoked.",
      "Required tool email_shipment_tracking was not invoked.",
      "Forbidden tool create_support_case was invoked.",
    ]);
  });
});
