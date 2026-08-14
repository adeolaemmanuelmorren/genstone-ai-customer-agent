import type { TestCreateTestCaseDefinitionParams } from "retell-sdk/resources/tests";

export const RETELL_SIMULATION_RELEASE = "v53-owner-demo";

export interface RetellSimulationTarget {
  conversationFlowId: string;
  conversationFlowVersion: number;
}

const RETELL_TOOL_NAMES = [
  "lookup_order",
  "next_order_candidate",
  "check_business_hours",
  "lookup_shipment",
  "email_shipment_tracking",
  "lookup_contact_by_phone",
  "lookup_contact_by_email",
  "record_support_follow_up",
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
  callType: "phone_call" | "web_call";
  userNumber: string;
  userPrompt: string;
  metrics: string[];
  toolResults: Partial<Record<RetellToolName, ToolResult>>;
  requiredTools: RetellToolName[];
  forbiddenTools?: RetellToolName[];
};

const COMMON_METRICS = [
  "The agent never exposes provider names, internal identifiers, credentials, raw errors, or direct transfer numbers.",
  "The agent does not claim that an action succeeded unless the corresponding mocked tool returned a successful result.",
];

const FOUND_ORDER = successfulResult("found", {
  order_candidate_token: "synthetic-order-candidate",
  order_type_summary: "an order",
  order_item_summary: "four Northern Slate Corner Ledger units",
  order_status_summary: "completed",
});

const SCENARIOS: SimulationScenario[] = [
  {
    slug: "travis-new-project-transfer",
    title: "Travis 1 — New project sales handoff",
    callType: "phone_call",
    userNumber: "+13035550157",
    userPrompt: `
You are reproducing Travis's first test call.

Give your name as Travis. Say this is a new project. If the agent asks what you need before offering a transfer, say "everything" and then ask to speak with the sales team. Agree to a project-coordinator transfer when offered.

Do not ask for product guidance unless the agent incorrectly starts listing categories. Do not request a callback. End when the transfer is attempted.
`.trim(),
    metrics: [
      "After the caller says this is a new project, the agent checks business hours and offers the project-coordinator transfer without presenting a pricing, measurement, color, visualizer, or installation menu.",
      "The agent does not give a visualizer monologue or spell out JPG, PNG, or GIF.",
      "After permission, the agent attempts the project-coordinator transfer rather than refusing the sales-team request or collecting callback details.",
      ...COMMON_METRICS,
    ],
    toolResults: {
      check_business_hours: successfulResult("open"),
    },
    requiredTools: ["check_business_hours"],
    forbiddenTools: ["schedule_callback", "lookup_order", "record_support_follow_up"],
  },
  {
    slug: "travis-alternate-phone-support-continuation",
    title: "Travis 2 — Spoken phone, damage, and second question",
    callType: "phone_call",
    userNumber: "+13035550157",
    userPrompt: `
You are reproducing Travis's second test call.

Give your name as Brian and say this is an existing order. Say the caller-ID number is not the order number. Supply the replacement phone as "eight six five four five five ninety eight oh one." If the agent repeats or confirms the interpreted number, confirm it when correct. Confirm that the returned Northern Slate order is yours.

Then say two units arrived broken. The business is closed in this demo, so cooperate with customer-service follow-up. When asked for email, give brian at saint dot us and confirm brian@saint.us. After the agent records the follow-up and asks if you need anything else, ask: "Can you tell me who my project coordinator is on the order?" Do not let the agent end at that point. After it responds or offers the appropriate follow-up, say you have no more questions.
`.trim(),
    metrics: [
      "The agent naturally confirms the caller-supplied replacement phone before searching and never refuses to repeat it for security reasons.",
      "After the order is confirmed, the agent responds empathetically to the broken units without repeating the order items.",
      "Because live service is closed, the agent obtains only missing follow-up information, invokes record_support_follow_up, and describes the result without saying case, ticket, Zendesk, or a reference number.",
      "The agent asks whether anything else is needed and does not end when the caller asks the second project-coordinator question.",
      ...COMMON_METRICS,
    ],
    toolResults: {
      lookup_order: FOUND_ORDER,
      check_business_hours: successfulResult("closed"),
      lookup_contact_by_phone: successfulResult("found", {
        contact_token: "synthetic-contact",
      }),
      lookup_contact_by_email: successfulResult("found", {
        contact_token: "synthetic-contact",
      }),
      record_support_follow_up: successfulResult("created"),
    },
    requiredTools: ["lookup_order", "check_business_hours", "record_support_follow_up"],
    forbiddenTools: ["schedule_callback", "email_shipment_tracking"],
  },
  {
    slug: "travis-email-shipment-continuation",
    title: "Travis 3 — Email lookup, shipment, and interrupted close",
    callType: "phone_call",
    userNumber: "+13035550157",
    userPrompt: `
You are reproducing Travis's third test call.

Give your name as Travis and say this is an existing order. Say the caller-ID phone is not correct and that you have the order email instead. Give travis@example.com and confirm it if asked. Confirm that the returned Northern Slate order is yours.

Ask for the tracking status and when the shipment will arrive. Decline the offer to email tracking details. When the agent asks whether anything else is needed, say: "Wait, one more thing. What carrier was that?" After the agent answers without repeating the order verification, say you have no more questions.
`.trim(),
    metrics: [
      "The agent accepts the caller's email as the order identifier and invokes lookup_order without insisting on a phone or order number.",
      "The agent gives the concise mocked shipment summary without reading a tracking number or inventing an arrival estimate.",
      "After the caller declines shipment email, the agent asks whether anything else is needed instead of saying goodbye.",
      "The agent handles the carrier follow-up using the already verified order and ends only after the caller says there are no more questions.",
      ...COMMON_METRICS,
    ],
    toolResults: {
      lookup_order: FOUND_ORDER,
      lookup_shipment: successfulResult(
        "found",
        { carrier: "FedEx" },
        "Your order shipped on August 11, 2026 with FedEx. There are two tracking numbers for the shipment. I don't have a live delivery estimate.",
      ),
    },
    requiredTools: ["lookup_order", "lookup_shipment"],
    forbiddenTools: [
      "email_shipment_tracking",
      "record_support_follow_up",
      "schedule_callback",
    ],
  },
];

export const RETELL_SIMULATION_TOOL_COUNT = RETELL_TOOL_NAMES.length;

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
      call_type: scenario.callType,
      user_number: scenario.userNumber,
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

  for (const toolName of scenario.requiredTools) {
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

function buildToolMocks(
  overrides: Partial<Record<RetellToolName, ToolResult>>,
): ToolMocks {
  return RETELL_TOOL_NAMES.map((toolName) => ({
    tool_name: toolName,
    input_match_rule: { type: "any" as const },
    output: JSON.stringify(overrides[toolName] ?? failedResult()),
  }));
}

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
