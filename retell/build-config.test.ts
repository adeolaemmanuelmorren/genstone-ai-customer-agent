import { describe, expect, it } from "vitest";

import {
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
  it("references only the supplied shared subflow IDs", () => {
    const flow = buildConversationFlowConfig({ sharedComponentIds });
    const componentNodes = flow.nodes.filter((node) => node.type === "component");

    expect(flow.components).toBeUndefined();
    expect(componentNodes.length).toBeGreaterThan(0);
    expect(componentNodes.every((node) => node.component_type === "shared")).toBe(true);
    expect(new Set(componentNodes.map((node) => node.component_id))).toEqual(
      new Set(Object.values(sharedComponentIds)),
    );
    expect(flow.notes?.some((note) => note.id === RETELL_BUILD_CONSTANTS.flowRelease)).toBe(true);
  });

  it("builds eight versioned GenStone-only shared subflows", () => {
    const builds = buildSharedComponentConfigs({ workerApiKey: "test-worker-key" });

    expect(builds).toHaveLength(8);
    expect(builds.map((build) => build.config.name)).toEqual(
      Object.values(RETELL_SHARED_COMPONENT_NAMES),
    );
    expect(RETELL_BUILD_CONSTANTS.flowRelease).toBe("genstone_customer_agent_v3");
    expect(Object.values(RETELL_SHARED_COMPONENT_NAMES).every((name) => name.endsWith("v3"))).toBe(true);
  });

  it("has no existing-order callback edge", () => {
    const builds = buildSharedComponentConfigs({ workerApiKey: "test-worker-key" });
    const flow = buildConversationFlowConfig({ sharedComponentIds });
    const serializedBuild = JSON.stringify({ builds, flow });

    expect(serializedBuild).toContain("send_prospect_follow_up");
    expect(serializedBuild).toContain("Prospect Follow-Up");
    expect(serializedBuild).not.toContain("CB_Order");
    expect(serializedBuild).not.toContain("CB_Shipment");
    expect(serializedBuild).not.toContain("CB_Support");

    const orderVerification = flow.nodes.find(
      (node) => node.type === "branch" && node.id === "L_Order_Verified",
    );

    if (!orderVerification || orderVerification.type !== "branch") {
      throw new Error("Order verification branch was not built.");
    }

    expect(orderVerification.else_edge?.destination_node_id).toBe(
      "SUP_Order_Unverified",
    );
  });

  it("binds callback and Zendesk tools to opposite primary routes", () => {
    const builds = buildSharedComponentConfigs({ workerApiKey: "test-worker-key" });
    const callback = builds.find((build) => build.componentName === "Callback");
    const support = builds.find((build) => build.componentName === "Tracked Support");
    const callbackTool = callback?.config.tools?.find(
      (tool) => tool.type === "custom" && tool.name === "schedule_callback",
    );
    const supportTool = support?.config.tools?.find(
      (tool) => tool.type === "custom" && tool.name === "create_support_case",
    );

    if (!callbackTool || callbackTool.type !== "custom") {
      throw new Error("Callback tool was not built.");
    }
    if (!supportTool || supportTool.type !== "custom") {
      throw new Error("Support tool was not built.");
    }

    const callbackParameters = callbackTool.parameters as {
      properties: Record<string, unknown>;
      required: string[];
    };
    const supportParameters = supportTool.parameters as {
      properties: Record<string, unknown>;
      required: string[];
    };

    expect(callbackParameters.properties.primary_route).toMatchObject({
      const: "new_project",
    });
    expect(supportParameters.properties.primary_route).toMatchObject({
      const: "existing_order",
    });
    expect(supportParameters.required).toEqual(
      expect.arrayContaining([
        "customer_name",
        "confirmed_phone",
        "caller_type",
      ]),
    );
    expect(JSON.stringify(support)).not.toContain("lookup_support_cases");
    expect(JSON.stringify(support)).not.toContain("selected_case_token");
    expect(JSON.stringify(support)).not.toContain("case_action");
  });

  it("records prospect follow-up as a final outcome", () => {
    const flow = buildConversationFlowConfig({ sharedComponentIds });
    expect(JSON.stringify(flow)).toContain("prospect_follow_up");
  });

  it("routes every main-flow edge to an existing node", () => {
    const flow = buildConversationFlowConfig({ sharedComponentIds });
    const nodeIds = new Set(flow.nodes.map((node) => node.id));

    for (const node of flow.nodes) {
      const destinations = readDestinations(node);

      for (const destination of destinations) {
        expect(nodeIds.has(destination), `${node.id} -> ${destination}`).toBe(true);
      }
    }
  });

  it("routes every shared-component edge to a node in that component", () => {
    const builds = buildSharedComponentConfigs({ workerApiKey: "test-worker-key" });

    for (const build of builds) {
      const nodeIds = new Set(build.config.nodes.map((node) => node.id));
      for (const node of build.config.nodes) {
        for (const destination of readDestinations(node)) {
          expect(
            nodeIds.has(destination),
            `${build.componentName}: ${node.id} -> ${destination}`,
          ).toBe(true);
        }
      }
    }
  });

  it("maps the employee lookup response and gates transfer on a phone call", () => {
    const build = buildSharedComponentConfigs({
      workerApiKey: "test-worker-key",
    }).find(
      (candidate) => candidate.componentName === "Named Employee Transfer",
    );

    expect(build).toBeDefined();

    const lookupTool = build?.config.tools?.find(
      (tool) => tool.type === "custom" && tool.name === "lookup_active_employee",
    );

    if (!lookupTool || lookupTool.type !== "custom") {
      throw new Error("Named employee lookup tool was not built.");
    }

    expect(lookupTool.response_variables).toMatchObject({
      employee_display_name: "data.employee_name",
      employee_transfer_target: "data.transfer_destination",
    });

    const confirmationBranch = build?.config.nodes.find(
      (node) => node.type === "branch" && node.id === "L_Transfer_Confirmation",
    );

    if (!confirmationBranch || confirmationBranch.type !== "branch") {
      throw new Error("Named employee transfer branch was not built.");
    }

    const condition = confirmationBranch.edges?.[0]?.transition_condition;

    expect(condition).toMatchObject({
      type: "equation",
      operator: "&&",
      equations: [
        {
          left: "{{transfer_confirmed}}",
          operator: "==",
          right: "true",
        },
        {
          left: "{{call_type}}",
          operator: "==",
          right: "phone_call",
        },
      ],
    });
  });
});

function readDestinations(node: unknown): string[] {
  const value = node as {
    edges?: Array<{ destination_node_id?: string }>;
    edge?: { destination_node_id?: string };
    else_edge?: { destination_node_id?: string };
    always_edge?: { destination_node_id?: string };
  };

  return [
    ...(value.edges ?? []).map((edge) => edge.destination_node_id),
    value.edge?.destination_node_id,
    value.else_edge?.destination_node_id,
    value.always_edge?.destination_node_id,
  ].filter((destination): destination is string => Boolean(destination));
}
