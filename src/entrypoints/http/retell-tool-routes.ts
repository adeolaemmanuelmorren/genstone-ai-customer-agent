import type { Hono } from "hono";
import type { z } from "zod";
import { sha256Hex } from "../../lib/crypto";
import { createLogger } from "../../lib/observability/logger";
import {
  callbackScheduleSchema,
  contactLookupSchema,
  dncSuppressSchema,
  employeeLookupSchema,
  orderLookupSchema,
  prospectFollowUpSchema,
  shipmentEmailSchema,
  supportCaseCreateSchema,
  verifiedOrderSchema,
} from "../../schemas/retell-tools";
import { getCompanyId, withDatabase, type Queryable } from "../../services/persistence/db";
import { recordOutcome } from "../../services/persistence/outcomes-repository";
import {
  beginToolExecution,
  completeToolExecution,
  failToolExecution,
} from "../../services/persistence/tool-executions-repository";
import { verifyRetellSignature } from "../../services/retell/signature";
import {
  emailShipmentTool,
  lookupContactTool,
  lookupEmployeeTool,
  lookupOrderTool,
  lookupShipmentTool,
  scheduleCallbackTool,
  sendProspectFollowUpTool,
  suppressDncTool,
  createSupportCaseTool,
} from "../../services/tools/retell-tools";
import type { CustomerAgentEnv } from "../../types/env";
import { failureResult, successResult, type ToolResult } from "../../types/tool-result";
import { getLogLevel, requireServiceBearer, type AppContext } from "./http-utils";

type ToolInput = {
  call_id: string;
  idempotency_key?: string;
};

type ToolHandler<TInput extends ToolInput> = (
  env: CustomerAgentEnv,
  db: Queryable,
  input: TInput,
) => Promise<ToolResult>;

interface ToolRegistration<TInput extends ToolInput> {
  route: string;
  toolName: string;
  schema: z.ZodType<TInput>;
  handler: ToolHandler<TInput>;
  outcome?: {
    type: string;
    provider: string;
  };
}

export function registerRetellToolRoutes(
  app: Hono<{ Bindings: CustomerAgentEnv }>,
): void {
  registerTool(app, {
    route: "/v1/retell/tools/contacts/lookup",
    toolName: "lookup_contact",
    schema: contactLookupSchema,
    handler: lookupContactTool,
  });
  registerTool(app, {
    route: "/v1/retell/tools/employees/lookup",
    toolName: "lookup_active_employee",
    schema: employeeLookupSchema,
    handler: lookupEmployeeTool,
  });
  registerTool(app, {
    route: "/v1/retell/tools/orders/lookup",
    toolName: "lookup_order",
    schema: orderLookupSchema,
    handler: lookupOrderTool,
  });
  registerTool(app, {
    route: "/v1/retell/tools/shipments/lookup",
    toolName: "lookup_shipment",
    schema: verifiedOrderSchema,
    handler: lookupShipmentTool,
  });
  registerTool(app, {
    route: "/v1/retell/tools/callbacks/schedule",
    toolName: "schedule_callback",
    schema: callbackScheduleSchema,
    handler: scheduleCallbackTool,
    outcome: { type: "callback", provider: "customerio" },
  });
  registerTool(app, {
    route: "/v1/retell/tools/prospects/follow-up",
    toolName: "send_prospect_follow_up",
    schema: prospectFollowUpSchema,
    handler: sendProspectFollowUpTool,
    outcome: { type: "prospect_follow_up", provider: "customerio" },
  });
  registerTool(app, {
    route: "/v1/retell/tools/shipments/email",
    toolName: "email_shipment_tracking",
    schema: shipmentEmailSchema,
    handler: emailShipmentTool,
    outcome: { type: "shipment_email", provider: "customerio" },
  });
  registerTool(app, {
    route: "/v1/retell/tools/support/cases",
    toolName: "create_support_case",
    schema: supportCaseCreateSchema,
    handler: createSupportCaseTool,
    outcome: { type: "tracked_support", provider: "zendesk" },
  });
  registerTool(app, {
    route: "/v1/retell/tools/dnc/suppress",
    toolName: "suppress_phone_number",
    schema: dncSuppressSchema,
    handler: suppressDncTool,
    outcome: { type: "do_not_call", provider: "five9" },
  });
}

function registerTool<TInput extends ToolInput>(
  app: Hono<{ Bindings: CustomerAgentEnv }>,
  registration: ToolRegistration<TInput>,
): void {
  app.post(registration.route, async (c) => {
    const rawBody = await c.req.text();
    const authError = await requireToolAuthentication(c, rawBody);
    if (authError) {
      return authError;
    }

    const parsedJson = parseJson(rawBody);
    const parsedInput = registration.schema.safeParse(parsedJson);
    if (!parsedInput.success) {
      return c.json(
        failureResult("validation_failed", "The tool input could not be validated."),
      );
    }

    if (!hasValidIdempotencyScope(parsedInput.data)) {
      return c.json(
        failureResult("validation_failed", "The idempotency key is not valid for this call."),
      );
    }

    const logger = createLogger({
      minLevel: getLogLevel(c),
      context: {
        entrypoint: "http",
        route: registration.route,
        callId: parsedInput.data.call_id,
      },
    });
    const requestSha256 = await sha256Hex(stableJson(parsedInput.data));

    return withDatabase(c.env, async (db) => {
      const execution = await beginToolExecution(db, {
        companyId: getCompanyId(c.env),
        callId: parsedInput.data.call_id,
        toolName: registration.toolName,
        idempotencyKey: parsedInput.data.idempotency_key,
        requestSha256,
      });

      if (!execution.shouldExecute) {
        return c.json(readExistingExecution(execution));
      }

      try {
        const result = await registration.handler(c.env, db, parsedInput.data);
        const externalReference = readExternalReference(result);
        await completeToolExecution(db, execution.id, result, externalReference);

        if (registration.outcome) {
          try {
            await recordOutcome(db, {
              companyId: getCompanyId(c.env),
              callId: parsedInput.data.call_id,
              outcomeType: registration.outcome.type,
              outcomeStatus: result.result_code,
              toolExecutionId: execution.id,
              provider: registration.outcome.provider,
              externalReference,
              safeSummary: result.safe_summary,
            });
          } catch (error) {
            logger.warn("Retell tool outcome could not be recorded", {
              toolName: registration.toolName,
              errorType: error instanceof Error ? error.name : "unknown",
              errorMessage: error instanceof Error ? error.message : "Unknown error",
            });
          }
        }

        logger.info("Retell tool completed", {
          toolName: registration.toolName,
          resultCode: result.result_code,
        });
        return c.json(result);
      } catch (error) {
        const result = failureResult("error", "The requested action could not be completed.");
        await failToolExecution(db, execution.id, result);
        logger.error("Retell tool failed", {
          toolName: registration.toolName,
          errorType: error instanceof Error ? error.name : "unknown",
          errorMessage: error instanceof Error ? error.message : "Unknown error",
        });
        return c.json(result);
      }
    });
  });
}

async function requireToolAuthentication(
  c: AppContext,
  rawBody: string,
): Promise<Response | null> {
  const bearerError = requireServiceBearer(c);
  if (bearerError) {
    return bearerError;
  }

  const validSignature = await verifyRetellSignature({
    rawBody,
    secret: c.env.RETELL_WEBHOOK_API_KEY_GENSTONE,
    signature: c.req.header("x-retell-signature"),
  });
  if (!validSignature) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return null;
}

export function readExistingExecution(execution: {
  executionStatus: string;
  resultCode?: string;
  safeSummary?: string;
  data?: Record<string, unknown>;
  executionOk?: boolean;
}): ToolResult {
  if (execution.executionStatus === "completed") {
    return {
      ok: execution.executionOk ?? false,
      result_code: execution.resultCode ?? "error",
      safe_summary: execution.safeSummary ?? "The earlier result is unavailable.",
      ...(execution.data ? { data: execution.data } : {}),
    };
  }

  if (execution.executionStatus === "failed") {
    return failureResult(
      execution.resultCode ?? "error",
      execution.safeSummary ?? "The earlier request could not be completed.",
    );
  }

  return failureResult("error", "This request is already being processed.");
}

export function hasValidIdempotencyScope(input: ToolInput): boolean {
  if (!input.idempotency_key) {
    return true;
  }

  return input.idempotency_key.startsWith(`${input.call_id}:`);
}

function readExternalReference(result: ToolResult): string | undefined {
  const value = result.data?.external_reference;
  return typeof value === "string" && value.trim() ? value : undefined;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entryValue]) =>
      `${JSON.stringify(key)}:${stableJson(entryValue)}`).join(",")}}`;
  }

  return JSON.stringify(value) ?? "null";
}
