import type { AgentCreateParams } from "retell-sdk/resources/agent";
import type { ConversationFlowComponentCreateParams } from "retell-sdk/resources/conversation-flow-component";
import type { ConversationFlowCreateParams } from "retell-sdk/resources/conversation-flow";

type FlowNode = ConversationFlowCreateParams["nodes"][number];
type FlowTool = NonNullable<ConversationFlowCreateParams["tools"]>[number];
type FlowVariable = {
  name: string;
  type: "string" | "boolean" | "enum";
  choices?: string[];
  description: string;
  required?: boolean;
};

const WORKER_BASE_URL = process.env.RETELL_WORKER_BASE_URL?.trim()
  || "https://genstone-ai-customer-agent.travis-m.workers.dev";
const KNOWLEDGE_BASE_ID = "knowledge_base_032c34629284ba5d";
const FLOW_RELEASE = "genstone_customer_agent_v74";
const COMPONENT_RELEASE = "v74";

export const RETELL_COMPONENT_NAMES = {
  greeting: `GenStone — Greeting — ${COMPONENT_RELEASE}`,
  understandRequest: `GenStone — Understand Request — ${COMPONENT_RELEASE}`,
  newProject: `GenStone — New Project — ${COMPONENT_RELEASE}`,
  existingOrder: `GenStone — Existing Order — ${COMPONENT_RELEASE}`,
  knowledge: `GenStone — Knowledge Answer — ${COMPONENT_RELEASE}`,
  humanEscalation: `GenStone — Human Escalation — ${COMPONENT_RELEASE}`,
  namedEmployee: `GenStone — Named Employee Transfer — ${COMPONENT_RELEASE}`,
  doNotCall: `GenStone — Do Not Call — ${COMPONENT_RELEASE}`,
} as const;

export type RetellComponentName = keyof typeof RETELL_COMPONENT_NAMES;
export type RetellComponentIds = Record<RetellComponentName, string>;

type BuildConfigInput = {
  componentIds: RetellComponentIds;
};

type ComponentBuildInput = {
  workerApiKey: string;
};

export type RetellComponentBuild = {
  componentName: RetellComponentName;
  config: ConversationFlowComponentCreateParams;
};

type ToolInput = {
  name: string;
  route: string;
  description: string;
  properties: Record<string, unknown>;
  required: string[];
  responseVariables: Record<string, string>;
  workerApiKey: string;
  speakDuringExecution?: boolean;
  executionMessage?: string;
};

const defaultDynamicVariables = {
  caller_name: "",
  caller_phone_last_four: "",
  primary_route: "unknown",
  pending_request: "",
  next_responsibility: "",
  order_lookup_identifier_type: "",
  order_lookup_identifier: "",
  callback_phone: "",
  callback_email: "",
  shipment_email: "",
  support_phone: "",
  support_email: "",
  order_verified: "false",
  order_candidate_token: "",
  existing_request_route: "unknown",
  human_request_type: "unknown",
} as const;

function prompt(text: string) {
  return { type: "prompt" as const, text };
}

function staticText(text: string) {
  return { type: "static_text" as const, text };
}

function promptCondition(text: string) {
  return { type: "prompt" as const, prompt: text };
}

function toolResultCondition(toolName: string, resultCodes: string[]) {
  const formattedCodes = resultCodes.map((code) => `\`${code}\``).join(" or ");
  return promptCondition(
    `The current ${toolName} tool result has result_code ${formattedCodes}.`,
  );
}

function equationCondition(
  variable: string,
  value: string,
  operator: "==" | "!=" = "==",
) {
  return {
    type: "equation" as const,
    operator: "&&" as const,
    equations: [{ left: `{{${variable}}}`, operator, right: value }],
  };
}

function promptEdge(id: string, destination: string, condition: string) {
  return {
    id,
    destination_node_id: destination,
    transition_condition: promptCondition(condition),
  };
}

function skipResponseEdge(id: string, destination: string) {
  return promptEdge(id, destination, "Skip response");
}

function equationEdge(id: string, destination: string, variable: string, value: string) {
  return {
    id,
    destination_node_id: destination,
    transition_condition: equationCondition(variable, value),
  };
}

function toolResultEdge(
  id: string,
  destination: string,
  toolName: string,
  resultCodes: string[],
) {
  return {
    id,
    destination_node_id: destination,
    transition_condition: toolResultCondition(toolName, resultCodes),
  };
}

function elseEdge(id: string, destination: string) {
  return {
    id,
    destination_node_id: destination,
    transition_condition: promptCondition("Else"),
  };
}

function dynamicString(variable: string, description: string) {
  return { type: "string", description, const: `{{${variable}}}` };
}

function customTool(input: ToolInput): FlowTool {
  return {
    type: "custom",
    name: input.name,
    tool_id: `tool_${input.name}`,
    description: input.description,
    url: `${WORKER_BASE_URL}${input.route}`,
    method: "POST",
    args_at_root: true,
    parameter_type: "json",
    headers: { Authorization: `Bearer ${input.workerApiKey}` },
    parameters: {
      type: "object",
      properties: input.properties,
      required: input.required,
    },
    ...(Object.keys(input.responseVariables).length > 0
      ? { response_variables: input.responseVariables }
      : {}),
    speak_during_execution: input.speakDuringExecution ?? false,
    speak_after_execution: false,
    execution_message_type: "static_text",
    execution_message_description: input.executionMessage ?? "One moment while I check that.",
    timeout_ms: 30_000,
  } as FlowTool;
}

function subagent(input: {
  id: string;
  instruction: string;
  knowledgeBase?: boolean;
  edges: Array<ReturnType<typeof promptEdge> | ReturnType<typeof equationEdge>>;
  elseDestination?: string;
  globalNodeSetting?: Record<string, unknown>;
}): FlowNode {
  return {
    id: input.id,
    name: input.id,
    type: "subagent",
    instruction: prompt(input.instruction),
    tool_ids: [],
    tools: [],
    edges: input.edges,
    ...(input.elseDestination
      ? { else_edge: elseEdge(`${input.id}_else`, input.elseDestination) }
      : {}),
    ...(input.knowledgeBase
      ? {
          knowledge_base_ids: [KNOWLEDGE_BASE_ID],
          kb_config: { top_k: 3, filter_score: 0.6 },
        }
      : {}),
    ...(input.globalNodeSetting ? { global_node_setting: input.globalNodeSetting } : {}),
  } as FlowNode;
}

type Equation = {
  left: string;
  operator: "==" | "!=";
  right: string;
};

function equationGroupEdge(
  id: string,
  destination: string,
  equations: Equation[],
  operator: "&&" | "||" = "&&",
) {
  return {
    id,
    destination_node_id: destination,
    transition_condition: {
      type: "equation" as const,
      operator,
      equations,
    },
  };
}

function extractVariablesNode(input: {
  id: string;
  variables: FlowVariable[];
  edges?: ReturnType<typeof equationGroupEdge>[];
  elseDestination: string;
}): FlowNode {
  return {
    id: input.id,
    name: input.id,
    type: "extract_dynamic_variables",
    variables: input.variables,
    enable_typing_sound: false,
    edges: input.edges ?? [],
    else_edge: elseEdge(`${input.id}_else`, input.elseDestination),
  } as FlowNode;
}

function nonEmptyVariablesEdge(
  id: string,
  destination: string,
  variables: string[],
) {
  return equationGroupEdge(
    id,
    destination,
    variables.map((variable) => ({
      left: `{{${variable}}}`,
      operator: "!=",
      right: "",
    })),
  );
}

function enumValueEdges(
  idPrefix: string,
  destination: string,
  variable: string,
  values: string[],
) {
  return values.map((value) => equationGroupEdge(
    `${idPrefix}_${value}`,
    destination,
    [{ left: `{{${variable}}}`, operator: "==", right: value }],
  ));
}

function responsibilityHandoffCaptureNode(input: {
  id: string;
  choices: string[];
  destination: string;
  retryDestination: string;
}): FlowNode {
  return extractVariablesNode({
    id: input.id,
    variables: responsibilityHandoffVariables(input.choices),
    edges: input.choices.map((choice) => equationGroupEdge(
      `${input.id}_${choice}`,
      input.destination,
      [
        { left: "{{next_responsibility}}", operator: "==", right: choice },
        { left: "{{pending_request}}", operator: "!=", right: "" },
      ],
    )),
    elseDestination: input.retryDestination,
  });
}

function clearHandoffNode(id: string, destination: string): FlowNode {
  return {
    id,
    name: id,
    type: "code",
    code: 'return { next_responsibility: "", pending_request: "" };',
    wait_for_result: true,
    speak_during_execution: false,
    response_variables: {
      next_responsibility: "next_responsibility",
      pending_request: "pending_request",
    },
    else_edge: elseEdge(`${id}_complete`, destination),
  } as FlowNode;
}

function clearStringVariablesNode(
  id: string,
  variables: string[],
  destination: string,
): FlowNode {
  const cleared = Object.fromEntries(variables.map((variable) => [variable, ""]));
  const responseVariables = Object.fromEntries(
    variables.map((variable) => [variable, variable]),
  );

  return {
    id,
    name: id,
    type: "code",
    code: `return ${JSON.stringify(cleared)};`,
    wait_for_result: true,
    speak_during_execution: false,
    response_variables: responseVariables,
    else_edge: elseEdge(`${id}_complete`, destination),
  } as FlowNode;
}

function responsibilityHandoffVariables(choices: string[]): FlowVariable[] {
  return [
    {
      name: "next_responsibility",
      type: "enum",
      choices,
      description: "Set only when the caller clearly changes to another broad responsibility.",
    },
    {
      name: "pending_request",
      type: "string",
      description: "A concise handoff of the new request for the destination responsibility.",
    },
  ];
}

function resetOrderNode(id: string, destination: string): FlowNode {
  return {
    id,
    name: id,
    type: "code",
    code: `return {
      order_verified: false,
      order_candidate_token: "",
      order_type_summary: "",
      order_item_summary: "",
      shipment_safe_summary: "",
      order_lookup_identifier_type: "",
      order_lookup_identifier: "",
      existing_request_route: "unknown"
    };`,
    wait_for_result: true,
    speak_during_execution: false,
    response_variables: {
      order_verified: "order_verified",
      order_candidate_token: "order_candidate_token",
      order_type_summary: "order_type_summary",
      order_item_summary: "order_item_summary",
      shipment_safe_summary: "shipment_safe_summary",
      order_lookup_identifier_type: "order_lookup_identifier_type",
      order_lookup_identifier: "order_lookup_identifier",
      existing_request_route: "existing_request_route",
    },
    else_edge: elseEdge(`${id}_complete`, destination),
  } as FlowNode;
}

function resetExistingRequestRouteNode(id: string, destination: string): FlowNode {
  return {
    id,
    name: id,
    type: "code",
    code: 'return { existing_request_route: "unknown" };',
    wait_for_result: true,
    speak_during_execution: false,
    response_variables: { existing_request_route: "existing_request_route" },
    else_edge: elseEdge(`${id}_complete`, destination),
  } as FlowNode;
}

function prepareCallerNumberNode(destination: string): FlowNode {
  return {
    id: "X_Prepare_Caller_Number",
    name: "X_Prepare_Caller_Number",
    type: "code",
    code: 'const digits = "{{user_number}}".replace(/\\D/g, ""); return { caller_phone_last_four: digits.slice(-4) };',
    wait_for_result: true,
    speak_during_execution: false,
    response_variables: { caller_phone_last_four: "caller_phone_last_four" },
    else_edge: elseEdge("X_Prepare_Caller_Number_complete", destination),
  } as FlowNode;
}

function functionResultNode(input: {
  id: string;
  toolName: string;
  edges: ReturnType<typeof toolResultEdge>[];
  elseDestination: string;
  executionMessage?: string;
}): FlowNode {
  return {
    id: input.id,
    name: input.id,
    type: "function",
    tool_id: `tool_${input.toolName}`,
    tool_type: "local",
    wait_for_result: true,
    speak_during_execution: Boolean(input.executionMessage),
    ...(input.executionMessage
      ? { instruction: staticText(input.executionMessage) }
      : {}),
    edges: input.edges,
    else_edge: elseEdge(`${input.id}_else`, input.elseDestination),
  } as FlowNode;
}

function branchNode(input: {
  id: string;
  edges: Array<ReturnType<typeof promptEdge> | ReturnType<typeof equationEdge>>;
  elseDestination: string;
}): FlowNode {
  return {
    id: input.id,
    name: input.id,
    type: "branch",
    edges: input.edges,
    else_edge: elseEdge(`${input.id}_else`, input.elseDestination),
  } as FlowNode;
}

function staticConversationNode(input: {
  id: string;
  text: string;
  destination: string;
}): FlowNode {
  return {
    id: input.id,
    name: input.id,
    type: "conversation",
    instruction: staticText(input.text),
    edges: [],
    skip_response_edge: skipResponseEdge(`${input.id}_complete`, input.destination),
  } as FlowNode;
}

function endNode(): FlowNode {
  return {
    id: "E_Call_Complete",
    name: "E_Call_Complete",
    type: "end",
    speak_during_execution: true,
    execution_message_type: "static_text",
    execution_message_description: "Thank you for calling GenStone. Have a great day. Goodbye.",
  } as FlowNode;
}

function componentExit(id: string): FlowNode {
  return {
    id,
    name: id,
    type: "end",
    speak_during_execution: false,
  } as FlowNode;
}

function speakingComponentExit(id: string, message: string): FlowNode {
  return {
    id,
    name: id,
    type: "end",
    speak_during_execution: true,
    execution_message_type: "static_text",
    execution_message_description: message,
  } as FlowNode;
}

function componentNode(input: {
  id: string;
  componentId: string;
  destination?: string;
  globalNodeSetting?: Record<string, unknown>;
}): FlowNode {
  return {
    id: input.id,
    name: input.id,
    type: "component",
    component_id: input.componentId,
    component_type: "shared",
    edges: [],
    ...(input.destination
      ? { else_edge: elseEdge(`${input.id}_exit`, input.destination) }
      : {}),
    ...(input.globalNodeSetting
      ? { global_node_setting: input.globalNodeSetting }
      : {}),
  } as FlowNode;
}

type CanvasPosition = { x: number; y: number };

function placeNodes(
  nodes: FlowNode[],
  positions: Record<string, CanvasPosition>,
): FlowNode[] {
  return nodes.map((node) => {
    const displayPosition = positions[node.id];
    if (!displayPosition) {
      throw new Error(`Missing canvas position for Retell node: ${node.id}`);
    }

    return { ...node, display_position: displayPosition } as FlowNode;
  });
}

function placeComponent(
  config: ConversationFlowComponentCreateParams,
  positions: Record<string, CanvasPosition>,
  beginPosition: CanvasPosition = { x: -360, y: 0 },
): ConversationFlowComponentCreateParams {
  return {
    ...config,
    begin_tag_display_position: beginPosition,
    nodes: placeNodes(config.nodes as FlowNode[], positions) as ConversationFlowComponentCreateParams["nodes"],
  };
}

function componentConfig(input: {
  name: string;
  startNodeId: string;
  nodes: FlowNode[];
  tools?: FlowTool[];
}): ConversationFlowComponentCreateParams {
  return {
    name: input.name,
    start_node_id: input.startNodeId,
    nodes: input.nodes as ConversationFlowComponentCreateParams["nodes"],
    tools: input.tools as ConversationFlowComponentCreateParams["tools"],
  };
}

function selectTools(tools: FlowTool[], names: string[]): FlowTool[] {
  const selected = tools.filter((tool) => (
    "name" in tool && typeof tool.name === "string" && names.includes(tool.name)
  ));

  if (selected.length !== names.length) {
    throw new Error(`Missing Retell tool while building component: ${names.join(", ")}`);
  }

  return selected;
}

function transferCallNode(input: {
  id: string;
  name: string;
  number: string;
  message: string;
  whisper: string;
  failureDestination: string;
}): FlowNode {
  return {
    type: "transfer_call",
    id: input.id,
    name: input.name,
    transfer_destination: { type: "predefined", number: input.number },
    transfer_option: {
      type: "warm_transfer",
      opt_out_human_detection: false,
      agent_detection_timeout_ms: 30_000,
      transfer_ring_duration_ms: 30_000,
      enable_bridge_audio_cue: true,
      show_transferee_as_caller: true,
      private_handoff_option: { type: "prompt", prompt: input.whisper },
    },
    speak_during_execution: true,
    instruction: staticText(input.message),
    edge: {
      id: `${input.id}_failed`,
      destination_node_id: input.failureDestination,
      transition_condition: promptCondition("Transfer failed"),
    },
  } as FlowNode;
}

function buildTools(workerApiKey: string): FlowTool[] {
  const callId = dynamicString("call_id", "Retell call reference.");
  const supportProperties = {
    call_id: callId,
    idempotency_key: {
      type: "string",
      const: "{{call_id}}:record_support_follow_up",
    },
    primary_route: { type: "string", const: "existing_order" },
    customer_name: dynamicString("caller_name", "The caller's supplied name."),
    confirmed_phone: dynamicString(
      "support_phone",
      "The complete phone confirmed for support follow-up.",
    ),
    customer_email: dynamicString(
      "support_email",
      "The complete email confirmed for support follow-up.",
    ),
    caller_type: {
      type: "string",
      enum: ["customer", "contractor", "distributor", "retail_partner", "other"],
      description: "Caller role inferred from the conversation.",
    },
    caller_country: {
      type: "string",
      enum: ["united_states", "canada", "other_country"],
      description: "Country only when volunteered.",
    },
    support_summary: {
      type: "string",
      description: "A factual summary of the unresolved request and relevant details already supplied.",
    },
    communication_preference: {
      type: "string",
      description: "Any follow-up preference the caller volunteered.",
    },
    urgency_context: {
      type: "string",
      description: "Any factual urgency or frustration context.",
    },
  };
  const supportRequired = [
    "call_id",
    "idempotency_key",
    "primary_route",
    "customer_name",
    "confirmed_phone",
    "customer_email",
    "caller_type",
    "support_summary",
  ];

  return [
    customTool({
      name: "lookup_order",
      route: "/v1/retell/tools/orders/lookup",
      description: "Find non-quote orders by a caller-confirmed phone, email, or order number.",
      workerApiKey,
      properties: {
        call_id: callId,
        identifier_type: dynamicString(
          "order_lookup_identifier_type",
          "The confirmed order identifier type: phone, email, or order_number.",
        ),
        identifier: dynamicString(
          "order_lookup_identifier",
          "The complete caller-confirmed order lookup value.",
        ),
      },
      required: ["call_id", "identifier_type", "identifier"],
      responseVariables: {
        order_candidate_token: "data.order_candidate_token",
        order_type_summary: "data.order_type_summary",
        order_item_summary: "data.order_item_summary",
      },
    }),
    customTool({
      name: "next_order_candidate",
      route: "/v1/retell/tools/orders/lookup",
      description: "Read the next retained order after the caller rejects a candidate.",
      workerApiKey,
      properties: {
        call_id: callId,
        previous_order_candidate_token: dynamicString(
          "order_candidate_token",
          "The rejected candidate token.",
        ),
      },
      required: ["call_id", "previous_order_candidate_token"],
      responseVariables: {
        order_candidate_token: "data.order_candidate_token",
        order_type_summary: "data.order_type_summary",
        order_item_summary: "data.order_item_summary",
      },
    }),
    customTool({
      name: "confirm_order",
      route: "/v1/retell/tools/orders/confirm",
      description: "Mark the presented order as confirmed after the caller accepts its items.",
      workerApiKey,
      properties: {
        call_id: callId,
        order_candidate_token: dynamicString("order_candidate_token", "The accepted order token."),
      },
      required: ["call_id", "order_candidate_token"],
      responseVariables: {
        order_verified: "ok",
        order_candidate_token: "data.order_candidate_token",
      },
    }),
    customTool({
      name: "lookup_shipment",
      route: "/v1/retell/tools/shipments/lookup",
      description: "Read stored shipment data for the verified order.",
      workerApiKey,
      properties: {
        call_id: callId,
        order_candidate_token: dynamicString("order_candidate_token", "Verified order token."),
      },
      required: ["call_id", "order_candidate_token"],
      responseVariables: {
        shipment_safe_summary: "safe_summary",
      },
    }),
    customTool({
      name: "email_shipment_tracking",
      route: "/v1/retell/tools/shipments/email",
      description: "Email stored shipment details after the caller requests it and confirms the destination.",
      workerApiKey,
      properties: {
        call_id: callId,
        idempotency_key: { type: "string", const: "{{call_id}}:email_shipment_tracking" },
        order_candidate_token: dynamicString("order_candidate_token", "Verified order token."),
        shipment_email: dynamicString(
          "shipment_email",
          "The complete shipment destination email the caller confirmed.",
        ),
      },
      required: ["call_id", "idempotency_key", "order_candidate_token", "shipment_email"],
      responseVariables: {},
    }),
    customTool({
      name: "lookup_contact_by_phone",
      route: "/v1/retell/tools/contacts/lookup",
      description: "Find a Salesforce contact by confirmed phone.",
      workerApiKey,
      properties: {
        call_id: callId,
        phone: dynamicString(
          "support_phone",
          "The complete phone confirmed for support follow-up.",
        ),
      },
      required: ["call_id", "phone"],
      responseVariables: {},
    }),
    customTool({
      name: "lookup_contact_by_email",
      route: "/v1/retell/tools/contacts/lookup",
      description: "Retry Salesforce contact lookup by confirmed email after phone does not match.",
      workerApiKey,
      properties: {
        call_id: callId,
        email: dynamicString(
          "support_email",
          "The complete email confirmed for support follow-up.",
        ),
      },
      required: ["call_id", "email"],
      responseVariables: {},
    }),
    customTool({
      name: "record_support_follow_up",
      route: "/v1/retell/tools/support/follow-up",
      description: "Create the call's private support follow-up, or append related information to it.",
      workerApiKey,
      properties: {
        ...supportProperties,
        order_candidate_token: dynamicString("order_candidate_token", "Verified order token when available."),
      },
      required: [...supportRequired, "order_candidate_token"],
      responseVariables: {},
    }),
    customTool({
      name: "record_unverified_support_follow_up",
      route: "/v1/retell/tools/support/follow-up",
      description: "Record private existing-order follow-up when no verified order token is available.",
      workerApiKey,
      properties: supportProperties,
      required: supportRequired,
      responseVariables: {},
    }),
    customTool({
      name: "check_business_hours",
      route: "/v1/retell/tools/business-hours/status",
      description: "Check current GenStone transfer availability.",
      workerApiKey,
      properties: { call_id: callId },
      required: ["call_id"],
      responseVariables: {},
    }),
    customTool({
      name: "schedule_callback",
      route: "/v1/retell/tools/callbacks/schedule",
      description: "Schedule an internal new-project callback request.",
      workerApiKey,
      properties: {
        call_id: callId,
        idempotency_key: { type: "string", const: "{{call_id}}:schedule_callback" },
        primary_route: { type: "string", const: "new_project" },
        customer_name: dynamicString("caller_name", "The caller's supplied name."),
        callback_subject: { type: "string", description: "A short subject for the new-project callback." },
        callback_summary: { type: "string", description: "A factual summary of the caller's project needs." },
        callback_date: { type: "string", description: "The caller-confirmed callback date in YYYY-MM-DD." },
        callback_time: { type: "string", description: "The caller-confirmed Mountain time in HH:mm." },
        callback_phone: dynamicString(
          "callback_phone",
          "The complete callback phone confirmed by the caller.",
        ),
        customer_email: dynamicString(
          "callback_email",
          "The complete callback email confirmed by the caller.",
        ),
        communication_preference: { type: "string", description: "Any follow-up preference the caller volunteered." },
        urgency_context: { type: "string", description: "Any factual urgency context." },
      },
      required: ["call_id", "idempotency_key", "primary_route", "customer_name", "callback_subject", "callback_summary", "callback_date", "callback_time", "callback_phone", "customer_email"],
      responseVariables: {},
    }),
    customTool({
      name: "lookup_active_employee",
      route: "/v1/retell/tools/employees/lookup",
      description: "Find one active GenStone employee by the caller-supplied name.",
      workerApiKey,
      properties: {
        call_id: callId,
        employee_name: { type: "string", description: "The employee name the caller just supplied." },
      },
      required: ["call_id", "employee_name"],
      responseVariables: {
        employee_display_name: "data.employee_name",
        employee_transfer_target: "data.transfer_destination",
      },
    }),
    customTool({
      name: "suppress_phone_number",
      route: "/v1/retell/tools/dnc/suppress",
      description: "Add a caller-confirmed number to do-not-call.",
      workerApiKey,
      properties: {
        call_id: callId,
        idempotency_key: { type: "string", const: "{{call_id}}:suppress_phone_number" },
        dnc_phone: { type: "string", description: "The complete phone number the caller confirmed for suppression." },
        dnc_confirmed: { type: "boolean", const: true, description: "The caller explicitly confirmed suppression." },
      },
      required: ["call_id", "idempotency_key", "dnc_phone", "dnc_confirmed"],
      responseVariables: {},
    }),
  ];
}

function buildGreetingComponent(): ConversationFlowComponentCreateParams {
  const exit = "E_Greeting";

  return componentConfig({
    name: RETELL_COMPONENT_NAMES.greeting,
    startNodeId: "S_Greeting",
    nodes: [
      subagent({
        id: "S_Greeting",
        instruction: "Say exactly: Thank you for calling GenStone. Who do I have the pleasure of speaking with? Capture the caller's name, then exit. If the caller instead makes an explicit do-not-call request, exit without requiring a name so intake can classify it. Do not ask what the call is about here.",
        edges: [
          promptEdge(
            "greeting_name_supplied",
            "X_Capture_Caller_Name",
            "The caller supplied their name.",
          ),
          promptEdge(
            "greeting_dnc_without_name",
            exit,
            "The caller made an explicit do-not-call request instead of supplying a name.",
          ),
        ],
      }),
      extractVariablesNode({
        id: "X_Capture_Caller_Name",
        variables: [
          { name: "caller_name", type: "string", description: "The caller's name when supplied." },
        ],
        edges: [nonEmptyVariablesEdge(
          "caller_name_captured",
          exit,
          ["caller_name"],
        )],
        elseDestination: "S_Greeting",
      }),
      componentExit(exit),
    ],
  });
}

function buildUnderstandRequestComponent(): ConversationFlowComponentCreateParams {
  const exit = "E_Understand_Request";

  return componentConfig({
    name: RETELL_COMPONENT_NAMES.understandRequest,
    startNodeId: "S_Understand_Request",
    nodes: [
      subagent({
        id: "S_Understand_Request",
        instruction: "Ask: Are you calling about an existing order or a new project? Classify the response as new_project, existing_order, general, or do_not_call.",
        edges: [promptEdge("request_understood", "X_Capture_Primary_Route", "The caller supplied enough information to select exactly one broad responsibility.")],
      }),
      extractVariablesNode({
        id: "X_Capture_Primary_Route",
        variables: [
          { name: "primary_route", type: "enum", choices: ["new_project", "existing_order", "general", "do_not_call"], description: "The broad responsibility selected by the caller." },
        ],
        edges: enumValueEdges(
          "primary_route",
          exit,
          "primary_route",
          ["new_project", "existing_order", "general", "do_not_call"],
        ),
        elseDestination: "S_Understand_Request",
      }),
      componentExit(exit),
    ],
  });
}

function buildNewProjectComponent(tools: FlowTool[]): ConversationFlowComponentCreateParams {
  const exit = "E_New_Project";

  return componentConfig({
    name: RETELL_COMPONENT_NAMES.newProject,
    startNodeId: "S_Project_Request",
    tools: selectTools(tools, ["check_business_hours", "schedule_callback"]),
    nodes: [
      subagent({
        id: "S_Project_Request",
        instruction: "If {{pending_request}} contains a request, use it as the current new-project request. Otherwise ask: How can I help? only when the request is not known. If the request is clearly for an existing order or General Knowledge instead, capture next_responsibility and pending_request, then exit.",
        edges: [
          promptEdge("project_context_changed", "X_Capture_Project_Request_Handoff", "The current request clearly belongs to Existing Order or General Knowledge."),
          promptEdge("project_request_ready", "X_Clear_Project_Request", "The caller's new-project request is understood."),
        ],
      }),
      responsibilityHandoffCaptureNode({
        id: "X_Capture_Project_Request_Handoff",
        choices: ["existing_order", "general"],
        destination: exit,
        retryDestination: "S_Project_Request",
      }),
      clearHandoffNode("X_Clear_Project_Request", "L_Project_Request"),
      branchNode({
        id: "L_Project_Request",
        edges: [promptEdge("project_question", "S_Project_Knowledge", "The caller asked a factual GenStone question that approved knowledge may answer.")],
        elseDestination: "F_Project_Hours",
      }),
      subagent({
        id: "S_Project_Knowledge",
        instruction: "Answer new-project questions concisely from approved knowledge and continue with questions about the same project. If the caller clearly changes to an existing order or General Knowledge, capture next_responsibility and pending_request, then exit. Continue to human follow-up only when the caller requests it or approved knowledge cannot answer.",
        knowledgeBase: true,
        edges: [
          promptEdge("project_knowledge_context_changed", "X_Capture_Project_Knowledge_Handoff", "The caller clearly changed to Existing Order or General Knowledge."),
          promptEdge("project_knowledge_follow_up", "F_Project_Hours", "The caller requested human follow-up or approved knowledge could not answer the request."),
        ],
      }),
      responsibilityHandoffCaptureNode({
        id: "X_Capture_Project_Knowledge_Handoff",
        choices: ["existing_order", "general"],
        destination: exit,
        retryDestination: "S_Project_Knowledge",
      }),
      functionResultNode({
        id: "F_Project_Hours",
        toolName: "check_business_hours",
        edges: [toolResultEdge("project_open", "S_Project_Transfer", "check_business_hours", ["open"])],
        elseDestination: "S_Project_Callback",
      }),
      subagent({
        id: "S_Project_Transfer",
        instruction: "Offer to connect the caller with a project coordinator. Continue to the transfer only if they agree. If they decline, collect a callback. If they ask another question instead of deciding, return to new-project question handling.",
        edges: [
          promptEdge("project_transfer_agreed", "T_Project_Coordinator", "The caller agrees to the transfer."),
          promptEdge("project_transfer_declined", "S_Project_Callback", "The caller declines the transfer."),
          promptEdge("project_transfer_new_question", "S_Project_Knowledge", "The caller asks another question instead of accepting or declining the transfer."),
        ],
      }),
      transferCallNode({
        id: "T_Project_Coordinator",
        name: "Transfer Project Coordinator",
        number: "+13038764333",
        message: "I’ll connect you with a project coordinator now.",
        whisper: "This is a GenStone new-project caller. Briefly share the caller name and stated project need.",
        failureDestination: "S_Project_Callback",
      }),
      subagent({
        id: "S_Project_Callback",
        instruction: "Collect only missing callback details: name, phone, email, project summary, and a weekday date and time from 8:30 AM through 4:30 PM Mountain, no earlier than the next business day. Confirm the email by spelling every character, saying at and dot, and waiting for confirmation. Confirm the date and time once. If the caller stops scheduling and asks another question, return to new-project question handling.",
        edges: [
          promptEdge("callback_cancelled_for_question", "S_Project_Knowledge", "The caller stops callback scheduling and asks another question."),
          promptEdge("callback_ready", "X_Capture_Project_Callback", "All required callback details were confirmed."),
        ],
      }),
      extractVariablesNode({
        id: "X_Capture_Project_Callback",
        variables: [
          { name: "callback_phone", type: "string", description: "The callback phone confirmed by the caller." },
          { name: "callback_email", type: "string", description: "The callback email confirmed by the caller." },
        ],
        edges: [nonEmptyVariablesEdge(
          "project_callback_contact_ready",
          "F_Project_Callback",
          ["caller_name", "callback_phone", "callback_email"],
        )],
        elseDestination: "S_Project_Callback",
      }),
      functionResultNode({
        id: "F_Project_Callback",
        toolName: "schedule_callback",
        edges: [
          toolResultEdge("callback_scheduled", "S_Project_Continue", "schedule_callback", ["scheduled"]),
          toolResultEdge("callback_invalid", "S_Project_Callback", "schedule_callback", ["invalid_day_or_time"]),
        ],
        elseDestination: "C_Callback_Failed",
      }),
      staticConversationNode({
        id: "C_Callback_Failed",
        text: "We're experiencing some internal system issues and couldn't complete the callback request. If you don't hear from us soon, please call us again during normal business hours.",
        destination: exit,
      }),
      subagent({
        id: "S_Project_Continue",
        instruction: "Say: Your callback has been scheduled. Then ask: Is there anything else I can help you with? If the caller has another question about the same project, return to new-project question handling. If they clearly change to Existing Order or General Knowledge, capture next_responsibility and pending_request, then exit. If they need nothing else, exit.",
        knowledgeBase: true,
        edges: [
          promptEdge("project_continue_same", "S_Project_Knowledge", "The caller asks another question about the same new project."),
          promptEdge("project_continue_handoff", "X_Capture_Project_Continue_Handoff", "The caller changed to Existing Order or General Knowledge."),
          promptEdge("project_continue_complete", exit, "The caller needs nothing else."),
        ],
      }),
      responsibilityHandoffCaptureNode({
        id: "X_Capture_Project_Continue_Handoff",
        choices: ["existing_order", "general"],
        destination: exit,
        retryDestination: "S_Project_Continue",
      }),
      componentExit(exit),
    ],
  });
}

function buildExistingOrderComponent(tools: FlowTool[]): ConversationFlowComponentCreateParams {
  const exit = "E_Existing_Order";
  const exitGate = "X_Exit_Existing_Order";

  return componentConfig({
    name: RETELL_COMPONENT_NAMES.existingOrder,
    startNodeId: "L_Order_Entry",
    tools: selectTools(tools, [
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
    ]),
    nodes: [
      branchNode({
        id: "L_Order_Entry",
        edges: [equationEdge("order_already_verified", "X_Prepare_Existing_Request", "order_verified", "true")],
        elseDestination: "S_Order_Identifier",
      }),
      subagent({
        id: "S_Order_Identifier",
        instruction: "Ask whether the phone ending in {{caller_phone_last_four}} is correct for the order. Accept a different phone number, email, or order number. Before an email lookup, spell every character of the complete address, say at and dot, and wait for confirmation. Capture the confirmed value as order_lookup_identifier and its type as order_lookup_identifier_type. Retain {{pending_request}} until the order is verified. If this is clearly a New Project or General Knowledge request instead, capture next_responsibility and pending_request, then exit.",
        edges: [
          promptEdge("identifier_context_changed", "X_Capture_Identifier_Handoff", "The request clearly belongs to New Project or General Knowledge."),
          promptEdge("identifier_confirmed", "X_Capture_Order_Identifier", "The caller confirmed the complete lookup value and its type."),
        ],
      }),
      responsibilityHandoffCaptureNode({
        id: "X_Capture_Identifier_Handoff",
        choices: ["new_project", "general"],
        destination: exitGate,
        retryDestination: "S_Order_Identifier",
      }),
      extractVariablesNode({
        id: "X_Capture_Order_Identifier",
        variables: [
          { name: "order_lookup_identifier_type", type: "enum", choices: ["phone", "email", "order_number"], description: "The caller-confirmed order lookup identifier type." },
          { name: "order_lookup_identifier", type: "string", description: "The complete caller-confirmed order lookup value." },
        ],
        edges: ["phone", "email", "order_number"].map((identifierType) => equationGroupEdge(
          `order_identifier_${identifierType}`,
          "F_Order_Lookup",
          [
            { left: "{{order_lookup_identifier_type}}", operator: "==", right: identifierType },
            { left: "{{order_lookup_identifier}}", operator: "!=", right: "" },
          ],
        )),
        elseDestination: "S_Order_Identifier",
      }),
      functionResultNode({
        id: "F_Order_Lookup",
        toolName: "lookup_order",
        executionMessage: "Thank you. Just give me a moment to look up your order.",
        edges: [
          toolResultEdge("order_found", "S_Order_Candidate", "lookup_order", ["found"]),
          toolResultEdge("order_not_found", "S_Alternate_Identifier", "lookup_order", ["not_found", "validation_failed"]),
        ],
        elseDestination: "S_Order_System_Failure",
      }),
      subagent({
        id: "S_Order_Candidate",
        instruction: "State {{order_type_summary}} and {{order_item_summary}} once. Ask whether this is the order the caller means. Do not repeat the items after the caller answers. Retain {{pending_request}} until the order is verified.",
        edges: [
          promptEdge("candidate_accepted", "F_Order_Confirm", "The caller confirms this candidate is the intended order."),
          promptEdge("candidate_rejected", "F_Next_Candidate", "The caller says this is not the intended order."),
        ],
      }),
      functionResultNode({
        id: "F_Next_Candidate",
        toolName: "next_order_candidate",
        edges: [
          toolResultEdge("next_found", "S_Order_Candidate", "next_order_candidate", ["found"]),
          toolResultEdge("next_exhausted", "S_Alternate_Identifier", "next_order_candidate", ["no_more_candidates"]),
        ],
        elseDestination: "S_Order_System_Failure",
      }),
      subagent({
        id: "S_Alternate_Identifier",
        instruction: "Say once that no order matched the last confirmed value, then ask for one different phone number, email, or order number. For an email, spell the complete address character by character, say at and dot, and wait for confirmation before searching. Capture the new value as order_lookup_identifier and its type as order_lookup_identifier_type. If the caller cannot provide another identifier, continue to customer-service handling. Retain {{pending_request}} until the request can be handled.",
        edges: [
          promptEdge("alternate_unavailable", "F_Service_Hours", "The caller cannot provide another supported order identifier."),
          promptEdge("alternate_confirmed", "X_Capture_Alternate_Identifier", "The caller confirmed a different complete lookup value and its type."),
        ],
      }),
      extractVariablesNode({
        id: "X_Capture_Alternate_Identifier",
        variables: [
          { name: "order_lookup_identifier_type", type: "enum", choices: ["phone", "email", "order_number"], description: "The new caller-confirmed order lookup identifier type." },
          { name: "order_lookup_identifier", type: "string", description: "The complete new caller-confirmed order lookup value." },
        ],
        edges: ["phone", "email", "order_number"].map((identifierType) => equationGroupEdge(
          `alternate_identifier_${identifierType}`,
          "F_Order_Lookup",
          [
            { left: "{{order_lookup_identifier_type}}", operator: "==", right: identifierType },
            { left: "{{order_lookup_identifier}}", operator: "!=", right: "" },
          ],
        )),
        elseDestination: "S_Alternate_Identifier",
      }),
      functionResultNode({
        id: "F_Order_Confirm",
        toolName: "confirm_order",
        edges: [toolResultEdge("order_confirmed", "X_Prepare_Existing_Request", "confirm_order", ["confirmed"])],
        elseDestination: "S_Order_System_Failure",
      }),
      subagent({
        id: "S_Order_System_Failure",
        instruction: "Say: I'm sorry, I'm having trouble accessing the order information right now. It could be due to our system. Could you please briefly describe what you're calling about so our team can follow up? Continue after the caller describes the request.",
        edges: [promptEdge("order_failure_request_captured", "F_Service_Hours", "The caller briefly described the existing-order request that needs follow-up.")],
      }),
      resetExistingRequestRouteNode("X_Prepare_Existing_Request", "S_Existing_Request"),
      subagent({
        id: "S_Existing_Request",
        instruction: "Use {{pending_request}} as the current request when it contains one. Otherwise use the request already stated and ask: What can I help you with? only when no request is known. Ask at most one open follow-up question when needed. Select exactly one existing_request_route: shipment, customer_service, support, knowledge, or complete. If the caller asks about a different order, return to order identification. If the caller clearly changes to New Project or General Knowledge, capture next_responsibility and pending_request, then exit. Do not announce routing.",
        edges: [
          promptEdge("request_context_changed", "X_Capture_Existing_Request_Handoff", "The caller clearly changed to New Project or General Knowledge."),
          promptEdge("request_different_order", "X_Reset_Active_Order", "The caller wants help with a different order."),
          promptEdge("request_routed", "X_Capture_Existing_Request_Route", "The current request is understood well enough to select one internal action."),
        ],
      }),
      responsibilityHandoffCaptureNode({
        id: "X_Capture_Existing_Request_Handoff",
        choices: ["new_project", "general"],
        destination: exitGate,
        retryDestination: "S_Existing_Request",
      }),
      extractVariablesNode({
        id: "X_Capture_Existing_Request_Route",
        variables: [
          { name: "existing_request_route", type: "enum", choices: ["shipment", "customer_service", "support", "knowledge", "complete"], description: "The one internal action for the request." },
        ],
        edges: enumValueEdges(
          "existing_request_route",
          "X_Clear_Existing_Request",
          "existing_request_route",
          ["shipment", "customer_service", "support", "knowledge", "complete"],
        ),
        elseDestination: "S_Existing_Request",
      }),
      clearHandoffNode("X_Clear_Existing_Request", "L_Existing_Request"),
      branchNode({
        id: "L_Existing_Request",
        edges: [
          equationEdge("request_shipment", "F_Shipment_Lookup", "existing_request_route", "shipment"),
          equationEdge("request_customer_service", "F_Service_Hours", "existing_request_route", "customer_service"),
          equationEdge("request_support", "S_Support_Details", "existing_request_route", "support"),
          equationEdge("request_knowledge", "S_Existing_Continue", "existing_request_route", "knowledge"),
          equationEdge("request_complete", "S_Existing_Continue", "existing_request_route", "complete"),
        ],
        elseDestination: "S_Existing_Request",
      }),
      functionResultNode({
        id: "F_Shipment_Lookup",
        toolName: "lookup_shipment",
        edges: [
          toolResultEdge("shipment_found", "X_Clear_Shipment_Email", "lookup_shipment", ["found"]),
          toolResultEdge("shipment_unavailable", "C_Shipment_Unavailable", "lookup_shipment", ["shipment_unavailable"]),
        ],
        elseDestination: "F_Service_Hours",
      }),
      clearStringVariablesNode(
        "X_Clear_Shipment_Email",
        ["shipment_email"],
        "S_Shipment_Found",
      ),
      subagent({
        id: "S_Shipment_Found",
        instruction: "State {{shipment_safe_summary}} once. Offer to email the tracking details. If accepted, confirm the destination by spelling every character of the complete email, saying at and dot, and waiting for confirmation. Do not repeat the shipment summary. If the caller asks about a different order, return to order identification.",
        edges: [
          promptEdge("shipment_different_order", "X_Reset_Active_Order", "The caller asks about a different order."),
          promptEdge("shipment_email_ready", "X_Capture_Shipment_Email", "The caller accepted the email and confirmed the complete destination."),
          promptEdge("shipment_email_declined", "S_Existing_Continue", "The caller declined the shipment email."),
        ],
      }),
      extractVariablesNode({
        id: "X_Capture_Shipment_Email",
        variables: [
          { name: "shipment_email", type: "string", description: "The shipment destination email confirmed by the caller." },
        ],
        edges: [nonEmptyVariablesEdge(
          "shipment_email_captured",
          "F_Shipment_Email",
          ["shipment_email"],
        )],
        elseDestination: "S_Shipment_Found",
      }),
      functionResultNode({
        id: "F_Shipment_Email",
        toolName: "email_shipment_tracking",
        edges: [toolResultEdge("shipment_email_sent", "C_Shipment_Email_Complete", "email_shipment_tracking", ["sent"])],
        elseDestination: "C_Shipment_Email_Failed",
      }),
      staticConversationNode({ id: "C_Shipment_Email_Complete", text: "I've sent the shipment details to the confirmed email address.", destination: "S_Existing_Continue" }),
      staticConversationNode({ id: "C_Shipment_Email_Failed", text: "I'm sorry, I wasn't able to send the shipment email just now.", destination: "S_Existing_Continue" }),
      staticConversationNode({ id: "C_Shipment_Unavailable", text: "{{shipment_safe_summary}}", destination: "S_Existing_Continue" }),
      functionResultNode({
        id: "F_Service_Hours",
        toolName: "check_business_hours",
        edges: [toolResultEdge("service_open", "S_Service_Transfer", "check_business_hours", ["open"])],
        elseDestination: "S_Support_Details",
      }),
      subagent({
        id: "S_Service_Transfer",
        instruction: "Offer to connect the caller with customer service. If accepted, continue to the first transfer node. If declined, continue to internal follow-up. If the caller asks another question instead of deciding, continue to the existing-order continuation step.",
        edges: [
          promptEdge("service_transfer_agreed", "T_Service_Primary", "The caller agrees to the transfer."),
          promptEdge("service_transfer_declined", "S_Support_Details", "The caller declines the transfer."),
          promptEdge("service_transfer_new_question", "S_Existing_Continue", "The caller asks another question instead of accepting or declining the transfer."),
        ],
      }),
      transferCallNode({
        id: "T_Service_Primary",
        name: "Transfer Customer Service Primary",
        number: "+13036471024",
        message: "I’ll try to connect you with customer service now.",
        whisper: "This is a GenStone existing-order caller. Briefly share the caller name and issue.",
        failureDestination: "T_Service_Secondary",
      }),
      transferCallNode({
        id: "T_Service_Secondary",
        name: "Transfer Customer Service Secondary",
        number: "+13039047205",
        message: "That line didn’t connect. I’ll try another customer-service line.",
        whisper: "This is a GenStone existing-order caller. Briefly share the caller name and issue.",
        failureDestination: "S_Support_Details",
      }),
      subagent({
        id: "S_Support_Details",
        instruction: "Reuse the issue already supplied, caller name, and verified order when available. Ask one open follow-up question only when needed. Confirm the follow-up phone. Collect the customer's email and confirm it by spelling every character, saying at and dot, and waiting for confirmation. Never mention Zendesk, a ticket, or a reference number.",
        edges: [
          promptEdge(
            "support_ready",
            "X_Capture_Support_Contact",
            "The confirmed email and useful support facts are ready to record.",
          ),
        ],
      }),
      extractVariablesNode({
        id: "X_Capture_Support_Contact",
        variables: [
          { name: "support_phone", type: "string", description: "The support phone confirmed by the caller." },
          { name: "support_email", type: "string", description: "The support email confirmed by the caller." },
        ],
        edges: [nonEmptyVariablesEdge(
          "support_contact_ready",
          "F_Support_Contact_Phone",
          ["caller_name", "support_phone", "support_email"],
        )],
        elseDestination: "S_Support_Details",
      }),
      functionResultNode({
        id: "F_Support_Contact_Phone",
        toolName: "lookup_contact_by_phone",
        edges: [
          toolResultEdge("support_contact_phone_found", "L_Support_Order_State", "lookup_contact_by_phone", ["found"]),
          toolResultEdge("support_contact_phone_retry_email", "F_Support_Contact_Email", "lookup_contact_by_phone", ["not_found", "ambiguous"]),
        ],
        elseDestination: "F_Support_Contact_Email",
      }),
      functionResultNode({
        id: "F_Support_Contact_Email",
        toolName: "lookup_contact_by_email",
        edges: [
          toolResultEdge("support_contact_email_complete", "L_Support_Order_State", "lookup_contact_by_email", ["found", "not_found", "ambiguous"]),
        ],
        elseDestination: "L_Support_Order_State",
      }),
      branchNode({
        id: "L_Support_Order_State",
        edges: [
          equationEdge(
            "support_has_verified_order",
            "F_Support_Write",
            "order_verified",
            "true",
          ),
        ],
        elseDestination: "F_Unverified_Support_Write",
      }),
      functionResultNode({
        id: "F_Support_Write",
        toolName: "record_support_follow_up",
        edges: [
          toolResultEdge("support_recorded", "C_Support_Complete", "record_support_follow_up", ["created", "updated", "created_notice_failed"]),
        ],
        elseDestination: "C_Support_Failed",
      }),
      functionResultNode({
        id: "F_Unverified_Support_Write",
        toolName: "record_unverified_support_follow_up",
        edges: [
          toolResultEdge(
            "unverified_support_recorded",
            "C_Support_Complete",
            "record_unverified_support_follow_up",
            ["created", "updated", "created_notice_failed"],
          ),
        ],
        elseDestination: "C_Support_Failed",
      }),
      staticConversationNode({ id: "C_Support_Complete", text: "I'm letting our team know, and they'll be in touch as soon as possible.", destination: "S_Existing_Continue" }),
      staticConversationNode({ id: "C_Support_Failed", text: "I'm sorry, I wasn't able to notify the team just now.", destination: "S_Existing_Continue" }),
      subagent({
        id: "S_Existing_Continue",
        instruction: "If the current request is an unanswered factual existing-order question, answer it concisely from approved knowledge. Then ask exactly: Is there anything else I can help you with? If the caller asks about the same order, return to current-request handling. If they ask about a different order, return to identification. If they clearly switch to New Project or General Knowledge, capture next_responsibility and pending_request, then exit. If they need nothing else, exit.",
        knowledgeBase: true,
        edges: [
          promptEdge("continue_same_order", "X_Prepare_Existing_Request", "The caller supplied another request about the same verified order."),
          promptEdge("continue_different_order", "X_Reset_Active_Order", "The caller supplied a request about a different order."),
          promptEdge("continue_handoff", "X_Capture_Existing_Continue_Handoff", "The caller changed to New Project or General Knowledge."),
          promptEdge("continue_complete", exit, "The caller needs nothing else."),
        ],
      }),
      responsibilityHandoffCaptureNode({
        id: "X_Capture_Existing_Continue_Handoff",
        choices: ["new_project", "general"],
        destination: exitGate,
        retryDestination: "S_Existing_Continue",
      }),
      resetOrderNode("X_Reset_Active_Order", "S_Order_Identifier"),
      resetOrderNode(exitGate, exit),
      componentExit(exit),
    ],
  });
}

function buildKnowledgeComponent(): ConversationFlowComponentCreateParams {
  const exit = "E_Knowledge";

  return componentConfig({
    name: RETELL_COMPONENT_NAMES.knowledge,
    startNodeId: "S_Knowledge_Answer",
    nodes: [
      subagent({
        id: "S_Knowledge_Answer",
        instruction: "Answer the caller's most recent unanswered General Knowledge question concisely from approved knowledge. Use {{pending_request}} only when it represents that unanswered question. Then ask exactly: Is there anything else I can help you with?",
        knowledgeBase: true,
        edges: [
          promptEdge("knowledge_more_general", "X_Clear_Knowledge_Request", "The caller supplied another general question."),
          promptEdge("knowledge_handoff", "X_Capture_Knowledge_Handoff", "The caller changed to New Project or Existing Order."),
          promptEdge("knowledge_complete", exit, "The caller needs nothing else."),
        ],
      }),
      clearHandoffNode("X_Clear_Knowledge_Request", "S_Knowledge_Answer"),
      responsibilityHandoffCaptureNode({
        id: "X_Capture_Knowledge_Handoff",
        choices: ["new_project", "existing_order"],
        destination: exit,
        retryDestination: "S_Knowledge_Answer",
      }),
      componentExit(exit),
    ],
  });
}

function buildHumanEscalationComponent(
  tools: FlowTool[],
): ConversationFlowComponentCreateParams {
  const requestTypeVariable: FlowVariable = {
    name: "human_request_type",
    type: "enum",
    choices: ["new_project", "existing_order"],
    description: "Whether this human request concerns a new project or an existing order.",
  };
  const callbackContactVariables: FlowVariable[] = [
    {
      name: "callback_phone",
      type: "string",
      description: "The callback phone confirmed by the caller.",
    },
    {
      name: "callback_email",
      type: "string",
      description: "The callback email confirmed by the caller.",
    },
  ];
  const supportContactVariables: FlowVariable[] = [
    {
      name: "support_phone",
      type: "string",
      description: "The support follow-up phone confirmed by the caller.",
    },
    {
      name: "support_email",
      type: "string",
      description: "The support follow-up email confirmed by the caller.",
    },
  ];

  return componentConfig({
    name: RETELL_COMPONENT_NAMES.humanEscalation,
    startNodeId: "S_Human_Classify",
    tools: selectTools(tools, [
      "check_business_hours",
      "schedule_callback",
      "lookup_contact_by_phone",
      "lookup_contact_by_email",
      "record_unverified_support_follow_up",
    ]),
    nodes: [
      subagent({
        id: "S_Human_Classify",
        instruction: "Determine from the conversation whether the human request concerns a new project or an existing order. Only if that is genuinely unclear, ask exactly: Is this about a new project or an existing order? Capture human_request_type and continue.",
        edges: [
          promptEdge(
            "human_context_ready",
            "X_Capture_Human_Request_Type",
            "The caller identified the request as a new project or existing order.",
          ),
        ],
      }),
      extractVariablesNode({
        id: "X_Capture_Human_Request_Type",
        variables: [requestTypeVariable],
        edges: enumValueEdges(
          "human_request_type",
          "F_Human_Hours",
          "human_request_type",
          ["new_project", "existing_order"],
        ),
        elseDestination: "S_Human_Classify",
      }),
      functionResultNode({
        id: "F_Human_Hours",
        toolName: "check_business_hours",
        edges: [toolResultEdge("human_hours_open", "L_Human_Open_Context", "check_business_hours", ["open"])],
        elseDestination: "L_Human_Fallback_Context",
      }),
      branchNode({
        id: "L_Human_Open_Context",
        edges: [
          equationEdge("human_open_project", "T_Human_Project", "human_request_type", "new_project"),
          equationEdge("human_open_order", "T_Human_Service_Primary", "human_request_type", "existing_order"),
        ],
        elseDestination: "S_Human_Classify",
      }),
      branchNode({
        id: "L_Human_Fallback_Context",
        edges: [
          equationEdge("human_fallback_project", "S_Human_Callback", "human_request_type", "new_project"),
          equationEdge("human_fallback_order", "S_Human_Support", "human_request_type", "existing_order"),
        ],
        elseDestination: "S_Human_Classify",
      }),
      transferCallNode({
        id: "T_Human_Project",
        name: "Transfer Human Request To Project Coordinator",
        number: "+13038764333",
        message: "I’ll connect you with a project coordinator now.",
        whisper: "This is a GenStone new-project caller. Briefly share the caller name and stated project need.",
        failureDestination: "S_Human_Callback",
      }),
      transferCallNode({
        id: "T_Human_Service_Primary",
        name: "Transfer Human Request To Customer Service Primary",
        number: "+13036471024",
        message: "I’ll try to connect you with customer service now.",
        whisper: "This is a GenStone existing-order caller. Briefly share the caller name and issue.",
        failureDestination: "T_Human_Service_Secondary",
      }),
      transferCallNode({
        id: "T_Human_Service_Secondary",
        name: "Transfer Human Request To Customer Service Secondary",
        number: "+13039047205",
        message: "That line didn’t connect. I’ll try another customer-service line.",
        whisper: "This is a GenStone existing-order caller. Briefly share the caller name and issue.",
        failureDestination: "S_Human_Support",
      }),
      subagent({
        id: "S_Human_Callback",
        instruction: "Use the conversation already available. Collect only missing callback details: name, phone, email, a short subject, and a weekday date and time from 8:30 AM through 4:30 PM Mountain, no earlier than the next business day. Confirm the complete email by spelling every character, saying at and dot, and waiting for confirmation. Confirm the date and time once.",
        edges: [
          promptEdge(
            "human_callback_ready",
            "X_Capture_Human_Callback",
            "All required callback details were confirmed.",
          ),
        ],
      }),
      extractVariablesNode({
        id: "X_Capture_Human_Callback",
        variables: callbackContactVariables,
        edges: [nonEmptyVariablesEdge(
          "human_callback_contact_ready",
          "F_Human_Callback",
          ["caller_name", "callback_phone", "callback_email"],
        )],
        elseDestination: "S_Human_Callback",
      }),
      functionResultNode({
        id: "F_Human_Callback",
        toolName: "schedule_callback",
        edges: [
          toolResultEdge("human_callback_scheduled", "E_Human_Callback_Complete", "schedule_callback", ["scheduled"]),
          toolResultEdge("human_callback_invalid", "S_Human_Callback", "schedule_callback", ["invalid_day_or_time"]),
        ],
        elseDestination: "E_Human_Callback_Failed",
      }),
      speakingComponentExit(
        "E_Human_Callback_Complete",
        "Your callback has been scheduled.",
      ),
      speakingComponentExit(
        "E_Human_Callback_Failed",
        "We're experiencing some internal system issues and couldn't complete the callback request. If you don't hear from us soon, please call us again during normal business hours.",
      ),
      subagent({
        id: "S_Human_Support",
        instruction: "Use the caller's existing-order request and conversation already available. Collect only missing follow-up details. Confirm the phone and confirm the complete email by spelling every character, saying at and dot, and waiting for confirmation. Never mention Zendesk, a ticket, or a reference number.",
        edges: [
          promptEdge(
            "human_support_ready",
            "X_Capture_Human_Support",
            "The confirmed phone, email, and useful support facts are ready to record.",
          ),
        ],
      }),
      extractVariablesNode({
        id: "X_Capture_Human_Support",
        variables: supportContactVariables,
        edges: [nonEmptyVariablesEdge(
          "human_support_contact_ready",
          "F_Human_Support_Contact_Phone",
          ["caller_name", "support_phone", "support_email"],
        )],
        elseDestination: "S_Human_Support",
      }),
      functionResultNode({
        id: "F_Human_Support_Contact_Phone",
        toolName: "lookup_contact_by_phone",
        edges: [
          toolResultEdge("human_support_phone_found", "F_Human_Support", "lookup_contact_by_phone", ["found"]),
          toolResultEdge("human_support_phone_retry_email", "F_Human_Support_Contact_Email", "lookup_contact_by_phone", ["not_found", "ambiguous"]),
        ],
        elseDestination: "F_Human_Support_Contact_Email",
      }),
      functionResultNode({
        id: "F_Human_Support_Contact_Email",
        toolName: "lookup_contact_by_email",
        edges: [
          toolResultEdge("human_support_email_complete", "F_Human_Support", "lookup_contact_by_email", ["found", "not_found", "ambiguous"]),
        ],
        elseDestination: "F_Human_Support",
      }),
      functionResultNode({
        id: "F_Human_Support",
        toolName: "record_unverified_support_follow_up",
        edges: [
          toolResultEdge("human_support_recorded", "E_Human_Support_Complete", "record_unverified_support_follow_up", ["created", "updated", "created_notice_failed"]),
        ],
        elseDestination: "E_Human_Support_Failed",
      }),
      speakingComponentExit(
        "E_Human_Support_Complete",
        "I'm letting our team know, and they'll be in touch as soon as possible.",
      ),
      speakingComponentExit(
        "E_Human_Support_Failed",
        "I'm sorry, I wasn't able to notify the team just now.",
      ),
    ],
  });
}

function buildNamedEmployeeComponent(tools: FlowTool[]): ConversationFlowComponentCreateParams {
  const exit = "E_Named_Employee";

  return componentConfig({
    name: RETELL_COMPONENT_NAMES.namedEmployee,
    startNodeId: "F_Employee_Lookup",
    tools: selectTools(tools, ["lookup_active_employee"]),
    nodes: [
      functionResultNode({
        id: "F_Employee_Lookup",
        toolName: "lookup_active_employee",
        edges: [
          toolResultEdge(
            "employee_found",
            "S_Employee_Transfer",
            "lookup_active_employee",
            ["found"],
          ),
          toolResultEdge(
            "employee_ambiguous",
            "S_Employee_Clarify",
            "lookup_active_employee",
            ["ambiguous"],
          ),
          toolResultEdge(
            "employee_not_found",
            "E_Employee_Unidentified",
            "lookup_active_employee",
            ["not_found"],
          ),
        ],
        elseDestination: "E_Employee_Unavailable",
      }),
      subagent({
        id: "S_Employee_Clarify",
        instruction: "Say: I found more than one employee with that name. What is their full name? Continue after the caller supplies the fuller name.",
        edges: [
          promptEdge(
            "employee_name_clarified",
            "F_Employee_Lookup_Retry",
            "The caller supplied a fuller employee name.",
          ),
        ],
      }),
      functionResultNode({
        id: "F_Employee_Lookup_Retry",
        toolName: "lookup_active_employee",
        edges: [
          toolResultEdge(
            "employee_retry_found",
            "S_Employee_Transfer",
            "lookup_active_employee",
            ["found"],
          ),
          toolResultEdge(
            "employee_retry_unidentified",
            "E_Employee_Unidentified",
            "lookup_active_employee",
            ["ambiguous", "not_found"],
          ),
        ],
        elseDestination: "E_Employee_Unavailable",
      }),
      subagent({
        id: "S_Employee_Transfer",
        instruction: "Ask permission to connect the caller with {{employee_display_name}}. If the caller agrees, continue to the transfer node. If declined, exit to the previous responsibility.",
        edges: [
          promptEdge("employee_transfer_agreed", "T_Named_Employee", "The caller agrees to the transfer."),
          promptEdge("employee_transfer_declined", exit, "The caller declines the transfer."),
        ],
      }),
      transferCallNode({
        id: "T_Named_Employee",
        name: "Transfer Named Employee",
        number: "{{employee_transfer_target}}",
        message: "I’ll connect you now.",
        whisper: "This is a GenStone caller. Share only the caller name and broad topic.",
        failureDestination: "E_Employee_Unavailable",
      }),
      speakingComponentExit(
        "E_Employee_Unidentified",
        "I'm sorry, I couldn't identify the correct person. I can continue helping you here.",
      ),
      speakingComponentExit(
        "E_Employee_Unavailable",
        "I'm sorry, I couldn't connect you with that person. I can continue helping you here.",
      ),
      componentExit(exit),
    ],
  });
}

function buildDoNotCallComponent(tools: FlowTool[]): ConversationFlowComponentCreateParams {
  return componentConfig({
    name: RETELL_COMPONENT_NAMES.doNotCall,
    startNodeId: "S_Dnc_Confirm",
    tools: selectTools(tools, ["suppress_phone_number"]),
    nodes: [
      subagent({
        id: "S_Dnc_Confirm",
        instruction: "Confirm the complete phone number the caller wants placed on the do-not-call list. Continue only after explicit confirmation.",
        edges: [promptEdge("dnc_confirmed", "F_Dnc_Write", "The caller explicitly confirmed the complete number to suppress.")],
      }),
      functionResultNode({
        id: "F_Dnc_Write",
        toolName: "suppress_phone_number",
        edges: [
          toolResultEdge(
            "dnc_done",
            "E_Dnc_Complete",
            "suppress_phone_number",
            ["suppressed", "already_suppressed"],
          ),
        ],
        elseDestination: "E_Dnc_Failed",
      }),
      speakingComponentExit(
        "E_Dnc_Complete",
        "That phone number has been added to our do-not-call list.",
      ),
      speakingComponentExit(
        "E_Dnc_Failed",
        "I'm sorry, I wasn't able to complete that do-not-call request just now.",
      ),
    ],
  });
}

const COMPONENT_LAYOUTS: Record<
  RetellComponentName,
  Record<string, CanvasPosition>
> = {
  greeting: {
    S_Greeting: { x: 0, y: 0 },
    X_Capture_Caller_Name: { x: 420, y: 0 },
    E_Greeting: { x: 840, y: 0 },
  },
  understandRequest: {
    S_Understand_Request: { x: 0, y: 0 },
    X_Capture_Primary_Route: { x: 420, y: 0 },
    E_Understand_Request: { x: 840, y: 0 },
  },
  newProject: {
    S_Project_Request: { x: 199, y: 6 },
    X_Capture_Project_Request_Handoff: { x: 710, y: -360 },
    X_Clear_Project_Request: { x: 710, y: 6 },
    L_Project_Request: { x: 1_110, y: 477 },
    S_Project_Knowledge: { x: 1_509, y: 477 },
    X_Capture_Project_Knowledge_Handoff: { x: 1_509, y: 120 },
    F_Project_Hours: { x: 2_166, y: 558 },
    S_Project_Transfer: { x: 2_906, y: 477 },
    T_Project_Coordinator: { x: 4_254, y: 988 },
    S_Project_Callback: { x: 4_830, y: 1_309 },
    X_Capture_Project_Callback: { x: 5_300, y: 1_309 },
    F_Project_Callback: { x: 5_574, y: 1_780 },
    S_Project_Continue: { x: 6_372, y: 1_780 },
    X_Capture_Project_Continue_Handoff: { x: 6_820, y: 1_420 },
    C_Callback_Failed: { x: 6_372, y: 2_247 },
    E_New_Project: { x: 4_014, y: 318 },
  },
  existingOrder: {
    L_Order_Entry: { x: 0, y: 0 },
    S_Order_Identifier: { x: 400, y: 0 },
    X_Capture_Identifier_Handoff: { x: 400, y: -360 },
    X_Capture_Order_Identifier: { x: 800, y: 0 },
    F_Order_Lookup: { x: 1_200, y: 0 },
    S_Order_Candidate: { x: 1_600, y: 0 },
    F_Next_Candidate: { x: 2_000, y: -320 },
    S_Alternate_Identifier: { x: 1_600, y: 340 },
    X_Capture_Alternate_Identifier: { x: 2_000, y: 340 },
    F_Order_Confirm: { x: 2_000, y: 0 },
    S_Order_System_Failure: { x: 2_400, y: 340 },
    X_Prepare_Existing_Request: { x: 2_400, y: 0 },
    S_Existing_Request: { x: 2_800, y: 0 },
    X_Capture_Existing_Request_Handoff: { x: 2_800, y: -360 },
    X_Capture_Existing_Request_Route: { x: 3_200, y: 0 },
    X_Clear_Existing_Request: { x: 3_600, y: 0 },
    L_Existing_Request: { x: 4_000, y: 0 },
    F_Shipment_Lookup: { x: 3_600, y: -760 },
    X_Clear_Shipment_Email: { x: 4_000, y: -760 },
    S_Shipment_Found: { x: 4_400, y: -760 },
    X_Capture_Shipment_Email: { x: 4_800, y: -760 },
    F_Shipment_Email: { x: 5_200, y: -760 },
    C_Shipment_Email_Complete: { x: 6_000, y: -900 },
    C_Shipment_Email_Failed: { x: 6_000, y: -620 },
    C_Shipment_Unavailable: { x: 4_400, y: -420 },
    F_Service_Hours: { x: 3_600, y: 680 },
    S_Service_Transfer: { x: 4_400, y: 480 },
    T_Service_Primary: { x: 4_800, y: 340 },
    T_Service_Secondary: { x: 5_200, y: 340 },
    S_Support_Details: { x: 4_400, y: 820 },
    X_Capture_Support_Contact: { x: 4_800, y: 820 },
    F_Support_Contact_Phone: { x: 5_200, y: 740 },
    F_Support_Contact_Email: { x: 5_600, y: 860 },
    L_Support_Order_State: { x: 6_000, y: 740 },
    F_Support_Write: { x: 6_400, y: 640 },
    F_Unverified_Support_Write: { x: 6_400, y: 840 },
    C_Support_Complete: { x: 6_800, y: 600 },
    C_Support_Failed: { x: 6_800, y: 880 },
    S_Existing_Continue: { x: 7_200, y: 0 },
    X_Capture_Existing_Continue_Handoff: { x: 7_600, y: 300 },
    X_Reset_Active_Order: { x: 7_600, y: -260 },
    X_Exit_Existing_Order: { x: 8_000, y: 260 },
    E_Existing_Order: { x: 8_000, y: 0 },
  },
  knowledge: {
    S_Knowledge_Answer: { x: 0, y: 0 },
    X_Clear_Knowledge_Request: { x: 420, y: -160 },
    X_Capture_Knowledge_Handoff: { x: 420, y: 260 },
    E_Knowledge: { x: 840, y: 0 },
  },
  humanEscalation: {
    S_Human_Classify: { x: 0, y: 0 },
    X_Capture_Human_Request_Type: { x: 440, y: 0 },
    F_Human_Hours: { x: 880, y: 0 },
    L_Human_Open_Context: { x: 1_320, y: -260 },
    L_Human_Fallback_Context: { x: 1_320, y: 320 },
    T_Human_Project: { x: 1_760, y: -520 },
    T_Human_Service_Primary: { x: 1_760, y: -120 },
    T_Human_Service_Secondary: { x: 2_200, y: -120 },
    S_Human_Callback: { x: 2_200, y: 360 },
    X_Capture_Human_Callback: { x: 2_640, y: 360 },
    F_Human_Callback: { x: 3_080, y: 360 },
    E_Human_Callback_Complete: { x: 3_520, y: 220 },
    E_Human_Callback_Failed: { x: 3_520, y: 500 },
    S_Human_Support: { x: 2_640, y: 780 },
    X_Capture_Human_Support: { x: 3_080, y: 780 },
    F_Human_Support_Contact_Phone: { x: 3_520, y: 700 },
    F_Human_Support_Contact_Email: { x: 3_960, y: 820 },
    F_Human_Support: { x: 4_400, y: 780 },
    E_Human_Support_Complete: { x: 4_840, y: 640 },
    E_Human_Support_Failed: { x: 4_840, y: 920 },
  },
  namedEmployee: {
    F_Employee_Lookup: { x: 0, y: 0 },
    S_Employee_Clarify: { x: 400, y: 180 },
    F_Employee_Lookup_Retry: { x: 800, y: 180 },
    S_Employee_Transfer: { x: 800, y: -180 },
    T_Named_Employee: { x: 1_200, y: -180 },
    E_Employee_Unidentified: { x: 1_200, y: 180 },
    E_Employee_Unavailable: { x: 1_200, y: 420 },
    E_Named_Employee: { x: 1_600, y: 0 },
  },
  doNotCall: {
    S_Dnc_Confirm: { x: 0, y: 0 },
    F_Dnc_Write: { x: 400, y: 0 },
    E_Dnc_Complete: { x: 1_200, y: -140 },
    E_Dnc_Failed: { x: 1_200, y: 140 },
  },
};

const COMPONENT_BEGIN_POSITIONS: Partial<Record<RetellComponentName, CanvasPosition>> = {
  newProject: { x: 6, y: 15.273435592651367 },
};

export function buildSharedComponentConfigs(input: ComponentBuildInput): RetellComponentBuild[] {
  const tools = buildTools(input.workerApiKey);
  const configs: Record<RetellComponentName, ConversationFlowComponentCreateParams> = {
    greeting: buildGreetingComponent(),
    understandRequest: buildUnderstandRequestComponent(),
    newProject: buildNewProjectComponent(tools),
    existingOrder: buildExistingOrderComponent(tools),
    knowledge: buildKnowledgeComponent(),
    humanEscalation: buildHumanEscalationComponent(tools),
    namedEmployee: buildNamedEmployeeComponent(tools),
    doNotCall: buildDoNotCallComponent(tools),
  };

  return Object.entries(configs).map(([componentName, config]) => ({
    componentName: componentName as RetellComponentName,
    config: placeComponent(
      config,
      COMPONENT_LAYOUTS[componentName as RetellComponentName],
      COMPONENT_BEGIN_POSITIONS[componentName as RetellComponentName],
    ),
  }));
}

function buildMainNodes(componentIds: RetellComponentIds): FlowNode[] {
  return [
    prepareCallerNumberNode("C_Greeting"),
    componentNode({ id: "C_Greeting", componentId: componentIds.greeting, destination: "C_Understand_Request" }),
    componentNode({ id: "C_Understand_Request", componentId: componentIds.understandRequest, destination: "L_Request_Route" }),
    branchNode({
      id: "L_Request_Route",
      edges: [
        equationEdge("request_dnc", "C_Do_Not_Call", "primary_route", "do_not_call"),
        equationEdge("request_project", "C_New_Project", "primary_route", "new_project"),
        equationEdge("request_order", "C_Existing_Order", "primary_route", "existing_order"),
        equationEdge("request_general", "C_Knowledge", "primary_route", "general"),
      ],
      elseDestination: "C_Understand_Request",
    }),
    componentNode({ id: "C_New_Project", componentId: componentIds.newProject, destination: "L_Responsibility_Route" }),
    componentNode({ id: "C_Existing_Order", componentId: componentIds.existingOrder, destination: "L_Responsibility_Route" }),
    componentNode({ id: "C_Knowledge", componentId: componentIds.knowledge, destination: "L_Responsibility_Route" }),
    branchNode({
      id: "L_Responsibility_Route",
      edges: [
        equationEdge("responsibility_to_project", "C_New_Project", "next_responsibility", "new_project"),
        equationEdge("responsibility_to_order", "C_Existing_Order", "next_responsibility", "existing_order"),
        equationEdge("responsibility_to_general", "C_Knowledge", "next_responsibility", "general"),
      ],
      elseDestination: "E_Call_Complete",
    }),
    componentNode({
      id: "C_Do_Not_Call",
      componentId: componentIds.doNotCall,
      destination: "E_Call_Complete",
    }),
    componentNode({
      id: "G_Human_Escalation",
      componentId: componentIds.humanEscalation,
      destination: "E_Call_Complete",
      globalNodeSetting: {
        condition: "The caller clearly asks to speak with a person or human without naming a specific employee.",
        cool_down: 3,
      },
    }),
    componentNode({
      id: "G_Named_Employee",
      componentId: componentIds.namedEmployee,
      destination: "E_Call_Complete",
      globalNodeSetting: {
        condition: "The caller clearly asks for a specific employee by name.",
        cool_down: 3,
        go_back_conditions: [{ id: "named_employee_resume", transition_condition: promptCondition("Always") }],
      },
    }),
    endNode(),
  ];
}

const MAIN_FLOW_LAYOUT: Record<string, CanvasPosition> = {
  X_Prepare_Caller_Number: { x: -400, y: 0 },
  C_Greeting: { x: 0, y: 0 },
  C_Understand_Request: { x: 400, y: 0 },
  L_Request_Route: { x: 800, y: 0 },
  C_New_Project: { x: 1_200, y: -420 },
  C_Existing_Order: { x: 1_200, y: 0 },
  C_Knowledge: { x: 1_200, y: 420 },
  L_Responsibility_Route: { x: 1_700, y: 0 },
  C_Do_Not_Call: { x: 1_200, y: 820 },
  G_Human_Escalation: { x: 2_800, y: -520 },
  G_Named_Employee: { x: 2_000, y: -180 },
  E_Call_Complete: { x: 2_400, y: 300 },
};

export function buildConversationFlowConfig(input: BuildConfigInput): ConversationFlowCreateParams {
  return {
    model_choice: { type: "cascading", model: "gpt-5.5", high_priority: true },
    model_temperature: 0.2,
    start_speaker: "agent",
    start_node_id: "X_Prepare_Caller_Number",
    begin_tag_display_position: { x: -400, y: 0 },
    flex_mode: false,
    tool_call_strict_mode: true,
    global_prompt: "Be warm, concise, and natural. Never claim an action succeeded before its tool succeeds. Never expose internal systems, raw tool data, credentials, direct employee numbers, internal addresses, or raw errors. Never read a tracking number aloud.",
    default_dynamic_variables: defaultDynamicVariables,
    notes: [
      { id: FLOW_RELEASE, content: "GenStone responsibility subflows", display_position: { x: -400, y: -300 }, size: { width: 320, height: 90 } },
      { id: "note_globals", content: "Global human interruptions", display_position: { x: 2_400, y: -820 }, size: { width: 320, height: 90 } },
    ],
    nodes: placeNodes(buildMainNodes(input.componentIds), MAIN_FLOW_LAYOUT),
  };
}

export function buildAgentConfig(
  conversationFlowId: string,
  conversationFlowVersion: number,
  agentName = "GenStone Customer Agent",
): AgentCreateParams {
  return {
    agent_name: agentName,
    response_engine: {
      type: "conversation-flow",
      conversation_flow_id: conversationFlowId,
      version: conversationFlowVersion,
    },
    voice_id: "retell-Brynne",
    voice_temperature: 1,
    voice_speed: 1,
    volume: 1,
    responsiveness: 0.85,
    interruption_sensitivity: 0.85,
    end_call_after_silence_ms: 50_000,
    max_call_duration_ms: 600_000,
    ambient_sound: "call-center",
    language: "en-US",
    timezone: "America/Denver",
    data_storage_setting: "everything",
    handbook_config: {
      speech_normalization: false,
      scope_boundaries: true,
    },
    webhook_url: `${WORKER_BASE_URL}/v1/retell/webhooks`,
    webhook_events: [
      "call_started",
      "call_ended",
      "call_analyzed",
      "transfer_started",
      "transfer_bridged",
      "transfer_cancelled",
      "transfer_ended",
    ],
    post_call_analysis_model: "gpt-5.2",
    post_call_analysis_data: [
      { name: "primary_route", type: "enum", choices: ["new_project", "existing_order", "other"], description: "Primary caller route." },
      { name: "call_outcome", type: "enum", choices: ["answered", "shipment_emailed", "callback_scheduled", "support_follow_up", "transferred", "dnc", "ended", "tool_failure"], description: "Final operational outcome." },
      { name: "order_verified", type: "boolean", description: "Whether the order was verified." },
      { name: "capability_gap_summary", type: "string", description: "Unsupported request captured for quality review." },
    ],
  };
}

export const RETELL_BUILD_CONSTANTS = {
  flowRelease: FLOW_RELEASE,
  knowledgeBaseId: KNOWLEDGE_BASE_ID,
  sharedComponentRelease: COMPONENT_RELEASE,
  workerBaseUrl: WORKER_BASE_URL,
} as const;
