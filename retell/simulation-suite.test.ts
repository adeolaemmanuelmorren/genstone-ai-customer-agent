import { describe, expect, it } from "vitest";

import {
  buildRetellSimulationDefinitions,
  RETELL_SIMULATION_TOOL_COUNT,
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
});
