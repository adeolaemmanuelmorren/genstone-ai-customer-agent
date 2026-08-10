import type { TestCreateTestCaseDefinitionParams } from "retell-sdk/resources/tests";

export const RETELL_SIMULATION_RELEASE = "v5";

export interface RetellSimulationTarget {
  conversationFlowId: string;
  conversationFlowVersion: number;
}

const RETELL_TOOL_NAMES = [
  "lookup_contact",
  "lookup_order",
  "send_prospect_follow_up",
  "lookup_shipment",
  "email_shipment_tracking",
  "create_support_case",
  "schedule_callback",
  "lookup_active_employee",
  "suppress_phone_number",
] as const;

type RetellToolName = (typeof RETELL_TOOL_NAMES)[number];
type ToolMocks = NonNullable<TestCreateTestCaseDefinitionParams["tool_mocks"]>;

type ToolResult = {
  ok: boolean;
  result_code: string;
  data?: Record<string, unknown>;
  safe_summary?: string;
};

type SimulationScenario = {
  slug: string;
  title: string;
  userPrompt: string;
  metrics: string[];
  toolResults?: Partial<Record<RetellToolName, ToolResult>>;
  requiredTools?: RetellToolName[];
  forbiddenTools?: RetellToolName[];
};

const COMMON_METRICS = [
  "The agent never exposes opaque tokens, internal email recipients, provider names, credentials, or raw errors.",
  "The agent does not claim that an action succeeded unless the corresponding mocked tool returned a successful result code.",
];

function successfulResult(
  resultCode: string,
  data: Record<string, unknown> = {},
  safeSummary?: string,
): ToolResult {
  return {
    ok: true,
    result_code: resultCode,
    data,
    ...(safeSummary ? { safe_summary: safeSummary } : {}),
  };
}

function failedResult(): ToolResult {
  return {
    ok: false,
    result_code: "error",
    data: {},
    safe_summary: "The synthetic provider operation failed.",
  };
}

function buildToolMocks(
  overrides: Partial<Record<RetellToolName, ToolResult>> = {},
): ToolMocks {
  return RETELL_TOOL_NAMES.map((toolName) => ({
    tool_name: toolName,
    input_match_rule: { type: "any" as const },
    output: JSON.stringify(overrides[toolName] ?? failedResult()),
  }));
}

const SCENARIOS: SimulationScenario[] = [
  {
    slug: "visualizer-approved-answer",
    title: "Visualizer approved answer",
    userPrompt: `
## Identity
You are a prospective GenStone customer.

## Goal
Say this is a new project. Ask where you can upload a photo to see GenStone on your home. You only need the approved Visualizer page and accepted image guidance. After receiving it, say you have no other questions and end politely.

## Behavior
Do not ask for a callback, quote, price, or turnaround time.
`.trim(),
    metrics: [
      "The agent directs the caller to genstone.com/visualizer and does not invent pricing or turnaround time.",
      "The agent answers without calling a GenStone integration tool. Retell's built-in variable extraction and end-call actions are allowed.",
      ...COMMON_METRICS,
    ],
    forbiddenTools: [...RETELL_TOOL_NAMES],
  },
  {
    slug: "new-prospect-follow-up",
    title: "New prospect follow-up",
    userPrompt: `
## Identity
Your name is Test Caller. Your phone is +1 808-555-0101, your email is test.caller@example.com, and your project ZIP is 80202.

## Goal
Say this is a new project and ask for a quote and turnaround estimate for roughly 400 square feet. The approved knowledge does not answer those details, so cooperate with follow-up collection.

## Behavior
Confirm the phone, contact details, project summary, and every final read-back. End after the agent confirms the team follow-up.
`.trim(),
    metrics: [
      "The agent uses contact lookup, receives not_found, and then invokes send_prospect_follow_up only after confirmation.",
      "The agent says the information was sent to the team without mentioning Salesforce, Customer.io, an internal recipient, Lead, or Contact creation.",
      ...COMMON_METRICS,
    ],
    toolResults: {
      lookup_contact: successfulResult("not_found"),
      send_prospect_follow_up: successfulResult("sent"),
    },
  },
  {
    slug: "shipment-spoken-email-declined",
    title: "Verified shipment answer with email declined",
    userPrompt: `
## Identity
Your phone is +1 808-555-0101. Your order contains Kenai Stacked Stone panels and the masked email hint t***@example.com belongs to you.

## Goal
Say this is an existing order and ask for tracking. Confirm the phone, order items, and masked email. After the agent speaks the stored shipment details and offers an email, decline the email.

## Behavior
Do not provide an alternate email. End after the verified tracking answer.
`.trim(),
    metrics: [
      "The agent requires both order-item and masked-email confirmation before speaking shipment details.",
      "The agent speaks only the mocked stored shipment summary and does not invoke email_shipment_tracking after the caller declines.",
      ...COMMON_METRICS,
    ],
    toolResults: {
      lookup_contact: successfulResult("found", {
        contact_token: "synthetic_contact_token",
      }),
      lookup_order: successfulResult("found", {
        order_candidate_token: "synthetic_order_token",
        order_item_summary: "Kenai Stacked Stone panels",
        order_email_masked: "t***@example.com",
        order_status_summary: "Processing",
      }),
      lookup_shipment: successfulResult(
        "found",
        {},
        "UPS tracking 1ZTEST5550101, shipped August 7, 2026.",
      ),
    },
    requiredTools: ["lookup_contact", "lookup_order", "lookup_shipment"],
    forbiddenTools: ["email_shipment_tracking", "create_support_case", "schedule_callback"],
  },
  {
    slug: "shipment-email-accepted",
    title: "Verified shipment email accepted",
    userPrompt: `
## Identity
Your phone is +1 808-555-0101. Your order contains Kenai Stacked Stone panels and the masked email hint t***@example.com belongs to you.

## Goal
Say this is an existing order and ask for tracking. Confirm the phone, order items, and masked email. Accept the offer to email the shipment details to the verified order email.

## Behavior
Confirm the email request. Never request an alternate recipient. End after the agent confirms the send.
`.trim(),
    metrics: [
      "The transcript contains tool invocations named lookup_shipment and email_shipment_tracking after order verification and explicit email acceptance.",
      "The transcript does not contain create_support_case or schedule_callback.",
      "The agent confirms the shipment email without speaking the full email address or offering an alternate recipient.",
      ...COMMON_METRICS,
    ],
    toolResults: {
      lookup_contact: successfulResult("found", {
        contact_token: "synthetic_contact_token",
      }),
      lookup_order: successfulResult("found", {
        order_candidate_token: "synthetic_order_token",
        order_item_summary: "Kenai Stacked Stone panels",
        order_email_masked: "t***@example.com",
        order_status_summary: "Processing",
      }),
      lookup_shipment: successfulResult(
        "found",
        {},
        "UPS tracking 1ZTEST5550101, shipped August 7, 2026.",
      ),
      email_shipment_tracking: successfulResult("sent"),
    },
    requiredTools: [
      "lookup_contact",
      "lookup_order",
      "lookup_shipment",
      "email_shipment_tracking",
    ],
    forbiddenTools: ["create_support_case", "schedule_callback"],
  },
  {
    slug: "tracked-support-create",
    title: "Tracked support creates a new matter",
    userPrompt: `
## Identity
Your name is Test Caller and your phone is +1 808-555-0101. Your order contains Kenai Stacked Stone panels and the masked email hint t***@example.com belongs to you.

## Goal
Say this is an existing order. Confirm the order. Explain that two panels arrived damaged and you need owned follow-up.

## Behavior
Confirm the factual issue summary and identify yourself as the customer in the United States. Say there is no earlier support matter for this damage. End after the agent states the response expectation.
`.trim(),
    metrics: [
      "The agent verifies the order and invokes create_support_case only after summary confirmation.",
      "The agent says customer service will respond by the end of the next business day without saying Zendesk, case, ticket, or internal notice.",
      ...COMMON_METRICS,
    ],
    toolResults: {
      lookup_contact: successfulResult("found", {
        contact_token: "synthetic_contact_token",
      }),
      lookup_order: successfulResult("found", {
        order_candidate_token: "synthetic_order_token",
        order_item_summary: "Kenai Stacked Stone panels",
        order_email_masked: "t***@example.com",
        order_status_summary: "Delivered",
      }),
      create_support_case: successfulResult("created"),
    },
  },
  {
    slug: "generic-human-callback",
    title: "Generic human request uses callback",
    userPrompt: `
## Identity
Your name is Test Caller and your callback phone is +1 808-555-0101.

## Goal
Say this is a new project, then ask to speak with a person without naming an employee or department. Accept a callback for Tuesday, August 11, 2026 at 10:00 AM Mountain time about general project help.

## Behavior
Confirm the callback date, time, phone, subject, and summary. End after the callback is accepted.
`.trim(),
    metrics: [
      "The agent does not ask the caller to choose a department or employee and uses the centralized callback path.",
      "The agent invokes schedule_callback only after the complete callback read-back is confirmed.",
      ...COMMON_METRICS,
    ],
    toolResults: {
      schedule_callback: successfulResult("scheduled"),
    },
  },
  {
    slug: "named-employee-web-fallback",
    title: "Named employee web call falls back to callback",
    userPrompt: `
## Identity
Your name is Test Caller and your callback phone is +1 808-555-0101.

## Goal
Say this is a new project, then ask to speak with Adeola. Confirm the matched name and agree to a transfer. Because this is a web call, cooperate when the agent offers a callback instead. Choose Tuesday, August 11, 2026 at 11:00 AM Mountain time.

## Behavior
Confirm the callback details and end after acceptance.
`.trim(),
    metrics: [
      "The agent resolves the independently named employee but does not attempt a Call Transfer because call_type is web_call.",
      "Before using callback fallback, the agent does not promise or announce that it will transfer or connect the caller.",
      "The agent uses the centralized callback path and never speaks the employee transfer destination.",
      "The agent accepts Tuesday, August 11, 2026 at 11:00 AM Mountain as the next-business-day callback and does not move it to August 12.",
      ...COMMON_METRICS,
    ],
    toolResults: {
      lookup_active_employee: successfulResult("found", {
        employee_name: "Adeola",
        transfer_destination: "+18085550109",
      }),
      schedule_callback: successfulResult("scheduled"),
    },
    requiredTools: ["lookup_active_employee", "schedule_callback"],
    forbiddenTools: ["create_support_case"],
  },
  {
    slug: "explicit-dnc-different-number",
    title: "Explicit DNC request for a different number",
    userPrompt: `
## Identity
You are calling from +1 808-555-0101.

## Goal
Immediately ask GenStone to stop calling a different number: +1 808-555-0102. Correct the agent if it offers the caller number, confirm +1 808-555-0102, and explicitly confirm the do-not-call request.

## Behavior
End after the agent confirms the request was handled.
`.trim(),
    metrics: [
      "The agent suppresses only +1 808-555-0102 after explicit confirmation and does not suppress the caller number.",
      "The agent invokes suppress_phone_number once and closes without creating CRM, support, or callback work.",
      ...COMMON_METRICS,
    ],
    toolResults: {
      suppress_phone_number: successfulResult("suppressed"),
    },
  },
  {
    slug: "order-tool-error-support",
    title: "Order lookup error produces Zendesk follow-up",
    userPrompt: `
## Identity
Your name is Test Caller, your phone is +1 808-555-0101, and you are asking about an existing order.

## Goal
Confirm the caller name and phone. If asked for one alternate identifier, provide order number 5550101. The order lookup fails. Explain that you still need help finding the order, identify yourself as the customer in the United States, and confirm the factual summary.

## Behavior
Say there is no earlier support matter. End after the agent states the response expectation. Do not accept or propose a callback time.
`.trim(),
    metrics: [
      "The agent never reveals or invents order status, items, email, shipment, or an ETA after the mocked lookup error.",
      "The agent invokes create_support_case and never offers or invokes schedule_callback for the existing order.",
      "The agent says customer service will respond by the end of the next business day without saying case or ticket.",
      ...COMMON_METRICS,
    ],
    toolResults: {
      lookup_contact: successfulResult("found", {
        contact_token: "synthetic_contact_token",
      }),
      lookup_order: failedResult(),
      create_support_case: successfulResult("created"),
    },
  },
];

export function buildRetellSimulationDefinitions(
  target: RetellSimulationTarget,
): TestCreateTestCaseDefinitionParams[] {
  return SCENARIOS.map((scenario) => ({
    name: buildTestName(scenario),
    response_engine: {
      type: "conversation-flow",
      conversation_flow_id: target.conversationFlowId,
      version: target.conversationFlowVersion,
    },
    user_prompt: scenario.userPrompt,
    llm_model: "gpt-5.2",
    metrics: scenario.metrics,
    dynamic_variables: {
      call_id: `simulation_${scenario.slug}`,
      call_type: "web_call",
      user_number: "+18085550101",
    },
    tool_mocks: buildToolMocks(scenario.toolResults),
  }));
}

export function validateRetellSimulationToolCalls(
  testName: string,
  transcript: unknown,
): string[] {
  const scenario = SCENARIOS.find(
    (candidate) => buildTestName(candidate) === testName,
  );

  if (!scenario) {
    return [`No local scenario matches ${testName}.`];
  }

  const invokedTools = readInvokedToolNames(transcript);
  const errors: string[] = [];

  for (const toolName of scenario.requiredTools ?? []) {
    if (!invokedTools.has(toolName)) {
      errors.push(`Required tool ${toolName} was not invoked.`);
    }
  }

  for (const toolName of scenario.forbiddenTools ?? []) {
    if (invokedTools.has(toolName)) {
      errors.push(`Forbidden tool ${toolName} was invoked.`);
    }
  }

  return errors;
}

function buildTestName(scenario: SimulationScenario): string {
  return `GenStone ${RETELL_SIMULATION_RELEASE} — ${scenario.title}`;
}

function readInvokedToolNames(transcript: unknown): Set<string> {
  if (!Array.isArray(transcript)) {
    return new Set();
  }

  const names = transcript.flatMap((message) => {
    if (!message || typeof message !== "object") {
      return [];
    }

    const record = message as Record<string, unknown>;
    if (record.role !== "tool_call_invocation" || typeof record.name !== "string") {
      return [];
    }

    return [record.name];
  });

  return new Set(names);
}

export const RETELL_SIMULATION_TOOL_COUNT = RETELL_TOOL_NAMES.length;
