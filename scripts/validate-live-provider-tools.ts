import { createHmac, randomUUID } from "node:crypto";

import { getZendeskCase } from "../src/services/zendesk/client.js";
import type { CustomerAgentEnv } from "../src/types/env.js";
import type { ToolResult } from "../src/types/tool-result.js";

const WORKER_BASE_URL = "https://genstone-ai-customer-agent.travis-m.workers.dev";

type Options = {
  contactPairOnly: boolean;
  email: string;
  employeeName: string;
  phone: string;
  executeAuthorizedWrites: boolean;
  five9Only: boolean;
};

type SafeCheck = {
  check: string;
  ok: boolean;
  result_code: string;
  safe_summary: string;
};

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

function parseOptions(): Options {
  const email = readOption("--email")?.trim();
  const phone = readOption("--phone")?.trim();
  const employeeName = readOption("--employee")?.trim() || "Adeola";

  if (!email || !phone) {
    throw new Error("Usage requires --email and --phone.");
  }

  return {
    contactPairOnly: process.argv.includes("--contact-pair-only"),
    email,
    phone,
    employeeName,
    executeAuthorizedWrites: process.argv.includes("--execute-authorized-writes"),
    five9Only: process.argv.includes("--five9-only"),
  };
}

function createSignature(rawBody: string, secret: string): string {
  const timestamp = String(Date.now());
  const digest = createHmac("sha256", secret)
    .update(`${rawBody}${timestamp}`)
    .digest("hex");

  return `v=${timestamp},d=${digest}`;
}

async function callTool(
  route: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const workerApiKey = requireEnvironmentVariable(
    "GENSTONE_AI_CUSTOMER_AGENT_WORKER_API_KEY",
  );
  const retellWebhookSecret = requireEnvironmentVariable(
    "RETELL_WEBHOOK_API_KEY_GENSTONE",
  );
  const rawBody = JSON.stringify(input);
  const response = await fetch(`${WORKER_BASE_URL}${route}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${workerApiKey}`,
      "Content-Type": "application/json",
      "X-Retell-Signature": createSignature(rawBody, retellWebhookSecret),
    },
    body: rawBody,
  });

  if (!response.ok) {
    throw new Error(`Tool request ${route} failed with HTTP ${response.status}.`);
  }

  return response.json<ToolResult>();
}

function safeCheck(check: string, result: ToolResult): SafeCheck {
  return {
    check,
    ok: result.ok,
    result_code: result.result_code,
    safe_summary: result.safe_summary,
  };
}

async function runReadChecks(options: Options, callId: string) {
  const checks: SafeCheck[] = [];

  const contactByEmail = await callTool("/v1/retell/tools/contacts/lookup", {
    call_id: callId,
    email: options.email,
  });
  checks.push(safeCheck("Salesforce contact lookup by email", contactByEmail));

  const contactByPhone = await callTool("/v1/retell/tools/contacts/lookup", {
    call_id: callId,
    phone: options.phone,
  });
  checks.push(safeCheck("Salesforce contact lookup by phone", contactByPhone));

  const contactByConfirmedPair = await callTool(
    "/v1/retell/tools/contacts/lookup",
    {
      call_id: callId,
      email: options.email,
      phone: options.phone,
    },
  );
  checks.push(safeCheck(
    "Salesforce contact lookup by confirmed phone and email",
    contactByConfirmedPair,
  ));

  const employee = await callTool("/v1/retell/tools/employees/lookup", {
    call_id: callId,
    employee_name: options.employeeName,
  });
  checks.push(safeCheck("Salesforce employee lookup", employee));

  const order = await callTool("/v1/retell/tools/orders/lookup", {
    call_id: callId,
    identifier_type: "caller_phone",
    identifier: options.phone,
  });
  checks.push(safeCheck("WooCommerce order lookup", order));

  checks.push({
    check: "WooCommerce shipment lookup",
    ok: false,
    result_code: "not_run",
    safe_summary:
      "Requires the caller to confirm both the candidate items and masked order email. The validation script does not forge those confirmations.",
  });

  return checks;
}

async function runAuthorizedWrites(options: Options, callId: string) {
  const checks: SafeCheck[] = [];
  const supportSummary =
    "AUTHORIZED QA TEST — verify GenStone Zendesk task creation for adeola@datastacklabs.com. No customer action is required.";
  const zendesk = await callTool("/v1/retell/tools/support/follow-up", {
    call_id: callId,
    idempotency_key: `${callId}:zendesk-authorized-qa`,
    primary_route: "existing_order",
    customer_name: "Adeola",
    customer_email: options.email,
    confirmed_phone: options.phone,
    caller_type: "customer",
    caller_country: "united_states",
    support_summary: supportSummary,
    communication_preference: "Email",
  });
  checks.push(safeCheck("Zendesk authorized test task", zendesk));

  const ticketId = zendesk.data?.external_reference;
  const createdTicket = typeof ticketId === "string"
    ? await getZendeskCase(process.env as unknown as CustomerAgentEnv, ticketId)
    : undefined;
  const createdTicketVisible = createdTicket?.subject.includes("AUTHORIZED QA TEST") ?? false;
  checks.push({
    check: "Zendesk test task read-back",
    ok: createdTicketVisible,
    result_code: createdTicketVisible ? "found" : "not_found",
    safe_summary: createdTicketVisible
      ? "The authorized QA ticket is visible in Zendesk search."
      : "The authorized QA ticket was not visible in the bounded Zendesk search.",
  });

  checks.push(await runFive9Write(options, callId));

  return checks;
}

async function runFive9Write(options: Options, callId: string): Promise<SafeCheck> {
  const dnc = await callTool("/v1/retell/tools/dnc/suppress", {
    call_id: callId,
    idempotency_key: `${callId}:five9-authorized-dnc`,
    dnc_phone: options.phone,
    dnc_confirmed: true,
  });

  return safeCheck("Five9 authorized DNC suppression", dnc);
}

async function main() {
  const options = parseOptions();
  const callId = `manual-qa-${new Date().toISOString().slice(0, 10)}-${randomUUID()}`;

  if (options.five9Only) {
    console.log(JSON.stringify({
      call_id: callId,
      checks: [await runFive9Write(options, callId)],
    }, null, 2));
    return;
  }

  if (options.contactPairOnly) {
    const result = await callTool("/v1/retell/tools/contacts/lookup", {
      call_id: callId,
      email: options.email,
      phone: options.phone,
    });
    console.log(JSON.stringify({
      call_id: callId,
      checks: [safeCheck(
        "Salesforce contact lookup by confirmed phone and email",
        result,
      )],
    }, null, 2));
    return;
  }

  const checks = await runReadChecks(options, callId);

  if (options.executeAuthorizedWrites) {
    checks.push(...await runAuthorizedWrites(options, callId));
  }

  console.log(JSON.stringify({ call_id: callId, checks }, null, 2));
}

await main();
