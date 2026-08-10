import type { NormalizedOrderCreated } from "../../schemas/order-created";
import type { RetellPromptAgent } from "../../schemas/test-web-call";
import type { ReviewAgentEnv } from "../../types/env";
import { createLogger } from "../../lib/observability/logger";

export async function createRetellCall(
  env: ReviewAgentEnv,
  order: NormalizedOrderCreated,
): Promise<{ callId: string; response: unknown }> {
  const apiKey = requireEnv(env.RETELL_API_KEY_GENSTEEL, "RETELL_API_KEY_GENSTEEL");
  const promptAgent: RetellPromptAgent = "conversation_flow";
  const agentId = resolveRetellAgentId(env, promptAgent);
  const fromNumber = requireEnv(
    env.RETELL_FROM_NUMBER_GENSTEEL,
    "RETELL_FROM_NUMBER_GENSTEEL",
  );
  const baseUrl = env.RETELL_API_BASE_URL ?? "https://api.retellai.com";
  const logger = createLogger({
    minLevel: env.ENVIRONMENT === "production" ? "info" : "debug",
    context: {
      provider: "retell",
      action: "create-phone-call",
      orderId: order.orderId,
    },
  });

  logger.info("Creating Retell phone call", {
    hasCustomerPhone: Boolean(order.customerPhone),
    orderNumber: order.orderNumber,
    promptAgent,
  });

  const response = await fetch(`${baseUrl}/v2/create-phone-call`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from_number: fromNumber,
      to_number: order.customerPhone,
      override_agent_id: agentId,
      retell_llm_dynamic_variables: buildDynamicVariables(order),
      metadata: buildMetadata(order, promptAgent),
    }),
  });

  const responseBody = await readJsonResponse(response);
  if (!response.ok) {
    logger.error("Retell phone call creation failed", { status: response.status });
    throw new Error(`Retell create call failed with ${response.status}.`);
  }

  const callId = extractCallId(responseBody);
  if (!callId) {
    throw new Error("Retell create call response did not include call_id.");
  }

  logger.info("Retell phone call created", { callId });

  return { callId, response: responseBody };
}

export async function createRetellWebCall(
  env: ReviewAgentEnv,
  order: NormalizedOrderCreated,
  options: { promptAgent?: RetellPromptAgent } = {},
): Promise<{ callId: string; accessToken: string; response: unknown }> {
  const apiKey = requireEnv(env.RETELL_API_KEY_GENSTEEL, "RETELL_API_KEY_GENSTEEL");
  const promptAgent = options.promptAgent ?? "conversation_flow";
  const agentId = resolveRetellAgentId(env, promptAgent);
  const baseUrl = env.RETELL_API_BASE_URL ?? "https://api.retellai.com";
  const logger = createLogger({
    minLevel: env.ENVIRONMENT === "production" ? "info" : "debug",
    context: {
      provider: "retell",
      action: "create-web-call",
      orderId: order.orderId,
    },
  });

  logger.info("Creating Retell web call", {
    orderNumber: order.orderNumber,
    customerEmail: order.customerEmail,
    promptAgent,
  });

  const response = await fetch(`${baseUrl}/v2/create-web-call`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      agent_id: agentId,
      retell_llm_dynamic_variables: buildDynamicVariables(order),
      metadata: buildTestWebCallMetadata(order, promptAgent),
    }),
  });

  const responseBody = await readJsonResponse(response);
  if (!response.ok) {
    logger.error("Retell web call creation failed", { status: response.status });
    throw new Error(`Retell create web call failed with ${response.status}.`);
  }

  const callId = extractString(responseBody, "call_id");
  if (!callId) {
    throw new Error("Retell create web call response did not include call_id.");
  }

  const accessToken = extractString(responseBody, "access_token");
  if (!accessToken) {
    throw new Error("Retell create web call response did not include access_token.");
  }

  logger.info("Retell web call created", { callId });

  return { callId, accessToken, response: responseBody };
}

function buildDynamicVariables(
  order: NormalizedOrderCreated,
): Record<string, string> {
  return {
    customer_name: order.customerName ?? "",
    order_id: order.sourceOrderId ?? order.orderId,
    building_description: order.buildingDescription ?? "",
    building_size: order.buildingSize ?? "",
    delivery_date: order.deliveryDate ?? "",
    employee_name: order.employeeName ?? "",
    employee_role: order.employeeRole ?? "",
    sales_rep_name: order.salesRepName ?? "",
    delivery_coordinator_name: order.deliveryCoordinatorName ?? "",
    project_coordinator_name: order.projectCoordinatorName ?? "",
    file_team_summary: buildFileTeamSummary(order),
    customer_email: order.customerEmail ?? "",
  };
}

function buildFileTeamSummary(order: NormalizedOrderCreated): string {
  const salesRep = getFirstName(order.salesRepName);
  const deliveryCoordinator = getFirstName(order.deliveryCoordinatorName);
  const projectCoordinator = getFirstName(order.projectCoordinatorName);
  const parts: string[] = [];

  if (salesRep) {
    parts.push(`you worked with ${salesRep} on the sales side`);
  }

  if (deliveryCoordinator && projectCoordinator) {
    parts.push(`${deliveryCoordinator} and ${projectCoordinator} on delivery and project coordination`);
  } else if (deliveryCoordinator) {
    parts.push(`${deliveryCoordinator} on delivery coordination`);
  } else if (projectCoordinator) {
    parts.push(`${projectCoordinator} on project coordination`);
  }

  return joinNaturalList(parts);
}

function getFirstName(name: string | undefined): string | undefined {
  return name?.trim().split(/\s+/u)[0];
}

function joinNaturalList(parts: string[]): string {
  if (parts.length === 0) {
    return "";
  }

  if (parts.length === 1) {
    return parts[0] ?? "";
  }

  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function buildTestWebCallMetadata(
  order: NormalizedOrderCreated,
  promptAgent: RetellPromptAgent,
): Record<string, string> {
  return {
    gensteel_test_call: "true",
    test_call_type: "web_call",
    execution_mode: "test",
    prompt_agent: promptAgent,
    order_id: order.orderId,
    test_run_id: order.testRunId ?? order.orderId,
    source_order_id: order.sourceOrderId ?? "",
    source_order_number: order.sourceOrderNumber ?? order.orderNumber ?? "",
    customer_email: order.customerEmail ?? "",
    test_recipient_email: order.testOverrides?.recipientEmail ?? "",
    test_recipient_name: order.testOverrides?.recipientName ?? "",
    test_escalation_email: order.testOverrides?.escalationEmail ?? "",
    test_callback_delay_seconds: String(order.testOverrides?.callbackDelaySeconds ?? ""),
    salesforce_account_id: order.salesforceAccountId ?? "",
  };
}

function buildMetadata(
  order: NormalizedOrderCreated,
  promptAgent: RetellPromptAgent,
): Record<string, string> {
  return {
    execution_mode: order.executionMode ?? "production",
    prompt_agent: promptAgent,
    order_id: order.orderId,
    customer_id: order.customerId ?? "",
    salesforce_account_id: order.salesforceAccountId ?? "",
  };
}

function resolveRetellAgentId(
  env: ReviewAgentEnv,
  promptAgent: RetellPromptAgent,
): string {
  if (promptAgent === "multi_prompt") {
    return requireEnv(env.RETELL_MULTI_PROMPT_AGENT_ID, "RETELL_MULTI_PROMPT_AGENT_ID");
  }

  return requireEnv(env.RETELL_AGENT_ID, "RETELL_AGENT_ID");
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function extractCallId(value: unknown): string | undefined {
  return extractString(value, "call_id");
}

function extractString(value: unknown, fieldName: string): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const fieldValue = (value as Record<string, unknown>)[fieldName];
  return typeof fieldValue === "string" ? fieldValue : undefined;
}

function requireEnv(value: string | undefined, name: string): string {
  if (value) {
    return value;
  }

  throw new Error(`Missing required environment variable: ${name}.`);
}
