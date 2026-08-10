import type { ConversationFlowCreateParams } from "retell-sdk/resources/conversation-flow";
import type { ConversationFlowComponentCreateParams } from "retell-sdk/resources/conversation-flow-component";

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
const SHARED_COMPONENT_RELEASE = "v5";
const FLOW_RELEASE = "genstone_customer_agent_v5";

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

defaultDynamicVariables.call_outcome = "not_run";

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

function extractNode(input: {
  id: string;
  variables: FlowExtractVariable[];
  destinationNodeId: string;
}): FlowNode {
  return {
    id: input.id,
    name: input.id,
    type: "extract_dynamic_variables",
    variables: input.variables,
    edges: [alwaysEdge(`${input.id}_always`, input.destinationNodeId)],
  } as FlowNode;
}

function branchNode(input: {
  id: string;
  edges: Array<ReturnType<typeof equationEdge> | ReturnType<typeof compoundEquationEdge>>;
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

function endNode(id: string): FlowNode {
  return {
    id,
    name: id,
    type: "end",
    speak_during_execution: false,
  };
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
    speak_during_execution: true,
    speak_after_execution: false,
    execution_message_type: "static_text",
    execution_message_description: "One moment while I check that.",
    timeout_ms: 15_000,
  } as ComponentTool;
}

function componentConversation(input: {
  id: string;
  instruction: string;
  alwaysDestination?: string;
  edges?: Array<ReturnType<typeof promptEdge>>;
  elseDestination?: string;
}): ComponentNode {
  return conversationNode(input) as ComponentNode;
}

function componentExtract(input: {
  id: string;
  variables: FlowExtractVariable[];
  destinationNodeId: string;
}): ComponentNode {
  return extractNode(input) as ComponentNode;
}

function componentBranch(input: {
  id: string;
  edges: Array<ReturnType<typeof equationEdge>>;
  elseDestination: string;
}): ComponentNode {
  return branchNode(input) as ComponentNode;
}

function componentFunction(
  id: string,
  toolName: string,
  destinationNodeId: string,
  speakDuringExecution = true,
): ComponentNode {
  return {
    id,
    name: id,
    type: "function",
    tool_id: `tool_${toolName}`,
    tool_type: "local",
    wait_for_result: true,
    speak_during_execution: speakDuringExecution,
    edges: [alwaysEdge(`${id}_always`, destinationNodeId)],
  } as ComponentNode;
}

function componentExit(id: string): ComponentNode {
  return endNode(id) as ComponentNode;
}

function createContactLookupComponent(workerApiKey: string): Component {
  const tool = customTool({
    name: "lookup_contact",
    route: "/v1/retell/tools/contacts/lookup",
    description: "Look up a confirmed caller phone or email in Salesforce.",
    workerApiKey,
    properties: {
      call_id: dynamicString("call_id", "Retell call reference."),
      phone: dynamicString("confirmed_phone", "Caller-confirmed phone number."),
      email: dynamicString("caller_email", "Optional caller-confirmed email."),
    },
    required: ["call_id", "phone"],
    responseVariables: {
      contact_lookup_status: "result_code",
      contact_token: "data.contact_token",
    },
  });

  return {
    name: "Contact Lookup",
    flex_mode: false,
    start_node_id: "C_Confirm_Caller_Number",
    tools: [tool],
    nodes: [
      componentConversation({
        id: "C_Confirm_Caller_Number",
        instruction:
          "Collect the caller's name. Offer {{user_number}} as the lookup number and confirm it or collect one replacement. Collect email only when useful.",
        alwaysDestination: "X_Contact_Details",
      }),
      componentExtract({
        id: "X_Contact_Details",
        variables: [
          {
            name: "confirmed_phone",
            type: "string",
            description: "The phone number the caller confirmed for lookup.",
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
            description: "The caller-confirmed email, when supplied.",
          },
        ],
        destinationNodeId: "C_Read_Back_Contact",
      }),
      componentConversation({
        id: "C_Read_Back_Contact",
        instruction:
          "Read back only the minimum lookup fields. A correction returns to collection; a confirmation continues.",
        edges: [
          promptEdge(
            "C_Read_Back_Contact_correct",
            "F_Lookup_Contact",
            "The caller confirms the lookup details are correct.",
          ),
        ],
        elseDestination: "C_Confirm_Caller_Number",
      }),
      componentFunction(
        "F_Lookup_Contact",
        "lookup_contact",
        "L_Contact_Result",
      ),
      componentBranch({
        id: "L_Contact_Result",
        edges: [
          equationEdge("contact_found", "E_Contact_Lookup", "contact_lookup_status", "==", "found"),
          equationEdge("contact_not_found", "E_Contact_Lookup", "contact_lookup_status", "==", "not_found"),
          equationEdge("contact_ambiguous", "E_Contact_Lookup", "contact_lookup_status", "==", "ambiguous"),
          equationEdge("contact_validation", "E_Contact_Lookup", "contact_lookup_status", "==", "validation_failed"),
          equationEdge("contact_error", "E_Contact_Lookup", "contact_lookup_status", "==", "error"),
        ],
        elseDestination: "E_Contact_Lookup",
      }),
      componentExit("E_Contact_Lookup"),
    ],
  };
}

function createOrderVerificationComponent(workerApiKey: string): Component {
  const tool = customTool({
    name: "lookup_order",
    route: "/v1/retell/tools/orders/lookup",
    description: "Find one WooCommerce order candidate using a confirmed identifier.",
    workerApiKey,
    properties: {
      call_id: dynamicString("call_id", "Retell call reference."),
      identifier_type: dynamicString("order_identifier_type", "Approved identifier type."),
      identifier: dynamicString("order_identifier", "Caller-confirmed lookup value."),
    },
    required: ["call_id", "identifier_type", "identifier"],
    responseVariables: {
      order_lookup_status: "result_code",
      order_candidate_token: "data.order_candidate_token",
      order_item_summary: "data.order_item_summary",
      order_email_masked: "data.order_email_masked",
      order_status_summary: "data.order_status_summary",
    },
  });

  return {
    name: "Order Verification",
    flex_mode: false,
    start_node_id: "X_Caller_Phone_Order_Identifier",
    tools: [tool],
    nodes: [
      componentExtract({
        id: "X_Caller_Phone_Order_Identifier",
        variables: [
          {
            name: "order_identifier_type",
            type: "enum",
            choices: ["caller_phone"],
            description: "Use caller_phone for the first lookup.",
            required: true,
          },
          {
            name: "order_identifier",
            type: "string",
            description: "Use the caller-confirmed phone number for the first lookup.",
            required: true,
          },
        ],
        destinationNodeId: "F_Lookup_Order_By_Phone",
      }),
      componentFunction(
        "F_Lookup_Order_By_Phone",
        "lookup_order",
        "L_First_Order_Lookup",
      ),
      componentBranch({
        id: "L_First_Order_Lookup",
        edges: [
          equationEdge("first_order_found", "C_Confirm_Order_Candidate", "order_lookup_status", "==", "found"),
        ],
        elseDestination: "C_Collect_Alternate_Order_Identifier",
      }),
      componentConversation({
        id: "C_Collect_Alternate_Order_Identifier",
        instruction:
          "Ask for either a different phone number or a numeric WooCommerce order number, not both. Retailer, store, PO, and CPO values are context only.",
        alwaysDestination: "X_Alternate_Order_Identifier",
      }),
      componentExtract({
        id: "X_Alternate_Order_Identifier",
        variables: [
          {
            name: "order_identifier_type",
            type: "enum",
            choices: ["alternate_phone", "order_number"],
            description: "The one alternate identifier type supplied by the caller.",
            required: true,
          },
          {
            name: "order_identifier",
            type: "string",
            description: "The one caller-supplied alternate lookup value.",
            required: true,
          },
        ],
        destinationNodeId: "F_Lookup_Order_By_Alternate",
      }),
      componentFunction(
        "F_Lookup_Order_By_Alternate",
        "lookup_order",
        "L_Second_Order_Lookup",
      ),
      componentBranch({
        id: "L_Second_Order_Lookup",
        edges: [
          equationEdge("second_order_found", "C_Confirm_Order_Candidate", "order_lookup_status", "==", "found"),
        ],
        elseDestination: "X_Order_Unverified",
      }),
      componentConversation({
        id: "C_Confirm_Order_Candidate",
        instruction:
          "State only {{order_item_summary}} and ask the caller to confirm it. Then ask them to confirm the masked email hint {{order_email_masked}}. Never state a full email or order status here.",
        alwaysDestination: "X_Order_Confirmation",
      }),
      componentExtract({
        id: "X_Order_Confirmation",
        variables: [
          {
            name: "order_items_confirmed",
            type: "boolean",
            description: "True only when the caller confirms the candidate order items.",
            required: true,
          },
          {
            name: "order_email_confirmed",
            type: "boolean",
            description: "True only when the caller confirms the masked order email hint.",
            required: true,
          },
          {
            name: "order_verified",
            type: "boolean",
            description: "True only when both order confirmations are true.",
            required: true,
          },
        ],
        destinationNodeId: "L_Order_Confirmation",
      }),
      componentBranch({
        id: "L_Order_Confirmation",
        edges: [
          equationEdge("order_confirmed", "E_Order_Verification", "order_verified", "==", "true"),
        ],
        elseDestination: "X_Order_Unverified",
      }),
      componentExtract({
        id: "X_Order_Unverified",
        variables: [
          {
            name: "order_verified",
            type: "boolean",
            description: "Set false because order verification did not complete.",
            required: true,
          },
        ],
        destinationNodeId: "E_Order_Verification",
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
      customer_email: dynamicString("caller_email", "Optional caller-confirmed email."),
      project_summary: dynamicString("project_summary", "Caller-confirmed project summary."),
      postal_code: dynamicString("postal_code", "Optional project ZIP code."),
      prospect_confirmed: dynamicBoolean("prospect_confirmed", "Explicit read-back confirmation."),
    },
    required: [
      "call_id",
      "idempotency_key",
      "primary_route",
      "customer_name",
      "confirmed_phone",
      "project_summary",
      "prospect_confirmed",
    ],
    responseVariables: {
      prospect_followup_status: "result_code",
    },
  });

  return {
    name: "Prospect Follow-Up",
    flex_mode: false,
    start_node_id: "C_Collect_Project_Context",
    tools: [tool],
    nodes: [
      componentConversation({
        id: "C_Collect_Project_Context",
        instruction:
          "Collect the minimum useful project summary and optional ZIP. Do not conduct a quote or create a CRM record.",
        alwaysDestination: "X_Project_Context",
      }),
      componentExtract({
        id: "X_Project_Context",
        variables: [
          {
            name: "project_summary",
            type: "string",
            description: "Minimum useful caller-supplied new-project context.",
            required: true,
          },
          {
            name: "postal_code",
            type: "string",
            description: "Optional caller-supplied ZIP code.",
          },
        ],
        destinationNodeId: "C_Confirm_Project_Context",
      }),
      componentConversation({
        id: "C_Confirm_Project_Context",
        instruction: "Read back the caller's contact information and short project summary.",
        alwaysDestination: "X_Prospect_Confirmation",
      }),
      componentExtract({
        id: "X_Prospect_Confirmation",
        variables: [
          {
            name: "prospect_confirmed",
            type: "boolean",
            description: "True only when the caller confirms the contact and project summary.",
            required: true,
          },
        ],
        destinationNodeId: "L_Prospect_Confirmation",
      }),
      componentBranch({
        id: "L_Prospect_Confirmation",
        edges: [
          equationEdge("prospect_confirmed", "F_Send_Prospect_Followup", "prospect_confirmed", "==", "true"),
        ],
        elseDestination: "E_Prospect_Followup",
      }),
      componentFunction(
        "F_Send_Prospect_Followup",
        "send_prospect_follow_up",
        "L_Prospect_Write_Result",
      ),
      componentBranch({
        id: "L_Prospect_Write_Result",
        edges: [
          equationEdge("prospect_sent", "E_Prospect_Followup", "prospect_followup_status", "==", "sent"),
        ],
        elseDestination: "E_Prospect_Followup",
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
    properties: {
      call_id: dynamicString("call_id", "Retell call reference."),
      order_candidate_token: dynamicString("order_candidate_token", "Opaque verified order candidate."),
      order_items_confirmed: dynamicBoolean("order_items_confirmed", "Caller confirmed order items."),
      order_email_confirmed: dynamicBoolean("order_email_confirmed", "Caller confirmed masked order email."),
      order_verified: dynamicBoolean("order_verified", "Both verification checks passed."),
    },
    required: [
      "call_id",
      "order_candidate_token",
      "order_items_confirmed",
      "order_email_confirmed",
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
    description: "Email stored shipment details to the verified order email only.",
    workerApiKey,
    properties: {
      call_id: dynamicString("call_id", "Retell call reference."),
      idempotency_key: {
        type: "string",
        description: "Stable idempotency key for this call action.",
        const: "{{call_id}}:email_shipment_tracking",
      },
      order_candidate_token: dynamicString("order_candidate_token", "Opaque verified order candidate."),
      order_items_confirmed: dynamicBoolean("order_items_confirmed", "Caller confirmed order items."),
      order_email_confirmed: dynamicBoolean("order_email_confirmed", "Caller confirmed masked order email."),
      order_verified: dynamicBoolean("order_verified", "Both verification checks passed."),
      shipment_email_requested: dynamicBoolean("shipment_email_requested", "Caller requested or accepted shipment email."),
    },
    required: [
      "call_id",
      "idempotency_key",
      "order_candidate_token",
      "order_items_confirmed",
      "order_email_confirmed",
      "order_verified",
      "shipment_email_requested",
    ],
    responseVariables: {
      shipment_email_status: "result_code",
    },
  });

  return {
    name: "Shipment",
    flex_mode: false,
    start_node_id: "F_Lookup_Shipment",
    tools: [lookupTool, emailTool],
    nodes: [
      componentFunction("F_Lookup_Shipment", "lookup_shipment", "L_Shipment_Lookup"),
      componentBranch({
        id: "L_Shipment_Lookup",
        edges: [
          equationEdge("shipment_found", "C_Shipment_Answer_And_Email_Offer", "shipment_lookup_status", "==", "found"),
          equationEdge("shipment_missing", "E_Shipment", "shipment_lookup_status", "==", "shipment_unavailable"),
        ],
        elseDestination: "E_Shipment",
      }),
      componentConversation({
        id: "C_Shipment_Answer_And_Email_Offer",
        instruction:
          "Speak only {{shipment_safe_summary}}. Distinguish stored tracking information from an unavailable live ETA. Offer to email the details.",
        alwaysDestination: "X_Shipment_Email_Request",
      }),
      componentExtract({
        id: "X_Shipment_Email_Request",
        variables: [
          {
            name: "shipment_email_requested",
            type: "boolean",
            description: "True only if the caller asks for or accepts shipment email.",
            required: true,
          },
        ],
        destinationNodeId: "L_Shipment_Email_Request",
      }),
      componentBranch({
        id: "L_Shipment_Email_Request",
        edges: [
          equationEdge("email_requested", "C_Confirm_Order_Email_For_Shipment", "shipment_email_requested", "==", "true"),
        ],
        elseDestination: "E_Shipment",
      }),
      componentConversation({
        id: "C_Confirm_Order_Email_For_Shipment",
        instruction:
          "Confirm the masked order email {{order_email_masked}}. Do not accept an alternate recipient.",
        alwaysDestination: "X_Shipment_Email_Confirmation",
      }),
      componentExtract({
        id: "X_Shipment_Email_Confirmation",
        variables: [
          {
            name: "order_email_confirmed",
            type: "boolean",
            description: "True only when the caller reconfirms the masked order email.",
            required: true,
          },
        ],
        destinationNodeId: "L_Shipment_Email_Confirmation",
      }),
      componentBranch({
        id: "L_Shipment_Email_Confirmation",
        edges: [
          equationEdge("shipment_email_confirmed", "F_Email_Shipment_Tracking", "order_email_confirmed", "==", "true"),
        ],
        elseDestination: "E_Shipment",
      }),
      componentFunction(
        "F_Email_Shipment_Tracking",
        "email_shipment_tracking",
        "L_Shipment_Email_Result",
      ),
      componentBranch({
        id: "L_Shipment_Email_Result",
        edges: [
          equationEdge("shipment_email_sent", "E_Shipment", "shipment_email_status", "==", "sent"),
        ],
        elseDestination: "E_Shipment",
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
      order_email_confirmed: dynamicBoolean("order_email_confirmed", "Required when order context is supplied."),
      order_verified: dynamicBoolean("order_verified", "Required when order context is supplied."),
      customer_name: dynamicString("caller_name", "Caller-confirmed name when known."),
      confirmed_phone: dynamicString("confirmed_phone", "Caller-confirmed phone when known."),
      customer_email: dynamicString("caller_email", "Caller-confirmed email when known."),
      caller_type: dynamicString("caller_type", "Confirmed customer, contractor, distributor, retail partner, or other classification."),
      caller_country: dynamicString("caller_country", "Confirmed country when known."),
      support_summary: dynamicString("support_summary", "Caller-confirmed factual issue summary."),
      support_summary_confirmed: dynamicBoolean("support_summary_confirmed", "Explicit factual-summary confirmation."),
      communication_preference: dynamicString("communication_preference", "Optional ordinary follow-up preference."),
      urgency_context: dynamicString("urgency_context", "Optional factual priority context without a promise."),
      photo_context: dynamicString("photo_context", "Optional volunteered photo availability context."),
    },
    required: [
      "call_id",
      "idempotency_key",
      "primary_route",
      "customer_name",
      "confirmed_phone",
      "caller_type",
      "support_summary",
      "support_summary_confirmed",
    ],
    responseVariables: {
      case_write_status: "result_code",
    },
  });

  return {
    name: "Tracked Support",
    flex_mode: false,
    start_node_id: "C_Collect_Support_Summary",
    tools: [writeTool],
    nodes: [
      componentConversation({
        id: "C_Collect_Support_Summary",
        instruction:
          "Collect a short factual issue summary. Ensure caller name and confirmed phone are present. Identify whether the caller is the customer, a contractor, a distributor, a retail partner, or other; ask only when it is not already clear. Record country when known without guessing. Do not ask about photos by default. Preserve volunteered photo availability and communication preference as ordinary context.",
        alwaysDestination: "X_Support_Summary",
      }),
      componentExtract({
        id: "X_Support_Summary",
        variables: [
          {
            name: "caller_name",
            type: "string",
            description: "Caller-confirmed name for Zendesk.",
            required: true,
          },
          {
            name: "confirmed_phone",
            type: "string",
            description: "Caller-confirmed phone for Zendesk.",
            required: true,
          },
          {
            name: "support_summary",
            type: "string",
            description: "Short factual support issue summary.",
            required: true,
          },
          {
            name: "caller_type",
            type: "enum",
            choices: ["customer", "contractor", "distributor", "retail_partner", "other"],
            description: "Confirmed caller classification for Zendesk sorting.",
            required: true,
          },
          {
            name: "caller_country",
            type: "enum",
            choices: ["united_states", "canada", "other_country"],
            description: "Confirmed country when known.",
          },
          {
            name: "communication_preference",
            type: "string",
            description: "Optional caller-supplied follow-up preference.",
          },
          {
            name: "photo_context",
            type: "string",
            description: "Optional volunteered photo availability, without an upload promise.",
          },
          {
            name: "urgency_context",
            type: "string",
            description: "Optional factual urgency context, without a service promise.",
          },
        ],
        destinationNodeId: "C_Confirm_Support_Summary",
      }),
      componentConversation({
        id: "C_Confirm_Support_Summary",
        instruction: "Read back the factual issue summary. Do not mention the internal ticket creation.",
        alwaysDestination: "X_Support_Confirmation",
      }),
      componentExtract({
        id: "X_Support_Confirmation",
        variables: [
          {
            name: "support_summary_confirmed",
            type: "boolean",
            description: "True only after the caller confirms the factual support summary.",
            required: true,
          },
        ],
        destinationNodeId: "L_Support_Confirmation",
      }),
      componentBranch({
        id: "L_Support_Confirmation",
        edges: [
          equationEdge("support_confirmed", "F_Create_Support_Case", "support_summary_confirmed", "==", "true"),
        ],
        elseDestination: "E_Tracked_Support",
      }),
      componentFunction("F_Create_Support_Case", "create_support_case", "L_Case_Write_Result"),
      componentBranch({
        id: "L_Case_Write_Result",
        edges: [
          equationEdge("case_created", "E_Tracked_Support", "case_write_status", "==", "created"),
          equationEdge("notice_failed", "E_Tracked_Support", "case_write_status", "==", "created_notice_failed"),
        ],
        elseDestination: "E_Tracked_Support",
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
      callback_phone: dynamicString("callback_phone", "Caller-confirmed callback phone."),
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
      "callback_confirmed",
    ],
    responseVariables: {
      callback_status: "result_code",
    },
  });

  return {
    name: "Callback",
    flex_mode: false,
    start_node_id: "C_Collect_Callback_Request",
    tools: [tool],
    nodes: [
      componentConversation({
        id: "C_Collect_Callback_Request",
        instruction:
          "This component is only for a new project. Collect the caller's name if it is not already known. Propose a broad subject from the conversation and allow correction. Collect a preferred date, Mountain time, and callback phone. Use the current date in the agent's America/Denver timezone. Earliest is the next business day: if today is Monday, Tuesday is valid unless it is a U.S. federal holiday. Do not add an extra day. Use weekdays from 8:30 AM through 4:30 PM Mountain and exclude U.S. federal holidays.",
        alwaysDestination: "X_Callback_Request",
      }),
      componentExtract({
        id: "X_Callback_Request",
        variables: [
          { name: "caller_name", type: "string", description: "Caller-confirmed name.", required: true },
          { name: "callback_subject", type: "string", description: "Broad caller-approved callback topic.", required: true },
          { name: "callback_summary", type: "string", description: "Short factual callback summary.", required: true },
          { name: "callback_date", type: "string", description: "Requested date normalized to YYYY-MM-DD.", required: true },
          { name: "callback_time", type: "string", description: "Requested Mountain time normalized to 24-hour HH:MM.", required: true },
          { name: "callback_phone", type: "string", description: "Caller-confirmed callback phone.", required: true },
          { name: "communication_preference", type: "string", description: "Optional ordinary follow-up preference." },
          { name: "urgency_context", type: "string", description: "Optional factual urgency context without a service promise." },
        ],
        destinationNodeId: "C_Confirm_Callback_Request",
      }),
      componentConversation({
        id: "C_Confirm_Callback_Request",
        instruction:
          "Read back the subject, date, Mountain time, and callback phone. Do not offer or promise a particular coordinator.",
        alwaysDestination: "X_Callback_Confirmation",
      }),
      componentExtract({
        id: "X_Callback_Confirmation",
        variables: [
          {
            name: "callback_confirmed",
            type: "boolean",
            description: "True only after the caller confirms the complete read-back.",
            required: true,
          },
        ],
        destinationNodeId: "L_Callback_Confirmation",
      }),
      componentBranch({
        id: "L_Callback_Confirmation",
        edges: [
          equationEdge("callback_confirmed", "F_Schedule_Callback", "callback_confirmed", "==", "true"),
        ],
        elseDestination: "E_Callback",
      }),
      componentFunction("F_Schedule_Callback", "schedule_callback", "L_Callback_Write_Result"),
      componentBranch({
        id: "L_Callback_Write_Result",
        edges: [
          equationEdge("callback_scheduled", "E_Callback", "callback_status", "==", "scheduled"),
        ],
        elseDestination: "E_Callback",
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
    start_node_id: "X_Requested_Employee",
    tools: [tool],
    nodes: [
      componentExtract({
        id: "X_Requested_Employee",
        variables: [
          {
            name: "requested_employee_name",
            type: "string",
            description: "The employee name the caller independently supplied.",
            required: true,
          },
        ],
        destinationNodeId: "F_Lookup_Active_Employee",
      }),
      componentFunction(
        "F_Lookup_Active_Employee",
        "lookup_active_employee",
        "L_Employee_Result",
        false,
      ),
      componentBranch({
        id: "L_Employee_Result",
        edges: [
          equationEdge("employee_found", "L_Employee_Channel", "employee_lookup_status", "==", "found"),
        ],
        elseDestination: "E_Named_Employee_Transfer",
      }),
      componentBranch({
        id: "L_Employee_Channel",
        edges: [
          equationEdge(
            "employee_found_phone_call",
            "C_Confirm_Named_Transfer",
            "call_type",
            "==",
            "phone_call",
          ),
        ],
        elseDestination: "C_Web_Call_Transfer_Fallback",
      }),
      componentConversation({
        id: "C_Web_Call_Transfer_Fallback",
        instruction:
          "Explain that this call channel cannot make a live connection, so you will use the normal follow-up path. Do not say a transfer was attempted, promise a transfer, or imply the employee is unavailable.",
        alwaysDestination: "E_Named_Employee_Transfer",
      }),
      componentConversation({
        id: "C_Confirm_Named_Transfer",
        instruction:
          "Confirm the matched name {{employee_display_name}} and ask whether to transfer. Do not say the employee is available and never speak the transfer target.",
        alwaysDestination: "X_Transfer_Confirmation",
      }),
      componentExtract({
        id: "X_Transfer_Confirmation",
        variables: [
          {
            name: "transfer_confirmed",
            type: "boolean",
            description: "True only when the caller confirms the named transfer.",
            required: true,
          },
        ],
        destinationNodeId: "L_Transfer_Confirmation",
      }),
      componentBranch({
        id: "L_Transfer_Confirmation",
        edges: [
          compoundEquationEdge("transfer_confirmed_phone_call", "T_Named_Employee", [
            {
              variable: "transfer_confirmed",
              operator: "==",
              value: "true",
            },
            {
              variable: "call_type",
              operator: "==",
              value: "phone_call",
            },
          ]),
        ],
        elseDestination: "E_Named_Employee_Transfer",
      }),
      {
        id: "T_Named_Employee",
        name: "T_Named_Employee",
        type: "transfer_call",
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
              "Privately tell {{employee_display_name}} this is a GenStone caller. Include only the caller name and broad topic when known. Do not include order details, email, payment, or other unnecessary sensitive information.",
          },
          show_transferee_as_caller: true,
        },
        speak_during_execution: true,
        instruction: staticText("I’ll connect you now."),
        edge: {
          id: "T_Named_Employee_failed",
          destination_node_id: "E_Named_Employee_Transfer",
          transition_condition: {
            type: "prompt",
            prompt: "Transfer failed",
          },
        },
      } as ComponentNode,
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
    start_node_id: "C_Confirm_DNC_Number",
    tools: [tool],
    nodes: [
      componentConversation({
        id: "C_Confirm_DNC_Number",
        instruction:
          "Confirm {{user_number}}, or collect the specific number the caller wants suppressed. Confirm the do-not-call request once.",
        alwaysDestination: "X_DNC_Request",
      }),
      componentExtract({
        id: "X_DNC_Request",
        variables: [
          { name: "dnc_phone", type: "string", description: "The phone confirmed for suppression.", required: true },
          { name: "dnc_confirmed", type: "boolean", description: "True only for an explicit confirmed do-not-call request.", required: true },
        ],
        destinationNodeId: "L_DNC_Confirmation",
      }),
      componentBranch({
        id: "L_DNC_Confirmation",
        edges: [
          equationEdge("dnc_confirmed", "F_Suppress_Phone", "dnc_confirmed", "==", "true"),
        ],
        elseDestination: "E_DNC",
      }),
      componentFunction("F_Suppress_Phone", "suppress_phone_number", "L_DNC_Write_Result"),
      componentBranch({
        id: "L_DNC_Write_Result",
        edges: [
          equationEdge("dnc_suppressed", "E_DNC", "dnc_status", "==", "suppressed"),
          equationEdge("dnc_duplicate", "E_DNC", "dnc_status", "==", "already_suppressed"),
        ],
        elseDestination: "E_DNC",
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
      id: "C_Greet_And_Classify",
      instruction:
        "Thank you for calling GenStone. Are you calling about a new project or existing order?",
      staticInstruction: true,
      edges: [
        promptEdge("greet_new_project", "X_Primary_Route", "The caller is asking about a new project."),
        promptEdge("greet_existing_order", "X_Primary_Route", "The caller is asking about an existing order."),
      ],
      elseDestination: "C_Clarify_Request",
    }),
    extractNode({
      id: "X_Primary_Route",
      variables: [
        {
          name: "primary_route",
          type: "enum",
          choices: ["new_project", "existing_order", "other"],
          description: "Classify the caller's primary reason for calling.",
          required: true,
        },
      ],
      destinationNodeId: "L_Primary_Route",
    }),
    branchNode({
      id: "L_Primary_Route",
      edges: [
        equationEdge("route_new_project", "C_New_Project_Help", "primary_route", "==", "new_project"),
        equationEdge("route_existing_order", "SF_Contact_Existing_Order", "primary_route", "==", "existing_order"),
      ],
      elseDestination: "C_Clarify_Request",
    }),
    conversationNode({
      id: "C_Clarify_Request",
      instruction:
        "Ask whether this is a new project or an existing order. Do not offer a department, callback, or support outcome until the primary route is known.",
      edges: [
        promptEdge("clarify_new_project", "C_New_Project_Help", "The request is an approved new-project or public-knowledge question."),
        promptEdge("clarify_existing_order", "SF_Contact_Existing_Order", "The request concerns an existing order."),
        promptEdge("clarify_unsupported", "X_Capability_Gap", "The request cannot be completed with an approved answer or existing path."),
      ],
      elseDestination: "C_Greet_And_Classify",
    }),
    extractNode({
      id: "X_Capability_Gap",
      variables: [
        { name: "capability_gap_summary", type: "string", description: "Short factual summary of the unsupported request.", required: true },
      ],
      destinationNodeId: "L_Capability_Gap",
    }),
    branchNode({
      id: "L_Capability_Gap",
      edges: [
        equationEdge("gap_new_project", "CB_Capability_Gap", "primary_route", "==", "new_project"),
        equationEdge("gap_existing_order", "SUP_Capability_Gap", "primary_route", "==", "existing_order"),
      ],
      elseDestination: "C_Greet_And_Classify",
    }),
    conversationNode({
      id: "C_New_Project_Help",
      instruction:
        "Answer only from the approved GenStone knowledge base. If the question is fully answered, close. If information must be sent or answered later, collect contact context for follow-up.",
      knowledgeBase: true,
      edges: [
        promptEdge("new_project_answered", "C_Close_Answered", "The approved knowledge fully answers the caller's question."),
        promptEdge("new_project_followup", "SF_Contact_New_Project", "The caller needs information sent or answered later."),
      ],
      elseDestination: "SF_Contact_New_Project",
    }),
    sharedComponentNode("SF_Contact_New_Project", "Contact Lookup", "L_New_Project_Contact"),
    branchNode({
      id: "L_New_Project_Contact",
      edges: [
        equationEdge("new_contact_not_found", "PROSPECT_New_Project", "contact_lookup_status", "==", "not_found"),
        equationEdge("new_contact_found", "CB_New_Project", "contact_lookup_status", "==", "found"),
        equationEdge("new_contact_ambiguous", "CB_New_Project", "contact_lookup_status", "==", "ambiguous"),
        equationEdge("new_contact_validation", "CB_New_Project", "contact_lookup_status", "==", "validation_failed"),
        equationEdge("new_contact_error", "CB_New_Project", "contact_lookup_status", "==", "error"),
      ],
      elseDestination: "C_Close_Tool_Failure",
    }),
    sharedComponentNode("PROSPECT_New_Project", "Prospect Follow-Up", "L_Prospect_Component_Result"),
    branchNode({
      id: "L_Prospect_Component_Result",
      edges: [
        equationEdge("prospect_result_sent", "C_Close_Prospect_Followup", "prospect_followup_status", "==", "sent"),
      ],
      elseDestination: "C_Close_Tool_Failure",
    }),
    sharedComponentNode("SF_Contact_Existing_Order", "Contact Lookup", "L_Existing_Contact"),
    branchNode({
      id: "L_Existing_Contact",
      edges: [],
      elseDestination: "ORDER_Verification",
    }),
    sharedComponentNode("ORDER_Verification", "Order Verification", "L_Order_Verified"),
    branchNode({
      id: "L_Order_Verified",
      edges: [
        equationEdge("order_is_verified", "C_Order_Help", "order_verified", "==", "true"),
      ],
      elseDestination: "SUP_Order_Unverified",
    }),
    conversationNode({
      id: "C_Order_Help",
      instruction:
        "Ask how the caller needs help, or repeat back the issue already supplied. Classify tracking numbers, carrier status, shipped status, delivery or arrival questions, and requests to email shipment details as shipment. Use tracked support only for a non-shipment order issue that requires customer-service follow-up. Use direct answer only when verified order data or approved knowledge already answers the question. Existing-order callbacks are not allowed.",
      alwaysDestination: "X_Order_Help_Outcome",
    }),
    extractNode({
      id: "X_Order_Help_Outcome",
      variables: [
        {
          name: "order_help_outcome",
          type: "enum",
          choices: ["direct_answer", "shipment", "tracked_support"],
          description: "The one approved existing-order outcome.",
          required: true,
        },
      ],
      destinationNodeId: "L_Order_Help_Outcome",
    }),
    branchNode({
      id: "L_Order_Help_Outcome",
      edges: [
        equationEdge("order_direct_answer", "C_Order_Direct_Answer", "order_help_outcome", "==", "direct_answer"),
        equationEdge("order_shipment", "SHIPMENT_Order", "order_help_outcome", "==", "shipment"),
        equationEdge("order_support", "SUP_Order", "order_help_outcome", "==", "tracked_support"),
      ],
      elseDestination: "C_Clarify_Request",
    }),
    conversationNode({
      id: "C_Order_Direct_Answer",
      instruction:
        "Speak only verified WooCommerce data or approved public knowledge. Never infer ETA, delivery, approval, inventory, or an outcome.",
      knowledgeBase: true,
      alwaysDestination: "C_Close_Answered",
    }),
    sharedComponentNode("SHIPMENT_Order", "Shipment", "L_Shipment_Result"),
    branchNode({
      id: "L_Shipment_Result",
      edges: [
        equationEdge("shipment_email_sent_main", "C_Close_Answered", "shipment_email_status", "==", "sent"),
        compoundEquationEdge("shipment_email_not_requested", "C_Close_Answered", [
          { variable: "shipment_lookup_status", operator: "==", value: "found" },
          { variable: "shipment_email_requested", operator: "==", value: "false" },
        ]),
        compoundEquationEdge("shipment_email_not_reconfirmed", "C_Close_Answered", [
          { variable: "shipment_lookup_status", operator: "==", value: "found" },
          { variable: "shipment_email_requested", operator: "==", value: "true" },
          { variable: "order_email_confirmed", operator: "==", value: "false" },
        ]),
        equationEdge("shipment_missing_main", "SUP_Shipment", "shipment_lookup_status", "==", "shipment_unavailable"),
      ],
      elseDestination: "C_Close_Tool_Failure",
    }),
    sharedComponentNode("SUP_Order", "Tracked Support", "L_Support_Result"),
    sharedComponentNode("SUP_Order_Unverified", "Tracked Support", "L_Support_Result"),
    sharedComponentNode("SUP_Shipment", "Tracked Support", "L_Support_Result"),
    sharedComponentNode("SUP_Capability_Gap", "Tracked Support", "L_Support_Result"),
    sharedComponentNode("SUP_Human_Request", "Tracked Support", "L_Support_Result"),
    sharedComponentNode("SUP_Transfer_Fallback", "Tracked Support", "L_Support_Result"),
    branchNode({
      id: "L_Support_Result",
      edges: [
        equationEdge("support_created", "C_Close_Support_Followup", "case_write_status", "==", "created"),
        equationEdge("support_notice_failed", "C_Close_Support_Followup", "case_write_status", "==", "created_notice_failed"),
      ],
      elseDestination: "C_Close_Tool_Failure",
    }),
    sharedComponentNode("CB_New_Project", "Callback", "L_Callback_Component_Result"),
    sharedComponentNode("CB_Capability_Gap", "Callback", "L_Callback_Component_Result"),
    sharedComponentNode("CB_Human_Request", "Callback", "L_Callback_Component_Result"),
    sharedComponentNode("CB_Transfer_Fallback", "Callback", "L_Callback_Component_Result"),
    branchNode({
      id: "L_Callback_Component_Result",
      edges: [
        equationEdge("callback_result_scheduled", "C_Close_Callback", "callback_status", "==", "scheduled"),
      ],
      elseDestination: "C_Close_Tool_Failure",
    }),
    sharedComponentNode("TRANSFER_Named_Employee", "Named Employee Transfer", "L_Named_Transfer_Result"),
    branchNode({
      id: "L_Named_Transfer_Result",
      edges: [
        equationEdge("transfer_attempt_failed", "C_Transfer_Unavailable", "transfer_confirmed", "==", "true"),
      ],
      elseDestination: "L_Transfer_Fallback",
    }),
    conversationNode({
      id: "C_Transfer_Unavailable",
      instruction:
        "Tell the caller the connection could not be completed. Do not claim the employee declined or is unavailable. Continue with the follow-up for the already-classified primary route.",
      alwaysDestination: "L_Transfer_Fallback",
    }),
    branchNode({
      id: "L_Transfer_Fallback",
      edges: [
        equationEdge("transfer_fallback_new_project", "CB_Transfer_Fallback", "primary_route", "==", "new_project"),
        equationEdge("transfer_fallback_existing_order", "SUP_Transfer_Fallback", "primary_route", "==", "existing_order"),
      ],
      elseDestination: "C_Greet_And_Classify",
    }),
    branchNode({
      id: "L_Human_Request_Route",
      edges: [
        equationEdge("human_request_new_project", "CB_Human_Request", "primary_route", "==", "new_project"),
        equationEdge("human_request_existing_order", "SUP_Human_Request", "primary_route", "==", "existing_order"),
      ],
      elseDestination: "C_Greet_And_Classify",
    }),
    sharedComponentNode("DNC_Global", "DNC", "L_DNC_Component_Result"),
    branchNode({
      id: "L_DNC_Component_Result",
      edges: [
        equationEdge("dnc_result_suppressed", "C_Close_DNC", "dnc_status", "==", "suppressed"),
        equationEdge("dnc_result_duplicate", "C_Close_DNC", "dnc_status", "==", "already_suppressed"),
      ],
      elseDestination: "C_Close_Tool_Failure",
    }),
    conversationNode({
      id: "C_Close_Answered",
      instruction: "Briefly summarize only the verified answer and close naturally.",
      alwaysDestination: "X_Final_Call_Outcome",
    }),
    conversationNode({
      id: "C_Close_Prospect_Followup",
      instruction:
        "Say the information was sent to the team and state only the agreed next step. Never mention an internal recipient or Salesforce record.",
      alwaysDestination: "X_Final_Call_Outcome",
    }),
    conversationNode({
      id: "C_Close_Callback",
      instruction:
        "Confirm only the accepted callback date, Mountain time, and callback phone. Never mention internal email.",
      alwaysDestination: "X_Final_Call_Outcome",
    }),
    conversationNode({
      id: "C_Close_Support_Followup",
      instruction:
        "Say the customer service team will respond by the end of the next business day. Never say case or ticket and never offer a callback appointment.",
      alwaysDestination: "X_Final_Call_Outcome",
    }),
    conversationNode({
      id: "C_Close_DNC",
      instruction: "Confirm that the do-not-call request was handled.",
      alwaysDestination: "X_Final_Call_Outcome",
    }),
    conversationNode({
      id: "C_Close_Tool_Failure",
      instruction:
        "Do not claim an action succeeded. Apologize briefly and preserve the requested context for quality review.",
      alwaysDestination: "X_Final_Call_Outcome",
    }),
    extractNode({
      id: "X_Final_Call_Outcome",
      variables: [
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
          description: "Choose exactly one outcome from the completed path and tool statuses.",
          required: true,
        },
      ],
      destinationNodeId: "E_Call_Complete",
    }),
    endNode("E_Call_Complete"),
    conversationNode({
      id: "G_Human_Request",
      instruction:
        "If the caller already named an employee, say you will check whether that person can be connected, then use named employee transfer. Do not promise or announce a transfer before the channel and employee lookup permit it. Otherwise use the follow-up for the already-classified primary route. Never ask a generic requester to choose a person or department.",
      edges: [
        promptEdge("human_named_employee", "TRANSFER_Named_Employee", "The caller independently supplied an employee name."),
      ],
      elseDestination: "L_Human_Request_Route",
      globalNodeSetting: {
        condition: "The caller clearly asks for a human, employee, or department.",
        cool_down: 3,
        go_back_conditions: [
          {
            id: "human_request_go_back",
            transition_condition: promptCondition(
              "The caller changes their mind and asks the agent to continue helping.",
            ),
          },
        ],
        positive_finetune_examples: [
          { transcript: [{ role: "user", content: "Can I speak with a person?" }] },
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
    conversationNode({
      id: "G_End_Call",
      instruction: "Close politely without creating support or callback work.",
      alwaysDestination: "X_Final_Call_Outcome",
      globalNodeSetting: {
        condition: "The caller clearly wants to end the call or says it is a wrong number.",
        cool_down: 3,
        positive_finetune_examples: [
          { transcript: [{ role: "user", content: "Wrong number, goodbye." }] },
        ],
        negative_finetune_examples: [
          { transcript: [{ role: "user", content: "Give me a moment to find the order number." }] },
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
      model: "gpt-5.2",
      high_priority: true,
    },
    model_temperature: 0.2,
    start_speaker: "agent",
    start_node_id: "C_Greet_And_Classify",
    flex_mode: false,
    tool_call_strict_mode: true,
    global_prompt:
      "Follow the current node contract exactly. For new-project follow-up, use Salesforce contact lookup, then Prospect Follow-Up when the contact is not found or Callback for the other routed results. A verified existing-order request about tracking, shipping status, delivery, arrival, carrier information, or emailing shipment details always uses Shipment before any support fallback. Other unresolved existing-order work uses Tracked Support and never callback scheduling. Use only confirmed caller facts, verified tool results, and approved knowledge. Never speak opaque tokens, direct employee numbers, internal addresses, provider names, credentials, or raw errors. Never invent an outcome, promise, department, capability, ETA, or policy.",
    default_dynamic_variables: defaultDynamicVariables,
    knowledge_base_ids: [KNOWLEDGE_BASE_ID],
    kb_config: {
      top_k: 3,
      filter_score: 0.6,
    },
    notes: [
      { id: FLOW_RELEASE, content: "Immutable GenStone Retell draft release v5", display_position: { x: -300, y: -200 }, size: { width: 260, height: 90 } },
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

export const RETELL_BUILD_CONSTANTS = {
  flowRelease: FLOW_RELEASE,
  knowledgeBaseId: KNOWLEDGE_BASE_ID,
  sharedComponentRelease: SHARED_COMPONENT_RELEASE,
  workerBaseUrl: WORKER_BASE_URL,
} as const;
