import type { ConversationFlowCreateParams } from "retell-sdk/resources/conversation-flow";
import type { ConversationFlowComponentCreateParams } from "retell-sdk/resources/conversation-flow-component";
import type { AgentCreateParams } from "retell-sdk/resources/agent";

type FlowNode = ConversationFlowCreateParams["nodes"][number];
type FlowExtractVariable = Extract<
  FlowNode,
  { type: "extract_dynamic_variables" }
>["variables"][number];
type Component = ConversationFlowComponentCreateParams;
type ComponentNode = Component["nodes"][number];
type ComponentTool = NonNullable<Component["tools"]>[number];

const WORKER_BASE_URL = "https://genstone-ai-customer-agent.travis-m.workers.dev";
const KNOWLEDGE_BASE_ID = "knowledge_base_032c34629284ba5d";
const SHARED_COMPONENT_RELEASE = "v49";
const FLOW_RELEASE = "genstone_customer_agent_v49";

export const RETELL_SHARED_COMPONENT_NAMES = {
  "Contact Lookup": `GenStone — Contact Lookup — ${SHARED_COMPONENT_RELEASE}`,
  "Order Verification": `GenStone — Order Verification — ${SHARED_COMPONENT_RELEASE}`,
  "Prospect Follow-Up": `GenStone — Prospect Follow-Up — ${SHARED_COMPONENT_RELEASE}`,
  Shipment: `GenStone — Shipment — ${SHARED_COMPONENT_RELEASE}`,
  "Tracked Support": `GenStone — Tracked Support — ${SHARED_COMPONENT_RELEASE}`,
  Callback: `GenStone — Callback — ${SHARED_COMPONENT_RELEASE}`,
  "Named Employee Transfer": `GenStone — Named Employee Transfer — ${SHARED_COMPONENT_RELEASE}`,
  DNC: `GenStone — DNC — ${SHARED_COMPONENT_RELEASE}`,
} as const;

export type RetellSharedComponentName = keyof typeof RETELL_SHARED_COMPONENT_NAMES;
export type RetellSharedComponentIds = Record<RetellSharedComponentName, string>;

const STATUS_VARIABLES = [
  "contact_lookup_status",
  "order_lookup_status",
  "shipment_lookup_status",
  "shipment_email_status",
  "case_write_status",
  "callback_status",
  "prospect_followup_status",
  "employee_lookup_status",
  "dnc_status",
] as const;

const defaultDynamicVariables = Object.fromEntries(
  STATUS_VARIABLES.map((name) => [name, "not_run"]),
);

type BuildConfigInput = {
  sharedComponentIds: RetellSharedComponentIds;
};

type SharedComponentBuildInput = {
  workerApiKey: string;
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

function prompt(text: string) {
  return { type: "prompt" as const, text };
}

function staticText(text: string) {
  return { type: "static_text" as const, text };
}

function promptCondition(promptText: string) {
  return { type: "prompt" as const, prompt: promptText };
}

function equationCondition(
  variable: string,
  operator: "==" | "!=" | "exists" | "not_exist",
  value?: string,
) {
  return {
    type: "equation" as const,
    operator: "&&" as const,
    equations: [
      {
        left: `{{${variable}}}`,
        operator,
        ...(value === undefined ? {} : { right: value }),
      },
    ],
  };
}

function compoundEquationCondition(
  equations: Array<{
    variable: string;
    operator: "==" | "!=" | "exists" | "not_exist";
    value?: string;
  }>,
) {
  return {
    type: "equation" as const,
    operator: "&&" as const,
    equations: equations.map((equation) => ({
      left: `{{${equation.variable}}}`,
      operator: equation.operator,
      ...(equation.value === undefined ? {} : { right: equation.value }),
    })),
  };
}

function promptEdge(id: string, destinationNodeId: string, condition: string) {
  return {
    id,
    destination_node_id: destinationNodeId,
    transition_condition: promptCondition(condition),
  };
}

function equationEdge(
  id: string,
  destinationNodeId: string,
  variable: string,
  operator: "==" | "!=" | "exists" | "not_exist",
  value?: string,
) {
  return {
    id,
    destination_node_id: destinationNodeId,
    transition_condition: equationCondition(variable, operator, value),
  };
}

function compoundEquationEdge(
  id: string,
  destinationNodeId: string,
  equations: Parameters<typeof compoundEquationCondition>[0],
) {
  return {
    id,
    destination_node_id: destinationNodeId,
    transition_condition: compoundEquationCondition(equations),
  };
}

function alwaysEdge(id: string, destinationNodeId: string) {
  return {
    id,
    destination_node_id: destinationNodeId,
    transition_condition: { type: "prompt" as const, prompt: "Always" as const },
  };
}

function elseEdge(id: string, destinationNodeId: string) {
  return {
    id,
    destination_node_id: destinationNodeId,
    transition_condition: { type: "prompt" as const, prompt: "Else" as const },
  };
}

function conversationNode(input: {
  id: string;
  instruction: string;
  alwaysDestination?: string;
  edges?: Array<ReturnType<typeof promptEdge>>;
  elseDestination?: string;
  staticInstruction?: boolean;
  knowledgeBase?: boolean;
  globalNodeSetting?: Record<string, unknown>;
}): FlowNode {
  return {
    id: input.id,
    name: input.id,
    type: "conversation",
    instruction: input.staticInstruction
      ? staticText(input.instruction)
      : prompt(input.instruction),
    ...(input.alwaysDestination
      ? { always_edge: alwaysEdge(`${input.id}_always`, input.alwaysDestination) }
      : {}),
    ...(input.edges ? { edges: input.edges } : {}),
    ...(input.elseDestination
      ? { else_edge: elseEdge(`${input.id}_else`, input.elseDestination) }
      : {}),
    ...(input.knowledgeBase
      ? {
          knowledge_base_ids: [KNOWLEDGE_BASE_ID],
          kb_config: {
            top_k: 3,
            filter_score: 0.6,
          },
        }
      : {}),
    ...(input.globalNodeSetting
      ? { global_node_setting: input.globalNodeSetting }
      : {}),
  } as FlowNode;
}

function branchNode(input: {
  id: string;
  edges: Array<
    | ReturnType<typeof promptEdge>
    | ReturnType<typeof equationEdge>
    | ReturnType<typeof compoundEquationEdge>
  >;
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

function componentNode(
  id: string,
  componentId: string,
  destinationNodeId: string,
): FlowNode {
  return {
    id,
    name: id,
    type: "component",
    component_id: componentId,
    component_type: "shared",
    else_edge: elseEdge(`${id}_exit`, destinationNodeId),
  } as FlowNode;
}

function endNode(
  id: string,
  options: {
    sayGoodbye?: boolean;
    globalNodeSetting?: Record<string, unknown>;
  } = {},
): FlowNode {
  return {
    id,
    name: id,
    type: "end",
    speak_during_execution: options.sayGoodbye ?? false,
    ...(options.sayGoodbye
      ? {
          execution_message_type: "static_text",
          execution_message_description:
            "Thank you for calling GenStone. Have a great day. Goodbye.",
        }
      : {}),
    ...(options.globalNodeSetting
      ? { global_node_setting: options.globalNodeSetting }
      : {}),
  } as FlowNode;
}

function dynamicString(variableName: string, description: string) {
  return {
    type: "string",
    description,
    const: `{{${variableName}}}`,
  };
}

function dynamicBoolean(variableName: string, description: string) {
  return {
    type: "boolean",
    description,
    const: `{{${variableName}}}`,
  };
}

function customTool(input: ToolInput): ComponentTool {
  return {
    type: "custom",
    name: input.name,
    tool_id: `tool_${input.name}`,
    description: input.description,
    url: `${WORKER_BASE_URL}${input.route}`,
    method: "POST",
    args_at_root: true,
    parameter_type: "json",
    headers: {
      Authorization: `Bearer ${input.workerApiKey}`,
    },
    parameters: {
      type: "object",
      properties: input.properties,
      required: input.required,
    },
    response_variables: input.responseVariables,
    speak_during_execution: input.speakDuringExecution ?? true,
    speak_after_execution: false,
    execution_message_type: "static_text",
    execution_message_description:
      input.executionMessage ?? "One moment while I check that.",
    timeout_ms: 30_000,
  } as ComponentTool;
}

function componentSubagent(input: {
  id: string;
  instruction: string;
  toolNames: string[];
  captureVariables?: FlowExtractVariable[];
  ownedTools?: unknown[];
  finetuneConversationExamples?: unknown[];
  finetuneTransitionExamples?: unknown[];
  edges: Array<
    | ReturnType<typeof promptEdge>
    | ReturnType<typeof equationEdge>
    | ReturnType<typeof compoundEquationEdge>
  >;
}): ComponentNode {
  const captureTool = input.captureVariables?.length
    ? [{
        type: "extract_dynamic_variable" as const,
        name: `capture_${input.id.toLowerCase()}`,
        description:
          "Capture caller-provided facts only when the subagent instruction requires them. Update facts when the caller corrects them.",
        variables: input.captureVariables,
      }]
    : [];

  return {
    id: input.id,
    name: input.id,
    type: "subagent",
    instruction: prompt(input.instruction),
    tool_ids: input.toolNames.map((name) => `tool_${name}`),
    tools: [...captureTool, ...(input.ownedTools ?? [])],
    edges: input.edges,
    ...(input.finetuneConversationExamples
      ? { finetune_conversation_examples: input.finetuneConversationExamples }
      : {}),
    ...(input.finetuneTransitionExamples
      ? { finetune_transition_examples: input.finetuneTransitionExamples }
      : {}),
  } as ComponentNode;
}

function componentExit(id: string): ComponentNode {
  return endNode(id) as ComponentNode;
}

function createContactLookupComponent(workerApiKey: string): Component {
  const phoneTool = customTool({
    name: "lookup_contact",
    route: "/v1/retell/tools/contacts/lookup",
    description: "Look up a caller-confirmed phone in Salesforce.",
    workerApiKey,
    speakDuringExecution: false,
    properties: {
      call_id: dynamicString("call_id", "Retell call reference."),
      phone: dynamicString("confirmed_phone", "Caller-confirmed phone number."),
    },
    required: ["call_id", "phone"],
    responseVariables: {
      contact_lookup_status: "result_code",
      contact_token: "data.contact_token",
    },
  });
  const emailTool = customTool({
    name: "lookup_contact_by_email",
    route: "/v1/retell/tools/contacts/lookup",
    description: "Look up a caller-confirmed email in Salesforce after phone lookup does not find a unique contact.",
    workerApiKey,
    speakDuringExecution: false,
    properties: {
      call_id: dynamicString("call_id", "Retell call reference."),
      email: dynamicString("caller_email", "Caller-confirmed email address."),
    },
    required: ["call_id", "email"],
    responseVariables: {
      contact_lookup_status: "result_code",
      contact_token: "data.contact_token",
    },
  });

  return {
    name: "Contact Lookup",
    flex_mode: false,
    start_node_id: "S_Confirm_Contact",
    tools: [phoneTool, emailTool],
    nodes: [
      componentSubagent({
        id: "S_Confirm_Contact",
        instruction:
          "Reuse confirmed_phone when it is already known. Otherwise, ask whether the phone ending in the last four digits of {{user_number}} is the best callback number, saying only those four digits. If it is wrong, collect one replacement without reading it back. Call lookup_contact once. Never announce the contact-lookup result. If it finds a unique contact and caller_email is not confirmed, ask which email the team should use for follow-up and confirm the complete address once. If the phone lookup returns not_found or ambiguous, ask for the email used with GenStone, confirm the complete address once, and call lookup_contact_by_email once. After the required email is confirmed, finish without describing the internal lookup. Do not request another identifier after a technical error.",
        toolNames: ["lookup_contact", "lookup_contact_by_email"],
        captureVariables: [
          {
            name: "confirmed_phone",
            type: "string",
            description: "The phone explicitly confirmed or supplied by the caller.",
            required: true,
          },
          {
            name: "caller_name",
            type: "string",
            description: "The caller's supplied name.",
            required: true,
          },
          {
            name: "caller_email",
            type: "string",
            description: "The complete email explicitly confirmed by the caller.",
          },
        ],
        edges: [
          equationEdge("contact_found", "E_Contact_Lookup", "contact_lookup_status", "==", "found"),
          equationEdge("contact_error", "E_Contact_Lookup", "contact_lookup_status", "==", "error"),
          equationEdge("contact_invalid", "E_Contact_Lookup", "contact_lookup_status", "==", "validation_failed"),
          promptEdge("contact_lookup_complete", "E_Contact_Lookup", "The permitted email lookup finished without a unique contact, or the caller declined to provide an email after the phone lookup did not find a unique contact."),
        ],
      }),
      componentExit("E_Contact_Lookup"),
    ],
  };
}

function createOrderVerificationComponent(workerApiKey: string): Component {
  const primaryTool = customTool({
    name: "lookup_order",
    route: "/v1/retell/tools/orders/lookup",
    description: "Find one order candidate using the confirmed order phone.",
    workerApiKey,
    speakDuringExecution: false,
    properties: {
      call_id: dynamicString("call_id", "Retell call reference."),
      identifier_type: {
        type: "string",
        description: "Primary lookup uses the confirmed order phone.",
        const: "caller_phone",
      },
      identifier: {
        type: "string",
        description: "The order phone explicitly confirmed or supplied by the caller.",
      },
    },
    required: ["call_id", "identifier_type", "identifier"],
    responseVariables: {
      order_lookup_status: "result_code",
      order_candidate_token: "data.order_candidate_token",
      order_type_summary: "data.order_type_summary",
      order_item_summary: "data.order_item_summary",
      order_status_summary: "data.order_status_summary",
    },
  });

  const alternateTool = customTool({
    name: "lookup_order_alternate",
    route: "/v1/retell/tools/orders/lookup",
    description: "Make the one permitted alternate order lookup.",
    workerApiKey,
    speakDuringExecution: false,
    properties: {
      call_id: dynamicString("call_id", "Retell call reference."),
      identifier_type: {
        type: "string",
        enum: ["alternate_phone", "order_number"],
        description: "Whether the caller supplied another order phone or the GenStone order number.",
      },
      identifier: {
        type: "string",
        description: "The alternate phone or GenStone order number supplied by the caller.",
      },
    },
    required: ["call_id", "identifier_type", "identifier"],
    responseVariables: {
      order_lookup_status: "result_code",
      order_candidate_token: "data.order_candidate_token",
      order_type_summary: "data.order_type_summary",
      order_item_summary: "data.order_item_summary",
      order_status_summary: "data.order_status_summary",
    },
  });

  const nextOrderTool = customTool({
    name: "lookup_next_order",
    route: "/v1/retell/tools/orders/lookup",
    description: "Find the next recent non-quote order for the confirmed phone after the caller rejects a candidate.",
    workerApiKey,
    speakDuringExecution: false,
    properties: {
      call_id: dynamicString("call_id", "Retell call reference."),
      identifier_type: {
        type: "string",
        description: "Next-order lookup uses the confirmed order phone.",
        const: "caller_phone",
      },
      identifier: {
        type: "string",
        description: "The order phone explicitly confirmed or supplied by the caller.",
      },
      previous_order_candidate_token: dynamicString(
        "order_candidate_token",
        "The candidate the caller rejected.",
      ),
    },
    required: [
      "call_id",
      "identifier_type",
      "identifier",
      "previous_order_candidate_token",
    ],
    responseVariables: {
      order_lookup_status: "result_code",
      order_candidate_token: "data.order_candidate_token",
      order_type_summary: "data.order_type_summary",
      order_item_summary: "data.order_item_summary",
      order_status_summary: "data.order_status_summary",
    },
  });

  return {
    name: "Order Verification",
    flex_mode: false,
    start_node_id: "S_Order_Verification",
    tools: [primaryTool, alternateTool, nextOrderTool],
    nodes: [
      componentSubagent({
        id: "S_Order_Verification",
        instruction:
          "If confirmed_phone is not known, ask whether the phone ending in the last four digits of {{user_number}} is correct for the order. Say only the last four digits. If it is wrong, collect one replacement without reading it back. Then say: Thank you. Just give me a moment to look up your order. Call lookup_order. Present the returned order type and items once and ask whether they match. If they do, capture order_items_confirmed=true and order_verified=true, then say only: Great. What can I help you with? Wait for the caller's answer. Do not announce or repeat that the order was verified. If the first candidate is rejected, ask once for the GenStone order number. Use lookup_order_alternate when the caller supplies an order number or different order phone. If they do not have the order number, capture order_number_unavailable=true and use lookup_next_order. Continue with lookup_next_order for later rejected candidates without asking for the order number again. Finish unresolved when no candidate is confirmed. Do not reveal order details beyond the candidate type and items before confirmation.",
        toolNames: ["lookup_order", "lookup_order_alternate", "lookup_next_order"],
        captureVariables: [
          {
            name: "confirmed_phone",
            type: "string",
            description: "The phone explicitly confirmed or supplied for the order.",
            required: true,
          },
          {
            name: "order_identifier_type",
            type: "enum",
            choices: ["alternate_phone", "order_number"],
            description: "The alternate identifier type supplied by the caller.",
          },
          {
            name: "order_identifier",
            type: "string",
            description: "The alternate phone or order number supplied by the caller.",
          },
          {
            name: "order_number_unavailable",
            type: "boolean",
            description: "True only after the caller explicitly says they do not have the order number.",
          },
          {
            name: "order_items_confirmed",
            type: "boolean",
            description: "True only when the caller confirms the current candidate items.",
          },
          {
            name: "order_verified",
            type: "boolean",
            description: "True only when the caller confirms the current candidate items.",
          },
        ],
        edges: [
          equationEdge("order_verified", "E_Order_Verification", "order_verified", "==", "true"),
          equationEdge("order_lookup_error", "E_Order_Verification", "order_lookup_status", "==", "error"),
          promptEdge("order_verification_unresolved", "E_Order_Verification", "The permitted order search is exhausted: the alternate lookup did not produce a confirmed candidate, or lookup_next_order reported no more candidates."),
        ],
      }),
      componentExit("E_Order_Verification"),
    ],
  };
}

function createProspectFollowupComponent(workerApiKey: string): Component {
  const tool = customTool({
    name: "send_prospect_follow_up",
    route: "/v1/retell/tools/prospects/follow-up",
    description: "Send a confirmed unmatched prospect request to the GenStone team.",
    workerApiKey,
    speakDuringExecution: false,
    properties: {
      call_id: dynamicString("call_id", "Retell call reference."),
      idempotency_key: {
        type: "string",
        description: "Stable idempotency key for this call action.",
        const: "{{call_id}}:send_prospect_follow_up",
      },
      primary_route: {
        type: "string",
        description: "New-project route guard.",
        const: "new_project",
      },
      customer_name: dynamicString("caller_name", "Caller-confirmed name."),
      confirmed_phone: dynamicString("confirmed_phone", "Caller-confirmed phone."),
      customer_email: dynamicString("caller_email", "Caller-confirmed email."),
      project_summary: dynamicString("project_summary", "Caller-confirmed project summary."),
      postal_code: dynamicString("postal_code", "Optional project ZIP code."),
    },
    required: [
      "call_id",
      "idempotency_key",
      "primary_route",
      "customer_name",
      "confirmed_phone",
      "customer_email",
      "project_summary",
    ],
    responseVariables: {
      prospect_followup_status: "result_code",
    },
  });

  return {
    name: "Prospect Follow-Up",
    flex_mode: false,
    start_node_id: "S_Prospect_Followup",
    tools: [tool],
    nodes: [
      componentSubagent({
        id: "S_Prospect_Followup",
        instruction:
          "Use the caller's existing name, confirmed phone, and project context. If the follow-up reason is unclear, ask one concise question. If caller_email is not confirmed, ask for it and confirm the complete address once. Do not repeat the other contact details. Capture the minimum useful project summary and email, then call send_prospect_follow_up once. If it succeeds, say the information was sent to the team and state only the agreed next step. If it fails, apologize briefly without claiming success.",
        toolNames: ["send_prospect_follow_up"],
        captureVariables: [
          {
            name: "project_summary",
            type: "string",
            description: "Minimum useful caller-supplied new-project context.",
            required: true,
          },
          {
            name: "caller_email",
            type: "string",
            description: "Complete email explicitly confirmed by the caller.",
            required: true,
          },
          {
            name: "postal_code",
            type: "string",
            description: "Optional caller-supplied ZIP code.",
          },
        ],
        edges: [
          equationEdge("prospect_sent", "E_Prospect_Followup", "prospect_followup_status", "==", "sent"),
          equationEdge("prospect_delivery_failed", "E_Prospect_Followup", "prospect_followup_status", "==", "delivery_failed"),
          equationEdge("prospect_error", "E_Prospect_Followup", "prospect_followup_status", "==", "error"),
          equationEdge("prospect_invalid", "E_Prospect_Followup", "prospect_followup_status", "==", "validation_failed"),
          promptEdge("prospect_declined", "E_Prospect_Followup", "The caller declined or cancelled the follow-up before it was sent."),
        ],
      }),
      componentExit("E_Prospect_Followup"),
    ],
  };
}

function createShipmentComponent(workerApiKey: string): Component {
  const lookupTool = customTool({
    name: "lookup_shipment",
    route: "/v1/retell/tools/shipments/lookup",
    description: "Read stored shipment details for a fully verified order.",
    workerApiKey,
    speakDuringExecution: false,
    properties: {
      call_id: dynamicString("call_id", "Retell call reference."),
      order_candidate_token: dynamicString("order_candidate_token", "Opaque verified order candidate."),
      order_items_confirmed: dynamicBoolean("order_items_confirmed", "Caller confirmed order items."),
      order_verified: dynamicBoolean("order_verified", "The caller confirmed the candidate order items."),
    },
    required: [
      "call_id",
      "order_candidate_token",
      "order_items_confirmed",
      "order_verified",
    ],
    responseVariables: {
      shipment_lookup_status: "result_code",
      shipment_safe_summary: "safe_summary",
    },
  });

  const emailTool = customTool({
    name: "email_shipment_tracking",
    route: "/v1/retell/tools/shipments/email",
    description: "Email stored shipment details to the caller-confirmed email.",
    workerApiKey,
    speakDuringExecution: false,
    properties: {
      call_id: dynamicString("call_id", "Retell call reference."),
      idempotency_key: {
        type: "string",
        description: "Stable idempotency key for this call action.",
        const: "{{call_id}}:email_shipment_tracking",
      },
      order_candidate_token: dynamicString("order_candidate_token", "Opaque verified order candidate."),
      order_items_confirmed: dynamicBoolean("order_items_confirmed", "Caller confirmed order items."),
      order_verified: dynamicBoolean("order_verified", "The caller confirmed the candidate order items."),
      shipment_email_requested: dynamicBoolean("shipment_email_requested", "Caller requested or accepted shipment email."),
      shipment_email: dynamicString("shipment_email", "Complete email address confirmed by the caller for this shipment message."),
    },
    required: [
      "call_id",
      "idempotency_key",
      "order_candidate_token",
      "order_items_confirmed",
      "order_verified",
      "shipment_email_requested",
      "shipment_email",
    ],
    responseVariables: {
      shipment_email_status: "result_code",
    },
  });

  return {
    name: "Shipment",
    flex_mode: false,
    start_node_id: "S_Shipment",
    tools: [lookupTool, emailTool],
    nodes: [
      componentSubagent({
        id: "S_Shipment",
        instruction:
          "Call lookup_shipment once. If details are found, speak {{shipment_safe_summary}} without reading a tracking number aloud, then offer to email the complete tracking details. If the caller accepts, ask which email address to use and confirm that destination once. Set shipment_email_requested to the caller's choice and call email_shipment_tracking once after the destination is confirmed. If shipment_lookup_status is shipment_unavailable, speak {{shipment_safe_summary}} and do not ask what happened, create support follow-up, or offer an email.",
        toolNames: ["lookup_shipment", "email_shipment_tracking"],
        captureVariables: [
          {
            name: "shipment_email_requested",
            type: "boolean",
            description:
              "True only when the caller accepts shipment email and confirms its destination.",
          },
          {
            name: "shipment_email",
            type: "string",
            description: "Complete shipment-email destination confirmed by the caller.",
          },
        ],
        edges: [
          compoundEquationEdge("shipment_answered_without_email", "E_Shipment", [
            { variable: "shipment_lookup_status", operator: "==", value: "found" },
            { variable: "shipment_email_requested", operator: "==", value: "false" },
          ]),
          equationEdge("shipment_email_sent", "E_Shipment", "shipment_email_status", "==", "sent"),
          equationEdge("shipment_email_failed", "E_Shipment", "shipment_email_status", "==", "delivery_failed"),
          equationEdge("shipment_email_error", "E_Shipment", "shipment_email_status", "==", "error"),
          equationEdge("shipment_unavailable", "E_Shipment", "shipment_lookup_status", "==", "shipment_unavailable"),
          equationEdge("shipment_lookup_error", "E_Shipment", "shipment_lookup_status", "==", "error"),
          promptEdge(
            "shipment_email_declined",
            "E_Shipment",
            "Shipment details were spoken and the caller declined the email offer after shipment_email_requested was captured as false.",
          ),
        ],
      }),
      componentExit("E_Shipment"),
    ],
  };
}

function createTrackedSupportComponent(workerApiKey: string): Component {
  const writeTool = customTool({
    name: "create_support_case",
    route: "/v1/retell/tools/support/cases",
    description: "Create one private GenStone support ticket in Zendesk.",
    workerApiKey,
    speakDuringExecution: false,
    properties: {
      call_id: dynamicString("call_id", "Retell call reference."),
      idempotency_key: {
        type: "string",
        description: "Stable idempotency key for this call action.",
        const: "{{call_id}}:create_support_case",
      },
      primary_route: {
        type: "string",
        description: "Existing-order route guard.",
        const: "existing_order",
      },
      order_candidate_token: dynamicString("order_candidate_token", "Optional opaque verified order reference."),
      order_items_confirmed: dynamicBoolean("order_items_confirmed", "Required when order context is supplied."),
      order_verified: dynamicBoolean("order_verified", "Required when order context is supplied."),
      customer_name: dynamicString("caller_name", "Caller-confirmed name when known."),
      confirmed_phone: dynamicString("confirmed_phone", "Caller-confirmed phone when known."),
      customer_email: dynamicString("caller_email", "Required caller-confirmed email for the Zendesk requester."),
      caller_type: dynamicString("caller_type", "Confirmed customer, contractor, distributor, retail partner, or other classification."),
      caller_country: dynamicString("caller_country", "Confirmed country when known."),
      support_summary: dynamicString("support_summary", "Caller-confirmed factual issue summary."),
      communication_preference: dynamicString("communication_preference", "Optional ordinary follow-up preference."),
      urgency_context: dynamicString("urgency_context", "Optional factual priority context without a promise."),
    },
    required: [
      "call_id",
      "idempotency_key",
      "primary_route",
      "customer_name",
      "confirmed_phone",
      "customer_email",
      "caller_type",
      "support_summary",
    ],
    responseVariables: {
      case_write_status: "result_code",
    },
  });

  return {
    name: "Tracked Support",
    flex_mode: false,
    start_node_id: "S_Tracked_Support",
    tools: [writeTool],
    nodes: [
      componentSubagent({
        id: "S_Tracked_Support",
        instruction:
          "Use the issue the caller already described. If it is clear, acknowledge it briefly and do not ask for more details. Ask one open question only when the issue is unclear. For an unexplained damage report, say: I'm sorry to hear that. What was broken? When order_verified is not true, explain once that the correct order could not be confirmed and do not claim a shipping status or arrival date. Reuse the name, phone, and verified order information already provided; never repeat the order items. Use customer as caller_type unless the caller already identified another role. If caller_email is not confirmed, ask for the email and confirm the complete address once. Capture the factual issue summary and call create_support_case once. If it succeeds or only the internal notice fails, say: I'm letting our team know, and they'll be in touch as soon as possible. If the ticket write fails, apologize and do not claim follow-up was created.",
        toolNames: ["create_support_case"],
        captureVariables: [
          {
            name: "support_summary",
            type: "string",
            description: "Short factual summary of the existing-order issue already described.",
            required: true,
          },
          {
            name: "caller_type",
            type: "enum",
            choices: ["customer", "contractor", "distributor", "retail_partner", "other"],
            description: "Use customer unless the caller already identified another role.",
            required: true,
          },
          {
            name: "caller_email",
            type: "string",
            description: "Complete email explicitly confirmed by the caller.",
            required: true,
          },
          { name: "caller_country", type: "string", description: "Optional country already supplied by the caller." },
          { name: "communication_preference", type: "string", description: "Optional follow-up preference volunteered by the caller." },
          { name: "urgency_context", type: "string", description: "Optional factual urgency context volunteered by the caller." },
        ],
        edges: [
          equationEdge("support_created", "E_Tracked_Support", "case_write_status", "==", "created"),
          equationEdge("support_notice_failed", "E_Tracked_Support", "case_write_status", "==", "created_notice_failed"),
          equationEdge("support_error", "E_Tracked_Support", "case_write_status", "==", "error"),
          equationEdge("support_invalid", "E_Tracked_Support", "case_write_status", "==", "validation_failed"),
          promptEdge("support_declined", "E_Tracked_Support", "The caller declined or cancelled customer-service follow-up before the ticket was created."),
        ],
      }),
      componentExit("E_Tracked_Support"),
    ],
  };
}

function createCallbackComponent(workerApiKey: string): Component {
  const tool = customTool({
    name: "schedule_callback",
    route: "/v1/retell/tools/callbacks/schedule",
    description: "Send a confirmed next-business-day-or-later callback request internally.",
    workerApiKey,
    speakDuringExecution: false,
    properties: {
      call_id: dynamicString("call_id", "Retell call reference."),
      idempotency_key: {
        type: "string",
        description: "Stable idempotency key for this call action.",
        const: "{{call_id}}:schedule_callback",
      },
      primary_route: {
        type: "string",
        description: "New-project route guard.",
        const: "new_project",
      },
      customer_name: dynamicString("caller_name", "Caller-confirmed name."),
      callback_subject: dynamicString("callback_subject", "Broad caller-confirmed callback topic."),
      callback_summary: dynamicString("callback_summary", "Short factual callback summary."),
      callback_date: dynamicString("callback_date", "Caller-requested date in YYYY-MM-DD format."),
      callback_time: dynamicString("callback_time", "Mountain time in 24-hour HH:MM format."),
      callback_phone: dynamicString("confirmed_phone", "The phone already confirmed for the callback."),
      customer_email: dynamicString("caller_email", "Caller-confirmed email for the callback request."),
      callback_confirmed: dynamicBoolean("callback_confirmed", "Explicit read-back confirmation."),
      communication_preference: dynamicString("communication_preference", "Optional follow-up preference."),
      urgency_context: dynamicString("urgency_context", "Optional factual urgency context without a promise."),
    },
    required: [
      "call_id",
      "idempotency_key",
      "primary_route",
      "customer_name",
      "callback_subject",
      "callback_summary",
      "callback_date",
      "callback_time",
      "callback_phone",
      "customer_email",
      "callback_confirmed",
    ],
    responseVariables: {
      callback_status: "result_code",
    },
  });

  return {
    name: "Callback",
    flex_mode: false,
    start_node_id: "S_Callback",
    tools: [tool],
    nodes: [
      componentSubagent({
        id: "S_Callback",
        instruction:
          "Use the caller's existing name and confirmed phone. Collect only the missing callback subject, date, Mountain time, and email, one question at a time. Callbacks are Monday through Friday from 8:30 AM through 4:30 PM Mountain, beginning the next business day and excluding U.S. federal holidays. Confirm the subject, date, Mountain time, confirmed number, and email once. After approval, capture callback_confirmed=true and call schedule_callback once. If it succeeds, say the callback request was scheduled and close without repeating the details. If it fails, apologize without claiming it was scheduled.",
        toolNames: ["schedule_callback"],
        captureVariables: [
          { name: "caller_name", type: "string", description: "Caller-confirmed name.", required: true },
          { name: "callback_subject", type: "string", description: "Broad caller-approved callback topic.", required: true },
          { name: "callback_summary", type: "string", description: "Short factual callback summary.", required: true },
          { name: "callback_date", type: "string", description: "Requested date normalized to YYYY-MM-DD.", required: true },
          { name: "callback_time", type: "string", description: "Requested Mountain time normalized to 24-hour HH:MM.", required: true },
          { name: "confirmed_phone", type: "string", description: "Previously confirmed callback phone.", required: true },
          { name: "caller_email", type: "string", description: "Complete callback email explicitly confirmed by the caller.", required: true },
          { name: "callback_confirmed", type: "boolean", description: "True only after the caller approves the complete callback details.", required: true },
          { name: "communication_preference", type: "string", description: "Optional ordinary follow-up preference." },
          { name: "urgency_context", type: "string", description: "Optional factual urgency context without a service promise." },
        ],
        edges: [
          equationEdge("callback_scheduled", "E_Callback", "callback_status", "==", "scheduled"),
          equationEdge("callback_delivery_failed", "E_Callback", "callback_status", "==", "delivery_failed"),
          equationEdge("callback_error", "E_Callback", "callback_status", "==", "error"),
          equationEdge("callback_invalid", "E_Callback", "callback_status", "==", "validation_failed"),
          promptEdge(
            "callback_declined",
            "E_Callback",
            "The caller declined the proposed callback details.",
          ),
        ],
      }),
      componentExit("E_Callback"),
    ],
  };
}

function createNamedEmployeeTransferComponent(workerApiKey: string): Component {
  const tool = customTool({
    name: "lookup_active_employee",
    route: "/v1/retell/tools/employees/lookup",
    description: "Resolve a caller-supplied employee name to one active Salesforce employee.",
    workerApiKey,
    speakDuringExecution: false,
    properties: {
      call_id: dynamicString("call_id", "Retell call reference."),
      employee_name: dynamicString("requested_employee_name", "Employee name independently supplied by the caller."),
    },
    required: ["call_id", "employee_name"],
    responseVariables: {
      employee_lookup_status: "result_code",
      employee_display_name: "data.employee_name",
      employee_transfer_target: "data.transfer_destination",
    },
  });

  return {
    name: "Named Employee Transfer",
    flex_mode: false,
    start_node_id: "S_Named_Employee_Transfer",
    tools: [tool],
    nodes: [
      componentSubagent({
        id: "S_Named_Employee_Transfer",
        instruction:
          "Capture the employee name the caller independently supplied and call lookup_active_employee once. If no unique active employee with a number is found, say the connection could not be completed and offer to continue helping. Never imply the employee declined. If the employee is found during a phone call, confirm {{employee_display_name}}, ask permission to connect, capture transfer_confirmed=true only after approval, and call transfer_named_employee. If this is not a phone call, explain that this channel cannot make a live connection and offer to continue helping. If transfer fails, say the connection could not be completed. Never speak the transfer destination.",
        toolNames: ["lookup_active_employee"],
        captureVariables: [
          {
            name: "requested_employee_name",
            type: "string",
            description: "The employee name independently supplied by the caller.",
            required: true,
          },
          {
            name: "transfer_confirmed",
            type: "boolean",
            description: "True only when the caller confirms the matched named transfer.",
          },
        ],
        ownedTools: [
          {
            type: "transfer_call",
            name: "transfer_named_employee",
            description:
              "Warm-transfer only after this phone caller confirms the uniquely matched employee.",
            transfer_destination: {
              type: "predefined",
              number: "{{employee_transfer_target}}",
            },
            transfer_option: {
              type: "warm_transfer",
              opt_out_human_detection: false,
              agent_detection_timeout_ms: 30_000,
              private_handoff_option: {
                type: "prompt",
                prompt:
                  "Privately tell {{employee_display_name}} this is a GenStone caller. Include only the caller name and broad topic when known. Do not include order details, email, payment, or unnecessary sensitive information.",
              },
              show_transferee_as_caller: true,
            },
            speak_during_execution: true,
            speak_after_execution: false,
            execution_message_type: "static_text",
            execution_message_description: "I’ll connect you now.",
          },
        ],
        edges: [
          equationEdge("employee_not_found", "E_Named_Employee_Transfer", "employee_lookup_status", "==", "not_found"),
          equationEdge("employee_ambiguous", "E_Named_Employee_Transfer", "employee_lookup_status", "==", "ambiguous"),
          equationEdge("employee_missing_number", "E_Named_Employee_Transfer", "employee_lookup_status", "==", "missing_number"),
          equationEdge("employee_error", "E_Named_Employee_Transfer", "employee_lookup_status", "==", "error"),
          equationEdge("employee_invalid", "E_Named_Employee_Transfer", "employee_lookup_status", "==", "validation_failed"),
          promptEdge(
            "transfer_incomplete",
            "E_Named_Employee_Transfer",
            "The caller declined, the channel cannot transfer, or the transfer failed and the caller was informed.",
          ),
        ],
      }),
      componentExit("E_Named_Employee_Transfer"),
    ],
  };
}

function createDncComponent(workerApiKey: string): Component {
  const tool = customTool({
    name: "suppress_phone_number",
    route: "/v1/retell/tools/dnc/suppress",
    description: "Add one explicitly confirmed phone number to Five9 do-not-call.",
    workerApiKey,
    properties: {
      call_id: dynamicString("call_id", "Retell call reference."),
      idempotency_key: {
        type: "string",
        description: "Stable idempotency key for this call action.",
        const: "{{call_id}}:suppress_phone_number",
      },
      dnc_phone: dynamicString("dnc_phone", "The exact phone the caller confirmed for suppression."),
      dnc_confirmed: dynamicBoolean("dnc_confirmed", "Explicit do-not-call confirmation."),
    },
    required: ["call_id", "idempotency_key", "dnc_phone", "dnc_confirmed"],
    responseVariables: {
      dnc_status: "result_code",
    },
  });

  return {
    name: "DNC",
    flex_mode: false,
    start_node_id: "S_DNC",
    tools: [tool],
    nodes: [
      componentSubagent({
        id: "S_DNC",
        instruction:
          "Ask whether {{user_number}} is the number the caller wants suppressed, or collect one replacement. Confirm the do-not-call request once. After confirmation, set dnc_confirmed=true and call suppress_phone_number once. If it succeeds or was already suppressed, confirm that the do-not-call request was handled. If it fails, apologize without claiming success.",
        toolNames: ["suppress_phone_number"],
        captureVariables: [
          { name: "dnc_phone", type: "string", description: "The phone confirmed for suppression.", required: true },
          { name: "dnc_confirmed", type: "boolean", description: "True only for an explicit confirmed do-not-call request." },
        ],
        edges: [
          equationEdge("dnc_suppressed", "E_DNC", "dnc_status", "==", "suppressed"),
          equationEdge("dnc_duplicate", "E_DNC", "dnc_status", "==", "already_suppressed"),
          equationEdge("dnc_invalid", "E_DNC", "dnc_status", "==", "validation_failed"),
          equationEdge("dnc_error", "E_DNC", "dnc_status", "==", "error"),
          promptEdge(
            "dnc_declined",
            "E_DNC",
            "The caller declined the confirmed request before suppression.",
          ),
        ],
      }),
      componentExit("E_DNC"),
    ],
  };
}

function buildMainNodes(
  sharedComponentIds: RetellSharedComponentIds,
): FlowNode[] {
  const sharedComponentNode = (
    id: string,
    componentName: RetellSharedComponentName,
    destinationNodeId: string,
  ) => componentNode(id, sharedComponentIds[componentName], destinationNodeId);

  return [
    conversationNode({
      id: "C_Greet_Name",
      instruction:
        "Say: Thank you for calling GenStone. Who do I have the pleasure of speaking with?",
      edges: [
        promptEdge(
          "caller_name_supplied",
          "X_Caller_Name",
          "The caller supplied their name.",
        ),
      ],
    }),
    {
      id: "X_Caller_Name",
      name: "X_Caller_Name",
      type: "extract_dynamic_variables",
      variables: [
        {
          name: "caller_name",
          type: "string",
          description: "The name supplied by the caller.",
          required: true,
        },
      ],
      edges: [alwaysEdge("caller_name_captured", "C_Greet_And_Route")],
    } as FlowNode,
    conversationNode({
      id: "C_Greet_And_Route",
      instruction:
        "Ask: Are you calling about a new project or an existing order? Clarify only if the answer is unclear.",
      edges: [
        promptEdge("greet_new_project", "C_New_Project_Help", "The caller is asking about a new project."),
        promptEdge("greet_existing_order", "ORDER_Verification", "The caller is asking about an existing order."),
      ],
    }),
    conversationNode({
      id: "C_New_Project_Help",
      instruction:
        "Answer the caller's new-project question from approved GenStone knowledge. If the answer is unavailable, offer team follow-up.",
      knowledgeBase: true,
      edges: [
        promptEdge("new_project_followup", "SF_Contact_New_Project", "The caller requested a specific quote, price, turnaround estimate, callback, or other information that must be answered later, or accepted the agent's follow-up offer."),
        promptEdge("new_project_answered", "E_Call_Complete", "The approved knowledge fully answers the caller's question and no follow-up was requested, offered, promised, or remains pending."),
      ],
    }),
    sharedComponentNode("SF_Contact_New_Project", "Contact Lookup", "L_New_Project_Contact"),
    branchNode({
      id: "L_New_Project_Contact",
      edges: [
        equationEdge("new_contact_not_found", "PROSPECT_New_Project", "contact_lookup_status", "==", "not_found"),
        equationEdge("new_contact_found", "CB_New_Project", "contact_lookup_status", "==", "found"),
        equationEdge("new_contact_ambiguous", "CB_New_Project", "contact_lookup_status", "==", "ambiguous"),
      ],
      elseDestination: "PROSPECT_New_Project",
    }),
    sharedComponentNode("PROSPECT_New_Project", "Prospect Follow-Up", "E_Call_Complete"),
    sharedComponentNode("ORDER_Verification", "Order Verification", "L_Order_Verified"),
    branchNode({
      id: "L_Order_Verified",
      edges: [
        equationEdge("order_is_verified", "L_Post_Verification_Request", "order_verified", "==", "true"),
      ],
      elseDestination: "SF_Contact_Existing_Support",
    }),
    branchNode({
      id: "L_Post_Verification_Request",
      edges: [
        promptEdge(
          "verified_request_support",
          "SF_Contact_Existing_Support",
          "The caller wants help resolving damage, a claim, return, warranty, photos, a missing or wrong item, or another service problem.",
        ),
        promptEdge(
          "verified_request_shipment",
          "SHIPMENT_Order",
          "The caller asks about shipment status, tracking, carrier information, delivery or arrival timing, how long an order or samples will take to arrive, or shipment details by email, and is not describing a service problem.",
        ),
      ],
      elseDestination: "C_Existing_Order_Help",
    }),
    conversationNode({
      id: "C_Existing_Order_Help",
      instruction:
        "Continue with the request the caller already described. Only if they have not said what they need, ask: What can I help you with? Answer from approved GenStone knowledge when possible.",
      knowledgeBase: true,
      edges: [
        promptEdge("existing_order_shipment", "SHIPMENT_Order", "The caller asks about shipping, tracking, delivery, arrival, carrier information, or shipment email."),
        promptEdge("existing_order_support", "SF_Contact_Existing_Support", "The verified-order issue requires customer-service follow-up or cannot be fully answered."),
        promptEdge("existing_order_answered", "E_Call_Complete", "The verified information fully answers the caller."),
      ],
    }),
    sharedComponentNode("SHIPMENT_Order", "Shipment", "E_Call_Complete"),
    sharedComponentNode("SF_Contact_Existing_Support", "Contact Lookup", "SUP_Followup"),
    sharedComponentNode("SUP_Followup", "Tracked Support", "E_Call_Complete"),
    sharedComponentNode("CB_New_Project", "Callback", "E_Call_Complete"),
    sharedComponentNode("TRANSFER_Named_Employee", "Named Employee Transfer", "L_After_Named_Transfer"),
    branchNode({
      id: "L_After_Named_Transfer",
      edges: [
        equationEdge("transfer_resume_verified_order", "C_Existing_Order_Help", "order_verified", "==", "true"),
        promptEdge("transfer_resume_existing_order", "ORDER_Verification", "The current request concerns an existing order."),
        promptEdge("transfer_resume_new_project", "C_New_Project_Help", "The current request concerns a new project."),
      ],
      elseDestination: "C_Greet_And_Route",
    }),
    sharedComponentNode("DNC_Global", "DNC", "E_Call_Complete"),
    endNode("E_Call_Complete", {
      sayGoodbye: true,
      globalNodeSetting: {
        condition:
          "The caller clearly wants to end the call or says it is a wrong number, and no requested, offered, promised, or pending follow-up action still needs to run. Phrases such as that's everything or goodbye do not end the call while an agreed follow-up, callback, email, support write, transfer, or suppression action remains incomplete.",
        cool_down: 3,
        positive_finetune_examples: [
          { transcript: [{ role: "user", content: "Wrong number, goodbye." }] },
          { transcript: [{ role: "user", content: "That'll be all." }] },
        ],
        negative_finetune_examples: [
          { transcript: [{ role: "user", content: "Give me a moment to find the order number." }] },
        ],
      },
    }),
    conversationNode({
      id: "G_Human_Request",
      instruction:
        "If the caller named an employee, say you will check that person. Otherwise say you can continue helping with the caller's current request. Do not ask them to choose a person or department.",
      edges: [
        promptEdge("human_named_employee", "TRANSFER_Named_Employee", "The caller independently supplied an employee name."),
      ],
      globalNodeSetting: {
        condition: "The caller clearly asks for a human or department, or asks to speak with a named employee anywhere in the call.",
        cool_down: 3,
        go_back_conditions: [
          {
            id: "human_request_go_back",
            transition_condition: promptCondition(
              "The caller accepts help from the agent or continues describing the current request without naming an employee.",
            ),
          },
        ],
        positive_finetune_examples: [
          { transcript: [{ role: "user", content: "Can I speak with a person?" }] },
          { transcript: [{ role: "user", content: "Could I speak with Adeola, please?" }] },
        ],
        negative_finetune_examples: [
          { transcript: [{ role: "user", content: "You sound human." }] },
        ],
      },
    }),
    conversationNode({
      id: "G_Do_Not_Call",
      instruction: "Enter the do-not-call confirmation. Frustration alone is not a suppression request.",
      alwaysDestination: "DNC_Global",
      globalNodeSetting: {
        condition: "The caller explicitly asks GenStone to stop calling or remove a phone number.",
        cool_down: 3,
        positive_finetune_examples: [
          { transcript: [{ role: "user", content: "Put this number on your do-not-call list." }] },
        ],
        negative_finetune_examples: [
          { transcript: [{ role: "user", content: "I am frustrated that nobody called me back." }] },
        ],
      },
    }),
  ];
}

export function buildConversationFlowConfig(
  input: BuildConfigInput,
): ConversationFlowCreateParams {
  return {
    model_choice: {
      type: "cascading",
      model: "gpt-5.5",
      high_priority: true,
    },
    model_temperature: 0.2,
    start_speaker: "agent",
    start_node_id: "C_Greet_Name",
    flex_mode: false,
    tool_call_strict_mode: true,
    global_prompt:
      "Use only approved knowledge, caller-confirmed facts, and verified tool results. Never claim an action succeeded before its tool succeeds. Never invent an outcome, promise, ETA, inventory status, approval, policy, or capability. Never expose internal system names, tool data, identifiers, credentials, direct employee numbers, internal addresses, or raw errors. Never read a tracking number aloud.",
    default_dynamic_variables: defaultDynamicVariables,
    knowledge_base_ids: [KNOWLEDGE_BASE_ID],
    kb_config: {
      top_k: 3,
      filter_score: 0.6,
    },
    notes: [
      { id: FLOW_RELEASE, content: `Immutable GenStone Retell draft release ${SHARED_COMPONENT_RELEASE}`, display_position: { x: -300, y: -200 }, size: { width: 260, height: 90 } },
      { id: "note_main_router", content: "Main router", display_position: { x: 0, y: 0 }, size: { width: 220, height: 90 } },
      { id: "note_new_project", content: "New-project path", display_position: { x: -650, y: 450 }, size: { width: 220, height: 90 } },
      { id: "note_existing_order", content: "Existing-order path", display_position: { x: 450, y: 450 }, size: { width: 220, height: 90 } },
      { id: "note_global_interruptions", content: "Global interruptions", display_position: { x: 900, y: 0 }, size: { width: 220, height: 90 } },
      { id: "note_result_handling", content: "Caller-safe result handling", display_position: { x: 0, y: 1100 }, size: { width: 240, height: 90 } },
    ],
    nodes: buildMainNodes(input.sharedComponentIds),
  };
}

export type RetellSharedComponentBuild = {
  componentName: RetellSharedComponentName;
  config: ConversationFlowComponentCreateParams;
};

export function buildSharedComponentConfigs(
  input: SharedComponentBuildInput,
): RetellSharedComponentBuild[] {
  const components: Array<{
    componentName: RetellSharedComponentName;
    config: Component;
  }> = [
    {
      componentName: "Contact Lookup",
      config: createContactLookupComponent(input.workerApiKey),
    },
    {
      componentName: "Order Verification",
      config: createOrderVerificationComponent(input.workerApiKey),
    },
    {
      componentName: "Prospect Follow-Up",
      config: createProspectFollowupComponent(input.workerApiKey),
    },
    {
      componentName: "Shipment",
      config: createShipmentComponent(input.workerApiKey),
    },
    {
      componentName: "Tracked Support",
      config: createTrackedSupportComponent(input.workerApiKey),
    },
    {
      componentName: "Callback",
      config: createCallbackComponent(input.workerApiKey),
    },
    {
      componentName: "Named Employee Transfer",
      config: createNamedEmployeeTransferComponent(input.workerApiKey),
    },
    {
      componentName: "DNC",
      config: createDncComponent(input.workerApiKey),
    },
  ];

  return components.map(({ componentName, config }) => ({
    componentName,
    config: {
      ...config,
      name: RETELL_SHARED_COMPONENT_NAMES[componentName],
    },
  }));
}

export function buildAgentConfig(
  conversationFlowId: string,
  conversationFlowVersion: number,
): AgentCreateParams {
  return {
    agent_name: "GenStone Customer Agent",
    response_engine: {
      type: "conversation-flow",
      conversation_flow_id: conversationFlowId,
      version: conversationFlowVersion,
    },
    voice_id: "retell-Brynne",
    voice_temperature: 1,
    voice_speed: 1,
    volume: 1,
    responsiveness: 0.7,
    interruption_sensitivity: 0.6,
    end_call_after_silence_ms: 50_000,
    max_call_duration_ms: 600_000,
    ambient_sound: "call-center",
    language: "en-US",
    timezone: "America/Denver",
    data_storage_setting: "everything",
    handbook_config: {
      speech_normalization: true,
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
      {
        name: "primary_route",
        type: "enum",
        choices: ["new_project", "existing_order", "other"],
        description: "Primary caller route.",
      },
      {
        name: "call_outcome",
        type: "enum",
        choices: [
          "answered",
          "shipment_emailed",
          "callback_scheduled",
          "support_follow_up",
          "prospect_follow_up",
          "transferred",
          "dnc",
          "ended",
          "tool_failure",
        ],
        description: "Final caller-safe operational outcome.",
      },
      {
        name: "order_verified",
        type: "boolean",
        description: "Whether both order verification checks passed.",
      },
      {
        name: "capability_gap_summary",
        type: "string",
        description: "Unsupported request captured for quality review.",
      },
    ],
  };
}

export const RETELL_BUILD_CONSTANTS = {
  flowRelease: FLOW_RELEASE,
  knowledgeBaseId: KNOWLEDGE_BASE_ID,
  sharedComponentRelease: SHARED_COMPONENT_RELEASE,
  workerBaseUrl: WORKER_BASE_URL,
} as const;
