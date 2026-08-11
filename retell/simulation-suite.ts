import type { TestCreateTestCaseDefinitionParams } from "retell-sdk/resources/tests";

export const RETELL_SIMULATION_RELEASE = "v35";

export interface RetellSimulationTarget {
  conversationFlowId: string;
  conversationFlowVersion: number;
}

const RETELL_TOOL_NAMES = [
  "lookup_contact",
  "lookup_contact_by_email",
  "lookup_order",
  "lookup_order_alternate",
  "lookup_next_order",
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
Your name is Test Caller. You are a prospective GenStone customer.

## Goal
Say this is a new project. Ask where you can upload a photo to see GenStone on your home. You only need the approved Visualizer page and accepted image guidance. After receiving it, say you have no other questions and end politely.

## Behavior
Give your name when asked. Do not ask for a callback, quote, price, or turnaround time.
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
Confirm the caller number when asked, explain the project once, and end after the agent confirms the team follow-up. Do not repeat contact details or request a formal project-summary read-back.
`.trim(),
    metrics: [
      "The agent uses contact lookup, receives not_found, and then invokes send_prospect_follow_up once the project request is clear without repeating contact details or requiring a formal read-back.",
      "The agent says the information was sent to the team without mentioning Salesforce, Customer.io, an internal recipient, Lead, or Contact creation.",
      ...COMMON_METRICS,
    ],
    toolResults: {
      lookup_contact: successfulResult("not_found"),
      lookup_contact_by_email: successfulResult("not_found"),
      send_prospect_follow_up: successfulResult("sent"),
    },
  },
  {
    slug: "shipment-spoken-email-declined",
    title: "Verified shipment answer with email declined",
    userPrompt: `
## Identity
Your name is Test Caller. Your phone is +1 808-555-0101. Your order contains Kenai Stacked Stone panels.

## Goal
Say this is an existing order and ask for tracking. Confirm the phone and order items. After the agent speaks a concise shipment summary and offers an email, decline the email.

## Behavior
Give your name when asked. Answer the item confirmation directly. Do not provide an email. End after the verified shipment answer.
`.trim(),
    metrics: [
      "The agent requires order-item confirmation before speaking shipment details and does not ask for an email when the email offer is declined.",
      "The agent speaks the concise mocked shipment summary without reading any tracking number aloud and does not invoke email_shipment_tracking after the caller declines.",
      ...COMMON_METRICS,
    ],
    toolResults: {
      lookup_contact: successfulResult("found", {
        contact_token: "synthetic_contact_token",
      }),
      lookup_order: successfulResult("found", {
        order_candidate_token: "synthetic_order_token",
        order_item_summary: "Kenai Stacked Stone panels",
        order_status_summary: "Processing",
      }),
      lookup_shipment: successfulResult(
        "found",
        {},
        "Your order shipped on August 7, 2026 with UPS. There is one tracking number for the shipment. I don't have a live delivery estimate.",
      ),
    },
    requiredTools: ["lookup_contact", "lookup_order", "lookup_shipment"],
    forbiddenTools: ["email_shipment_tracking", "create_support_case", "schedule_callback"],
  },
  {
    slug: "replacement-phone-shipment",
    title: "Replacement phone reaches shipment without repetition",
    userPrompt: `
## Identity
The caller ID +1 808-555-0101 is not the number on your order. Your name is Test Caller. The order phone is +1 303-555-0100. Your order contains Kenai Stacked Stone panels.

## Goal
Say this is an existing order and that you want to know when the shipment will arrive. When asked about the caller ID, say it is a different phone number and provide +1 303-555-0100. Confirm the order items. Decline the shipment email.

## Behavior
Provide the replacement phone exactly once. After that, never mention it again and never ask the agent to confirm it. If the agent requests the phone again, say you already provided it without repeating the digits. Do not volunteer an order number or tracking number.
Once the agent gives the stored shipment summary and says no live ETA is available, accept that as the answer, decline shipment email, say you have no more questions, and end politely. Do not ask for a rough transit estimate, a supervisor, a shipping team, or any other follow-up.
`.trim(),
    metrics: [
      "The agent may confirm the incoming caller-ID number once before the caller rejects it. After the caller provides the replacement phone, the agent never speaks or reconfirms that replacement number. Only the order-item confirmation is expected.",
      "After the mocked order is found, the agent does not request an order number or ask whether the caller has a tracking number.",
      "The agent routes the already-stated arrival question directly to shipment lookup after order verification.",
      "The agent never speaks asterisks, JSON, field names, or software provider names.",
      ...COMMON_METRICS,
    ],
    toolResults: {
      lookup_contact: successfulResult("found", {
        contact_token: "synthetic_contact_token",
      }),
      lookup_order: successfulResult("found", {
        order_candidate_token: "synthetic_order_token",
        order_item_summary: "Kenai Stacked Stone panels",
        order_status_summary: "Processing",
      }),
      lookup_shipment: successfulResult(
        "found",
        {},
        "Your order shipped on August 7, 2026 with UPS. There is one tracking number for the shipment. I don't have a live delivery estimate.",
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
Your name is Test Caller. Your phone is +1 808-555-0101. Your order contains Kenai Stacked Stone panels.

## Goal
Say this is an existing order and ask for tracking. Confirm the phone and order items. Accept the email offer, provide alternate.destination@example.com, and confirm that complete address.

## Behavior
Give your name when asked. Answer the item confirmation directly. Confirm the email request when offered, provide the destination once, and confirm it when read back. End after the agent confirms the send.
`.trim(),
    metrics: [
      "The transcript contains tool invocations named lookup_shipment and email_shipment_tracking after order verification and explicit email acceptance.",
      "The transcript does not contain create_support_case or schedule_callback.",
      "The agent accepts the caller's alternate email, reads the complete address once for confirmation, and sends only after confirmation.",
      "The agent does not read any tracking number aloud.",
      ...COMMON_METRICS,
    ],
    toolResults: {
      lookup_contact: successfulResult("found", {
        contact_token: "synthetic_contact_token",
      }),
      lookup_order: successfulResult("found", {
        order_candidate_token: "synthetic_order_token",
        order_item_summary: "Kenai Stacked Stone panels",
        order_status_summary: "Processing",
      }),
      lookup_shipment: successfulResult(
        "found",
        {},
        "Your order shipped on August 7, 2026 with UPS. There is one tracking number for the shipment. I don't have a live delivery estimate.",
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
Your name is Test Caller, your phone is +1 808-555-0101, and your email is test.caller@example.com. Your order contains Kenai Stacked Stone panels.

## Goal
Say this is an existing order. Confirm the order. Initially say only that the order arrived broken. After the agent asks a relevant follow-up question, explain that two Kenai panels arrived cracked through the center and cannot be installed.

## Behavior
Do not volunteer the detailed damage description before the agent asks. Confirm your email when asked, but do not repeat other contact details, country, or caller classification. After the agent says the details were sent internally and gives the response expectation, ask: "What are you going to email me?" The correct answer is that no customer email was sent; the details were sent internally to customer service. After that clarification, say you have no more questions and end.
`.trim(),
    metrics: [
      "After the caller gives only the vague statement that the order arrived broken, the agent asks a useful natural follow-up question before invoking create_support_case; it does not use a fixed questionnaire or require a formal summary read-back.",
      "The support summary sent to create_support_case includes the caller's later details that two Kenai panels were cracked through the center and cannot be installed.",
      "The agent does not ask for or discuss photos unless the caller independently raises them.",
      "The agent says the details were sent internally and customer service will respond by the end of the next business day without reciting the caller's phone or email and without saying Zendesk, case, or ticket.",
      "When asked what will be emailed, the agent clearly says no customer email was sent and remains in the support conversation until the caller has no further questions.",
      ...COMMON_METRICS,
    ],
    toolResults: {
      lookup_contact: successfulResult("found", {
        contact_token: "synthetic_contact_token",
      }),
      lookup_order: successfulResult("found", {
        order_candidate_token: "synthetic_order_token",
        order_item_summary: "Kenai Stacked Stone panels",
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
Your name is Test Caller, your callback phone is +1 808-555-0101, and your email is test.caller@example.com.

## Goal
Say this is a new project, then ask to speak with a person without naming an employee or department. Accept a callback for Tuesday, August 11, 2026 at 10:00 AM Mountain time about general project help.

## Behavior
Approve the callback subject, date, Mountain time, and use of the already-confirmed number once. End after the callback is accepted.
`.trim(),
    metrics: [
      "The agent does not ask the caller to choose a department or employee and uses the centralized callback path.",
      "The agent invokes schedule_callback only after the caller approves the callback subject, date, Mountain time, and use of the already-confirmed number.",
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
      "The agent does not attempt a Call Transfer because call_type is web_call.",
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
    requiredTools: ["schedule_callback"],
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
Your name is Test Caller, your phone is +1 808-555-0101, your email is test.caller@example.com, and you are asking about an existing order.

## Goal
Give your name when asked and confirm the caller number once. The order lookup fails. Explain once that you still need help finding the order.

## Behavior
Do not provide an alternate phone or order number, repeat contact details, classify yourself, or confirm a formal issue read-back. Confirm your email only when the support path needs it. End after the agent states the response expectation. Do not accept or propose a callback time.
`.trim(),
    metrics: [
      "The agent never reveals or invents order status, items, email, shipment, or an ETA after the mocked lookup error.",
      "The agent does not ask for another phone, order number, ZIP code, address, or other order-lookup detail after the mocked technical lookup error; it asks only for the email required by Zendesk.",
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
    llm_model: "gpt-5.5",
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
