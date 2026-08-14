import { describe, expect, it } from "vitest";

import {
  buildAgentConfig,
  buildConversationFlowConfig,
  buildSharedComponentConfigs,
  RETELL_BUILD_CONSTANTS,
  RETELL_COMPONENT_NAMES,
  type RetellComponentIds,
} from "./build-config.js";

const componentIds = Object.fromEntries(
  Object.keys(RETELL_COMPONENT_NAMES).map((name) => [name, `component_${name}`]),
) as RetellComponentIds;

const flow = () => buildConversationFlowConfig({ componentIds });
const components = () => buildSharedComponentConfigs({ workerApiKey: "test-worker-key" });

describe("Retell responsibility-component config", () => {
  it("keeps the main canvas small and business-focused", () => {
    const config = flow();
    const componentNodes = config.nodes.filter((node) => node.type === "component");

    expect(config.start_node_id).toBe("X_Prepare_Caller_Number");
    expect(config.tools).toBeUndefined();
    expect(componentNodes).toHaveLength(8);
    expect(config.nodes.every((node) => ["code", "component", "branch", "end"].includes(node.type))).toBe(true);
    expect(RETELL_BUILD_CONSTANTS.flowRelease).toBe("genstone_customer_agent_v74");
    expect(RETELL_BUILD_CONSTANTS.sharedComponentRelease).toBe("v74");
  });

  it("places the main flow and every subflow explicitly", () => {
    const config = flow();

    expect(config.begin_tag_display_position).toEqual({ x: -400, y: 0 });
    expect(config.nodes.every((node) => Boolean(node.display_position))).toBe(true);

    for (const build of components()) {
      const expectedBeginPosition = build.componentName === "newProject"
        ? { x: 6, y: 15.273435592651367 }
        : { x: -360, y: 0 };
      expect(build.config.begin_tag_display_position).toEqual(expectedBeginPosition);
      expect(
        build.config.nodes.every((node) => Boolean(node.display_position)),
        build.config.name,
      ).toBe(true);
    }
  });

  it("creates six main responsibilities and two global interruptions", () => {
    const builds = components();

    expect(builds).toHaveLength(8);
    expect(builds.map((build) => build.config.name).sort()).toEqual(
      Object.values(RETELL_COMPONENT_NAMES).sort(),
    );
    expect(builds.every((build) => (
      build.config.nodes.some((node) => node.type === "end")
      && build.config.nodes.every((node) => node.type !== "component")
    ))).toBe(true);
  });

  it("keeps every component edge inside its component", () => {
    for (const build of components()) {
      const nodeIds = new Set(build.config.nodes.map((node) => node.id));

      for (const node of build.config.nodes) {
        for (const destination of nodeDestinations(node)) {
          expect(nodeIds.has(destination), `${build.config.name}: ${node.id} -> ${destination}`).toBe(true);
        }
      }
    }
  });

  it("does not define a captured variable twice in one extraction node", () => {
    for (const build of components()) {
      for (const node of build.config.nodes) {
        if (node.type !== "extract_dynamic_variables") {
          continue;
        }

        const names = node.variables.map((variable) => variable.name);
        expect(new Set(names).size, `${build.config.name}: ${node.id}`).toBe(names.length);
      }
    }
  });

  it("never lets a conversational transition compete with an inline extraction tool", () => {
    const serialized = JSON.stringify(components());

    expect(serialized).not.toContain('"type":"extract_dynamic_variable"');
    expect(serialized).toContain('"type":"extract_dynamic_variables"');
  });

  it("gives every component one reachable internal graph", () => {
    for (const build of components()) {
      const nodeIds = build.config.nodes.map((node) => node.id);
      const reachable = reachableNodeIds(build.config);

      expect(new Set(nodeIds).size, `${build.config.name}: duplicate node id`).toBe(nodeIds.length);
      expect([...reachable].sort(), `${build.config.name}: unreachable node`).toEqual([...nodeIds].sort());
    }
  });

  it("keeps component-level tools inside their owning component", () => {
    for (const build of components()) {
      const toolIds = new Set((build.config.tools ?? []).map((tool) => tool.tool_id));

      for (const node of build.config.nodes) {
        if (node.type === "function" && node.tool_type === "local") {
          expect(toolIds.has(node.tool_id), `${build.config.name}: ${node.id}`).toBe(true);
        }

        if (node.type !== "subagent") {
          continue;
        }

        for (const toolId of node.tool_ids ?? []) {
          expect(toolIds.has(toolId), `${build.config.name}: ${node.id}`).toBe(true);
        }
      }
    }
  });

  it("uses the agreed main-canvas sequence", () => {
    const config = flow();

    expect(componentDestination(config, "C_Greeting")).toBe("C_Understand_Request");
    expect(componentDestination(config, "C_Understand_Request")).toBe("L_Request_Route");
    expect(componentDestination(config, "C_New_Project")).toBe("L_Responsibility_Route");
    expect(componentDestination(config, "C_Existing_Order")).toBe("L_Responsibility_Route");
    expect(componentDestination(config, "C_Knowledge")).toBe("L_Responsibility_Route");
    expect(componentDestination(config, "C_Do_Not_Call")).toBe("E_Call_Complete");
    expect(nodeDestinations(config.nodes.find((node) => node.id === "L_Responsibility_Route")!)).toEqual([
      "C_New_Project",
      "C_Existing_Order",
      "C_Knowledge",
      "E_Call_Complete",
    ]);

    const serialized = JSON.stringify(config);
    expect(serialized).not.toContain("C_Order_Verification");
    expect(serialized).not.toContain("C_Shipment");
    expect(serialized).not.toContain("C_Customer_Service");
    expect(serialized).not.toContain("C_Support_Follow_Up");
    expect(serialized).not.toContain("C_Close_Or_Continue");
    expect(serialized).not.toContain("L_Continuation");
  });

  it("keeps all existing-order operations inside one component", () => {
    const existingOrder = component("existingOrder");
    const tools = (existingOrder.tools ?? [])
      .map((tool) => "name" in tool ? tool.name : undefined)
      .filter(Boolean);

    expect(tools.sort()).toEqual([
      "lookup_order",
      "next_order_candidate",
      "confirm_order",
      "lookup_shipment",
      "email_shipment_tracking",
      "check_business_hours",
      "lookup_contact_by_phone",
      "lookup_contact_by_email",
      "record_support_follow_up",
      "record_unverified_support_follow_up",
    ].sort());
    expect(existingOrder.start_node_id).toBe("L_Order_Entry");
  });

  it("loops same and different orders inside Existing Order", () => {
    const continuation = findComponentNode(component("existingOrder"), "S_Existing_Continue");
    const destinations = nodeDestinations(continuation!);

    expect(destinations).toContain("X_Prepare_Existing_Request");
    expect(destinations).toContain("X_Reset_Active_Order");
    expect(destinations).toContain("X_Capture_Existing_Continue_Handoff");
    expect(destinations).toContain("E_Existing_Order");
    expect(JSON.stringify(continuation)).toContain("Is there anything else I can help you with?");
    expect(JSON.stringify(findComponentNode(component("existingOrder"), "X_Reset_Active_Order"))).toContain("order_verified: false");
  });

  it("uses a silent backend gate after caller order confirmation", () => {
    const confirmation = findComponentNode(component("existingOrder"), "F_Order_Confirm");

    expect(confirmation).toMatchObject({
      type: "function",
      wait_for_result: true,
      speak_during_execution: false,
    });
  });

  it("uses one call-wide handoff only for responsibility changes", () => {
    const serialized = JSON.stringify({ flow: flow(), components: components() });

    expect(serialized).toContain("next_responsibility");
    expect(serialized).toContain("pending_request");
    expect(serialized).not.toContain("new_project_next");
    expect(serialized).not.toContain("existing_order_next");
    expect(serialized).not.toContain("knowledge_next");
  });

  it("keeps DNC in intake instead of making it global", () => {
    const config = flow();
    const route = config.nodes.find((node) => node.id === "L_Request_Route");
    const dnc = config.nodes.find((node) => node.id === "C_Do_Not_Call");

    expect(nodeDestinations(route!)).toContain("C_Do_Not_Call");
    expect(dnc).not.toHaveProperty("global_node_setting");
    expect(config.nodes.some((node) => node.id === "G_Do_Not_Call")).toBe(false);
    expect(JSON.stringify(component("understandRequest"))).toContain("do_not_call");
  });

  it("uses exactly two global interruptions with different completion behavior", () => {
    const config = flow();
    const globals = config.nodes.filter((node) => "global_node_setting" in node);
    const human = config.nodes.find((node) => node.id === "G_Human_Escalation");
    const named = config.nodes.find((node) => node.id === "G_Named_Employee");

    expect(globals.map((node) => node.id).sort()).toEqual([
      "G_Human_Escalation",
      "G_Named_Employee",
    ]);
    expect(human).not.toHaveProperty("global_node_setting.go_back_conditions");
    expect(componentDestination(config, "G_Human_Escalation")).toBe("E_Call_Complete");
    expect(named).toHaveProperty(
      "global_node_setting.go_back_conditions.0.transition_condition.prompt",
      "Always",
    );
  });

  it("clarifies an ambiguous named employee once before returning", () => {
    const namedEmployee = component("namedEmployee");
    const firstLookup = findComponentNode(namedEmployee, "F_Employee_Lookup")!;
    const clarification = findComponentNode(namedEmployee, "S_Employee_Clarify")!;
    const retry = findComponentNode(namedEmployee, "F_Employee_Lookup_Retry")!;

    expect(nodeDestinations(firstLookup)).toContain("S_Employee_Clarify");
    expect(JSON.stringify(clarification)).toContain("What is their full name?");
    expect(nodeDestinations(clarification)).toContain("F_Employee_Lookup_Retry");
    expect(nodeDestinations(retry)).toContain("S_Employee_Transfer");
    expect(nodeDestinations(retry)).toContain("E_Employee_Unidentified");
    expect(nodeDestinations(retry)).toContain("E_Employee_Unavailable");
    expect(findComponentNode(namedEmployee, "E_Employee_Unidentified")).toMatchObject({
      type: "end",
      speak_during_execution: true,
    });
  });

  it("keeps the generic-human transfer and both fallbacks in one terminal component", () => {
    const human = component("humanEscalation");
    const serialized = JSON.stringify(human);
    const tools = (human.tools ?? [])
      .map((tool) => "name" in tool ? tool.name : undefined)
      .filter(Boolean);

    expect(human.start_node_id).toBe("S_Human_Classify");
    expect(tools.sort()).toEqual([
      "check_business_hours",
      "schedule_callback",
      "lookup_contact_by_phone",
      "lookup_contact_by_email",
      "record_unverified_support_follow_up",
    ].sort());
    expect(serialized).toContain("+13038764333");
    expect(serialized).toContain("+13036471024");
    expect(serialized).toContain("+13039047205");
    expect(serialized).toContain("S_Human_Callback");
    expect(serialized).toContain("S_Human_Support");
    expect(serialized).not.toContain("Go Back");
  });

  it("uses a one-time pending request without rolling context state", () => {
    const serialized = JSON.stringify({ flow: flow(), components: components() });

    expect(serialized).not.toContain("active_request_summary");
    expect(serialized).not.toContain("handoff_requested");
    expect(serialized).not.toContain("current_context");
    expect(serialized).toContain("pending_request");
    expect(countOccurrences(serialized, 'return { next_responsibility: \\\"\\\", pending_request: \\\"\\\" };')).toBe(3);
  });

  it("implements the approved new-project sequence inside one component", () => {
    const project = component("newProject");

    expect(project.start_node_id).toBe("S_Project_Request");
    expect(nodeDestinations(findComponentNode(project, "S_Project_Request")!)).toContain("X_Clear_Project_Request");
    expect(nodeDestinations(findComponentNode(project, "X_Clear_Project_Request")!)).toContain("L_Project_Request");
    const knowledge = findComponentNode(project, "S_Project_Knowledge")!;
    expect(nodeDestinations(knowledge)).toContain("F_Project_Hours");
    expect(nodeDestinations(knowledge)).toContain("X_Capture_Project_Knowledge_Handoff");
    expect(knowledge).not.toHaveProperty("skip_response_edge");
    expect(nodeDestinations(findComponentNode(project, "S_Project_Transfer")!)).toContain("T_Project_Coordinator");
    expect(nodeDestinations(findComponentNode(project, "T_Project_Coordinator")!)).toContain("S_Project_Callback");
    expect(nodeDestinations(findComponentNode(project, "S_Project_Callback")!)).toContain("X_Capture_Project_Callback");
    expect(nodeDestinations(findComponentNode(project, "X_Capture_Project_Callback")!)).toContain("F_Project_Callback");
    expect(nodeDestinations(findComponentNode(project, "F_Project_Callback")!)).toContain("S_Project_Continue");
    expect(findComponentNode(project, "C_Callback_Complete")).toBeUndefined();
    expect(nodeDestinations(findComponentNode(project, "S_Project_Continue")!)).toContain("E_New_Project");
    expect(nodeDestinations(findComponentNode(project, "S_Project_Continue")!)).not.toContain("S_Project_Request");
    expect(findComponentNode(project, "T_Project_Coordinator")).toMatchObject({
      type: "transfer_call",
      transfer_option: { type: "warm_transfer" },
    });
  });

  it("keeps continuation inside each owning responsibility", () => {
    const allConfig = JSON.stringify({ flow: flow(), components: components() });

    expect(countOccurrences(allConfig, "Is there anything else I can help you with?")).toBe(3);
    expect(allConfig).not.toContain("Do you have any other questions about your new project?");
    expect(allConfig).not.toContain("Do you have any other questions about this existing order?");
    expect(countOccurrences(allConfig, "Thank you for calling GenStone. Have a great day. Goodbye.")).toBe(1);
  });

  it("keeps additional general questions inside General Knowledge", () => {
    const serialized = JSON.stringify(component("knowledge"));

    expect(serialized).toContain("The caller supplied another general question");
    expect(serialized).toContain("next_responsibility");
    expect(serialized).toContain("X_Clear_Knowledge_Request");
    expect(serialized).not.toContain("skip_response_edge");
    expect(serialized).not.toContain("Please go ahead");
  });

  it("clears a received request immediately after each owner consumes it", () => {
    const project = component("newProject");
    const order = component("existingOrder");
    const knowledge = component("knowledge");

    expect(nodeDestinations(findComponentNode(project, "S_Project_Request")!)).toContain("X_Clear_Project_Request");
    expect(nodeDestinations(findComponentNode(order, "S_Existing_Request")!)).toContain("X_Capture_Existing_Request_Route");
    expect(nodeDestinations(findComponentNode(order, "X_Capture_Existing_Request_Route")!)).toContain("X_Clear_Existing_Request");
    expect(nodeDestinations(findComponentNode(knowledge, "S_Knowledge_Answer")!)).toContain("X_Clear_Knowledge_Request");
  });

  it("fails closed when intake or human-request extraction is missing", () => {
    const mainRoute = flow().nodes.find((node) => node.id === "L_Request_Route")!;
    const greetingCapture = findComponentNode(
      component("greeting"),
      "X_Capture_Caller_Name",
    )!;
    const intakeCapture = findComponentNode(
      component("understandRequest"),
      "X_Capture_Primary_Route",
    )!;
    const human = component("humanEscalation");

    expect(nodeDestinations(mainRoute)).toContain("C_Knowledge");
    expect(nodeDestinations(mainRoute).at(-1)).toBe("C_Understand_Request");
    expect(nodeDestinations(greetingCapture)).toContain("S_Greeting");
    expect(nodeDestinations(intakeCapture)).toContain("S_Understand_Request");
    expect(nodeDestinations(findComponentNode(human, "L_Human_Open_Context")!)).toContain("S_Human_Classify");
    expect(nodeDestinations(findComponentNode(human, "L_Human_Fallback_Context")!)).toContain("S_Human_Classify");
  });

  it("extracts required operational values before invoking their tools", () => {
    const order = component("existingOrder");
    const project = component("newProject");
    const human = component("humanEscalation");

    expect(findComponentNode(order, "X_Capture_Order_Identifier")).toMatchObject({
      type: "extract_dynamic_variables",
    });
    expect(nodeDestinations(findComponentNode(order, "X_Capture_Order_Identifier")!)).toContain("F_Order_Lookup");
    expect(nodeDestinations(findComponentNode(order, "X_Capture_Shipment_Email")!)).toContain("F_Shipment_Email");
    expect(nodeDestinations(findComponentNode(order, "X_Capture_Support_Contact")!)).toContain("F_Support_Contact_Phone");
    expect(nodeDestinations(findComponentNode(project, "X_Capture_Project_Callback")!)).toContain("F_Project_Callback");
    expect(nodeDestinations(findComponentNode(human, "X_Capture_Human_Callback")!)).toContain("F_Human_Callback");
    expect(nodeDestinations(findComponentNode(human, "X_Capture_Human_Support")!)).toContain("F_Human_Support_Contact_Phone");
  });

  it("consolidates callback failures and ends instead of resuming", () => {
    for (const componentName of ["newProject", "humanEscalation"] as const) {
      const config = component(componentName);
      const serialized = JSON.stringify(config);

      expect(serialized).toContain("couldn't complete the callback request");
      expect(serialized).not.toContain("We have notified our team");
      expect(serialized).not.toContain("Callback_Failed_Notified");
      expect(serialized).not.toContain("Callback_Failed_Unnotified");
    }

    expect(nodeDestinations(findComponentNode(component("newProject"), "C_Callback_Failed")!)).toEqual(["E_New_Project"]);
    expect(findComponentNode(component("humanEscalation"), "E_Human_Callback_Failed")).toMatchObject({
      type: "end",
      speak_during_execution: true,
    });
  });

  it("uses speaking exits instead of statement-to-silent-exit chains", () => {
    const expectedSpeakingExits = [
      ["humanEscalation", "E_Human_Callback_Complete"],
      ["humanEscalation", "E_Human_Callback_Failed"],
      ["humanEscalation", "E_Human_Support_Complete"],
      ["humanEscalation", "E_Human_Support_Failed"],
      ["namedEmployee", "E_Employee_Unavailable"],
      ["namedEmployee", "E_Employee_Unidentified"],
      ["doNotCall", "E_Dnc_Complete"],
      ["doNotCall", "E_Dnc_Failed"],
    ] as const;

    for (const [componentName, nodeId] of expectedSpeakingExits) {
      expect(findComponentNode(component(componentName), nodeId)).toMatchObject({
        type: "end",
        speak_during_execution: true,
      });
      expect(findComponentNode(component(componentName), nodeId)).not.toHaveProperty("skip_response_edge");
    }
  });

  it("keeps initial intake minimal and independent of existing context", () => {
    const serialized = JSON.stringify(component("understandRequest"));

    expect(serialized).toContain("Ask: Are you calling about an existing order or a new project?");
    expect(serialized).not.toContain("{{current_context}}");
    expect(serialized).not.toContain("already supplied");
    expect(serialized).not.toContain("later request");
    expect(serialized).not.toContain("Please go ahead");
  });

  it("keeps shipment speech and operational email confirmation inside Existing Order", () => {
    const existingOrder = component("existingOrder");
    const lookup = findComponentNode(existingOrder, "F_Shipment_Lookup");
    const found = JSON.stringify(findComponentNode(existingOrder, "S_Shipment_Found"));
    const serialized = JSON.stringify(existingOrder);

    expect(lookup).toMatchObject({ type: "function", speak_during_execution: false });
    expect(found).toContain("State {{shipment_safe_summary}} once");
    expect(found).toContain("Do not repeat the shipment summary");
    expect(serialized).toContain("spelling every character");
  });

  it("exposes only the safe shipment summary to the conversation flow", () => {
    const shipmentTool = findTool(component("existingOrder"), "lookup_shipment");

    expect(shipmentTool).toHaveProperty(
      "response_variables.shipment_safe_summary",
      "safe_summary",
    );
    expect(shipmentTool).not.toHaveProperty("response_variables.shipment_carrier");
    expect(JSON.stringify(shipmentTool)).not.toContain("tracking_numbers");
  });

  it("uses purpose-specific contact variables", () => {
    const config = flow();
    const defaults = config.default_dynamic_variables as Record<string, unknown>;

    expect(defaults).toMatchObject({
      callback_phone: "",
      callback_email: "",
      shipment_email: "",
      support_phone: "",
      support_email: "",
    });
    expect(defaults).not.toHaveProperty("confirmed_phone");
    expect(defaults).not.toHaveProperty("confirmed_email");
  });

  it("routes current tool results without persistent status variables", () => {
    const serialized = JSON.stringify({ flow: flow(), components: components() });
    const defaults = flow().default_dynamic_variables as Record<string, unknown>;

    expect(serialized).toContain("current lookup_order tool result has result_code");
    expect(serialized).toContain("current schedule_callback tool result has result_code");
    expect(Object.keys(defaults).some((name) => name.endsWith("_status"))).toBe(false);
    expect(serialized).not.toContain("order_lookup_status");
    expect(serialized).not.toContain("callback_status");
    expect(serialized).not.toContain("support_follow_up_status");
  });

  it("separates no-order matches from provider failures", () => {
    const order = component("existingOrder");
    const lookup = findComponentNode(order, "F_Order_Lookup")!;

    expect(nodeDestinations(lookup)).toContain("S_Alternate_Identifier");
    expect(nodeDestinations(lookup)).toContain("S_Order_System_Failure");
    expect(JSON.stringify(lookup)).toContain("not_found");
  });

  it("never binds an unset order token to unverified human support", () => {
    const humanTool = findTool(
      component("humanEscalation"),
      "record_unverified_support_follow_up",
    );

    expect(humanTool).not.toHaveProperty("parameters.properties.order_candidate_token");
    expect(humanTool).not.toHaveProperty("parameters.required", expect.arrayContaining([
      "order_candidate_token",
    ]));
  });

  it("derives caller last four before speech instead of prompting from the full number", () => {
    const config = flow();
    const prepare = config.nodes.find((node) => node.id === "X_Prepare_Caller_Number");
    const orderIdentifier = JSON.stringify(
      findComponentNode(component("existingOrder"), "S_Order_Identifier"),
    );

    expect(prepare).toMatchObject({ type: "code", speak_during_execution: false });
    expect(orderIdentifier).toContain("{{caller_phone_last_four}}");
    expect(orderIdentifier).not.toContain("{{user_number}}");
  });

  it("keeps knowledge retrieval inside answer-owning components", () => {
    const withKnowledge = components().filter((build) => (
      JSON.stringify(build.config).includes("knowledge_base_ids")
    ));

    expect(withKnowledge.map((build) => build.componentName).sort()).toEqual([
      "existingOrder",
      "knowledge",
      "newProject",
    ]);
    expect(flow()).not.toHaveProperty("knowledge_base_ids");
  });

  it("preserves approved agent settings", () => {
    const agent = buildAgentConfig("conversation_flow_test", 0);

    expect(agent).toMatchObject({
      voice_id: "retell-Brynne",
      voice_temperature: 1,
      responsiveness: 0.85,
      interruption_sensitivity: 0.85,
      data_storage_setting: "everything",
    });
    expect(agent.handbook_config).not.toHaveProperty("echo_verification");
  });
});

function component(name: keyof typeof RETELL_COMPONENT_NAMES) {
  const build = components().find((candidate) => candidate.componentName === name);
  if (!build) {
    throw new Error(`Missing component ${name}`);
  }
  return build.config;
}

function findComponentNode(config: ReturnType<typeof component>, id: string) {
  return config.nodes.find((node) => node.id === id);
}

function findTool(config: ReturnType<typeof component>, name: string) {
  const tool = (config.tools ?? []).find((candidate) => (
    "name" in candidate && candidate.name === name
  ));
  if (!tool) {
    throw new Error(`Missing tool ${name}`);
  }
  return tool;
}

function componentDestination(config: ReturnType<typeof flow>, id: string) {
  const node = config.nodes.find((candidate) => candidate.id === id);
  if (!node || !("else_edge" in node)) {
    return undefined;
  }
  return node.else_edge?.destination_node_id;
}

function nodeDestinations(node: ReturnType<typeof component>["nodes"][number]): string[] {
  const destinations: string[] = [];

  if ("edges" in node) {
    for (const edge of node.edges ?? []) {
      if (edge.destination_node_id) {
        destinations.push(edge.destination_node_id);
      }
    }
  }
  if ("else_edge" in node && node.else_edge?.destination_node_id) {
    destinations.push(node.else_edge.destination_node_id);
  }
  if ("skip_response_edge" in node && node.skip_response_edge?.destination_node_id) {
    destinations.push(node.skip_response_edge.destination_node_id);
  }
  if ("edge" in node && node.edge?.destination_node_id) {
    destinations.push(node.edge.destination_node_id);
  }

  return destinations;
}

function reachableNodeIds(config: ReturnType<typeof component>): Set<string> {
  const nodesById = new Map(config.nodes.map((node) => [node.id, node]));
  const reachable = new Set<string>();
  const pending = [config.start_node_id];

  while (pending.length > 0) {
    const nodeId = pending.pop();
    if (!nodeId || reachable.has(nodeId)) {
      continue;
    }

    const node = nodesById.get(nodeId);
    if (!node) {
      continue;
    }

    reachable.add(nodeId);
    pending.push(...nodeDestinations(node));
  }

  return reachable;
}

function countOccurrences(value: string, search: string): number {
  return value.split(search).length - 1;
}
