import { describe, expect, it } from "vitest";

import {
  buildAgentConfig,
  buildConversationFlowConfig,
  buildSharedComponentConfigs,
  RETELL_BUILD_CONSTANTS,
  RETELL_SHARED_COMPONENT_NAMES,
  type RetellSharedComponentIds,
} from "./build-config.js";

const sharedComponentIds = Object.fromEntries(
  Object.keys(RETELL_SHARED_COMPONENT_NAMES).map((name, index) => [
    name,
    `conversation_flow_component_test_${index}`,
  ]),
) as RetellSharedComponentIds;

describe("Retell build config", () => {
  it("builds one subagent and one exit for every shared responsibility", () => {
    const builds = buildSharedComponentConfigs({ workerApiKey: "test-worker-key" });

    expect(builds).toHaveLength(8);
    expect(builds.map((build) => build.config.name)).toEqual(
      Object.values(RETELL_SHARED_COMPONENT_NAMES),
    );
    expect(builds.every((build) => (
      build.config.nodes.length === 2
      && build.config.nodes[0]?.type === "subagent"
      && build.config.nodes[1]?.type === "end"
    ))).toBe(true);
    expect(RETELL_BUILD_CONSTANTS.flowRelease).toBe("genstone_customer_agent_v49");
    expect(Object.values(RETELL_SHARED_COMPONENT_NAMES).every(
      (name) => name.endsWith("v49"),
    )).toBe(true);
  });

  it("keeps the main router small and always asks new project or existing order", () => {
    const flow = buildConversationFlowConfig({ sharedComponentIds });
    const callerName = flow.nodes.find((node) => node.id === "X_Caller_Name");

    expect(flow.start_node_id).toBe("C_Greet_Name");
    expect(flow.nodes).toHaveLength(21);
    expect(JSON.stringify(callerName)).toContain("C_Greet_And_Route");
    expect(JSON.stringify(flow)).not.toContain("existing_order_intent");
    expect(flow.nodes.some((node) => node.id === "L_Initial_Route")).toBe(false);
    expect(flow.nodes.some((node) => node.id.startsWith("L_Shipment_Result"))).toBe(false);
    expect(flow.nodes.some((node) => node.id.startsWith("L_Support_Result"))).toBe(false);
    expect(flow.nodes.some((node) => node.id.startsWith("L_Callback_Component_Result"))).toBe(false);
    expect(flow.nodes.some((node) => node.id === "L_Post_Verification_Request")).toBe(true);
    expect(flow.nodes.some((node) => node.id === "C_Close_Answered")).toBe(false);
  });

  it("lets the order subagent conduct verification while tools enforce data boundaries", () => {
    const order = buildSharedComponentConfigs({ workerApiKey: "test-worker-key" })
      .find((build) => build.componentName === "Order Verification");
    const serialized = JSON.stringify(order);

    expect(order?.config.tools?.map((tool) => tool.name)).toEqual([
      "lookup_order",
      "lookup_order_alternate",
      "lookup_next_order",
    ]);
    expect(serialized).toContain("ask once for the GenStone order number");
    expect(serialized).toContain("without asking for the order number again");
    expect(serialized).toContain("last four digits");
    expect(serialized).not.toContain('"identifier":{"type":"string","description":"Caller-confirmed order phone.","const":"{{confirmed_phone}}"}');
    expect(serialized).toContain("order_type_summary");
    expect(serialized).toContain("order_items_confirmed=true");
    expect(serialized).toContain("order_verified=true");
    expect(serialized).toContain("Great. What can I help you with?");
    expect(serialized).toContain("Do not announce or repeat that the order was verified");
    expect(serialized).not.toContain("F_Lookup_Order_By_Phone");
    expect(serialized).not.toContain("S_Request_Order_Number");
  });

  it("keeps support collection and the Zendesk write in one subagent", () => {
    const support = buildSharedComponentConfigs({ workerApiKey: "test-worker-key" })
      .find((build) => build.componentName === "Tracked Support");
    const serialized = JSON.stringify(support);

    expect(serialized).toContain("create_support_case");
    expect(serialized).toContain("issue the caller already described");
    expect(serialized).toContain("caller_email");
    expect(serialized).toContain("they'll be in touch as soon as possible");
    expect(serialized).not.toContain("X_Support_Details");
    expect(serialized).not.toContain("F_Create_Support_Case");
  });

  it("does not narrate successful Salesforce contact lookup", () => {
    const contact = buildSharedComponentConfigs({ workerApiKey: "test-worker-key" })
      .find((build) => build.componentName === "Contact Lookup");
    const serialized = JSON.stringify(contact);

    expect(serialized).toContain("Never announce the contact-lookup result");
    expect(serialized).toContain("ask which email the team should use for follow-up");
  });

  it("keeps warm transfer inside the named-employee subagent", () => {
    const transfer = buildSharedComponentConfigs({ workerApiKey: "test-worker-key" })
      .find((build) => build.componentName === "Named Employee Transfer");
    const serialized = JSON.stringify(transfer);

    expect(serialized).toContain("lookup_active_employee");
    expect(serialized).toContain('"type":"transfer_call"');
    expect(serialized).toContain('"type":"warm_transfer"');
    expect(serialized).toContain('"show_transferee_as_caller":true');
    expect(serialized).not.toContain("L_Employee_Channel");
  });

  it("does not let a generic human request bypass the current business path", () => {
    const flow = buildConversationFlowConfig({ sharedComponentIds });
    const humanRequest = flow.nodes.find((node) => node.id === "G_Human_Request");
    const serialized = JSON.stringify(humanRequest);

    expect(serialized).toContain("human_named_employee");
    expect(serialized).not.toContain("human_existing_order");
    expect(serialized).not.toContain("human_new_callback");
    expect(serialized).not.toContain("human_new_help");
  });

  it("delays Salesforce contact lookup until an existing order needs support", () => {
    const flow = buildConversationFlowConfig({ sharedComponentIds });
    const serialized = JSON.stringify(flow);

    expect(serialized).toContain('"greet_existing_order"');
    expect(serialized).toContain('"destination_node_id":"ORDER_Verification"');
    expect(serialized).toContain('"id":"SF_Contact_Existing_Support"');
    expect(serialized).not.toContain('"id":"SF_Contact_Existing_Order"');
  });

  it("routes every main-flow edge to an existing node", () => {
    const flow = buildConversationFlowConfig({ sharedComponentIds });
    const nodeIds = new Set(flow.nodes.map((node) => node.id));

    for (const node of flow.nodes) {
      if ("edges" in node) {
        for (const edge of node.edges ?? []) {
          if (edge.destination_node_id) {
            expect(nodeIds.has(edge.destination_node_id)).toBe(true);
          }
        }
      }
      if (node.type === "branch" && node.else_edge?.destination_node_id) {
        expect(nodeIds.has(node.else_edge.destination_node_id)).toBe(true);
      }
      if (node.type === "component" && node.else_edge?.destination_node_id) {
        expect(nodeIds.has(node.else_edge.destination_node_id)).toBe(true);
      }
    }
  });

  it("pins the approved model and full Retell storage", () => {
    const agent = buildAgentConfig("conversation_flow_test", 0);

    expect(agent.response_engine).toMatchObject({
      type: "conversation-flow",
      conversation_flow_id: "conversation_flow_test",
      version: 0,
    });
    expect(agent.data_storage_setting).toBe("everything");
  });
});
