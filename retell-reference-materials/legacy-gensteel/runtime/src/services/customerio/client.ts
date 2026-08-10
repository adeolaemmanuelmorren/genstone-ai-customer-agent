import type { ReviewAgentEnv } from "../../types/env";
import type { SalesforceOrderLifecycleEventContext } from "../salesforce/client";
import type { ReviewOutcomeContext } from "../../workflows/review-outcome/review-outcome.types";
import { createLogger } from "../../lib/observability/logger";
import {
  recordOutcomeAction,
  type ReviewEmailTemplateSelection,
} from "../persistence/review-agent-repository";

export async function emitOrderDeliveredEvent(
  env: ReviewAgentEnv,
  context: SalesforceOrderLifecycleEventContext,
): Promise<void> {
  await emitOrderLifecycleEvent(env, {
    eventName: env.CUSTOMERIO_ORDER_DELIVERED_EVENT_NAME ?? "Order Delivered",
    context,
  });
}

export async function emitOrderLifecycleEvent(
  env: ReviewAgentEnv,
  params: {
    eventName: string;
    context: SalesforceOrderLifecycleEventContext;
  },
): Promise<void> {
  const siteId = requireEnv(env.CUSTOMERIO_TRACK_SITE_ID, "CUSTOMERIO_TRACK_SITE_ID");
  const apiKey = requireEnv(env.CUSTOMERIO_TRACK_API_KEY, "CUSTOMERIO_TRACK_API_KEY");
  const baseUrl = env.CUSTOMERIO_TRACK_API_BASE_URL ?? "https://track.customer.io";
  const customerEmail = resolveEventCustomerEmail(params.context);
  const logger = createLogger({
    minLevel: env.ENVIRONMENT === "production" ? "info" : "debug",
    context: {
      provider: "customerio",
      action: "emit-order-lifecycle-event",
      eventName: params.eventName,
      orderId: params.context.orderId,
      opportunityId: params.context.opportunityId,
    },
  });

  logger.info("Emitting Customer.io order lifecycle event", {
    customerEmail,
    hasCustomerId: Boolean(params.context.customerId),
    hasCustomerIoPersonId: Boolean(params.context.customerIoPersonId),
  });

  await identifyCustomerForLifecycleEvent(env, {
    baseUrl,
    authHeader: buildTrackAuthHeader(siteId, apiKey),
    context: params.context,
    customerEmail,
  });

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/v1/customers/${encodeURIComponent(customerEmail)}/events`, {
      method: "POST",
      headers: {
        Authorization: buildTrackAuthHeader(siteId, apiKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: params.eventName,
        data: {
          order_id: params.context.orderId,
          order_number: params.context.orderNumber ?? "",
          opportunity_id: params.context.opportunityId ?? "",
          order_email: params.context.customerEmail ?? "",
          customer_email: params.context.customerEmail ?? "",
          customer_id: params.context.customerId ?? "",
          customer_io_person_id: params.context.customerIoPersonId ?? "",
          salesforce_account_id: params.context.salesforceAccountId ?? "",
          delivery_date: params.context.deliveryDate ?? "",
          status: params.context.status ?? "",
        },
      }),
    });
  } catch (error) {
    logger.error("Customer.io order lifecycle event request failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  if (!response.ok) {
    logger.error("Customer.io order lifecycle event failed", { status: response.status });
    throw new Error(`Customer.io order lifecycle event failed with ${response.status}.`);
  }

  logger.info("Customer.io order lifecycle event emitted", { status: response.status });
}

async function identifyCustomerForLifecycleEvent(
  env: ReviewAgentEnv,
  params: {
    baseUrl: string;
    authHeader: string;
    context: SalesforceOrderLifecycleEventContext;
    customerEmail: string;
  },
): Promise<void> {
  const logger = createLogger({
    minLevel: env.ENVIRONMENT === "production" ? "info" : "debug",
    context: {
      provider: "customerio",
      action: "identify-order-lifecycle-customer",
      orderId: params.context.orderId,
      opportunityId: params.context.opportunityId,
    },
  });

  logger.info("Identifying Customer.io lifecycle customer by email", {
    customerEmail: params.customerEmail,
  });

  let response: Response;
  try {
    response = await fetch(
      `${params.baseUrl}/api/v1/customers/${encodeURIComponent(params.customerEmail)}`,
      {
        method: "PUT",
        headers: {
          Authorization: params.authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: params.customerEmail,
          customer_id: params.context.customerId ?? "",
          customer_io_person_id: params.context.customerIoPersonId ?? "",
          salesforce_account_id: params.context.salesforceAccountId ?? "",
          last_order_id: params.context.orderId,
          last_order_number: params.context.orderNumber ?? "",
          last_opportunity_id: params.context.opportunityId ?? "",
          last_delivery_date: params.context.deliveryDate ?? "",
          last_order_status: params.context.status ?? "",
        }),
      },
    );
  } catch (error) {
    logger.error("Customer.io identify request failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  if (!response.ok) {
    logger.error("Customer.io identify failed", { status: response.status });
    throw new Error(`Customer.io identify failed with ${response.status}.`);
  }

  logger.info("Customer.io lifecycle customer identified", { status: response.status });
}

export async function sendTransactionalReviewEmail(
  env: ReviewAgentEnv,
  params: {
    context: ReviewOutcomeContext;
    template: ReviewEmailTemplateSelection;
  },
): Promise<void> {
  const apiKey = requireEnv(env.CUSTOMERIO_APP_API_KEY, "CUSTOMERIO_APP_API_KEY");
  const baseUrl = env.CUSTOMERIO_TRANSACTIONAL_API_BASE_URL ?? "https://api.customer.io";
  const recipientEmail = resolveRecipientEmail(params.context);
  const logger = createLogger({
    minLevel: env.ENVIRONMENT === "production" ? "info" : "debug",
    context: {
      provider: "customerio",
      action: "send-transactional-review-email",
      callId: params.context.callId,
      orderId: params.context.orderId,
    },
  });

  logger.info("Sending Customer.io transactional review email", {
    templateKey: params.template.templateKey,
    reviewDestination: params.template.reviewDestination,
    recipientEmail,
    executionMode: params.context.executionMode ?? "production",
    testRunId: params.context.testRunId,
  });

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/send/email`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        transactional_message_id: params.template.customerioTransactionalMessageId,
        identifiers: buildIdentifiers(params.context, recipientEmail),
        to: recipientEmail,
        message_data: {
          customer_name: params.context.customerName ?? "",
          order_id: params.context.orderId ?? "",
          source_order_id: params.context.sourceOrderId ?? params.context.orderId ?? "",
          execution_mode: params.context.executionMode ?? "production",
          test_run_id: params.context.testRunId ?? "",
          call_id: params.context.callId,
          review_destination: params.template.reviewDestination,
          call_summary: params.context.callSummary ?? "",
        },
      }),
    });
  } catch (error) {
    logger.error("Customer.io transactional email request failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  const responseBody = await readJsonResponse(response);
  if (!response.ok) {
    logger.error("Customer.io transactional email failed", { status: response.status });
    throw new Error(`Customer.io transactional email failed with ${response.status}.`);
  }

  logger.info("Customer.io transactional review email sent", {
    status: response.status,
    providerMessageId: getProviderMessageId(responseBody),
  });

  await recordOutcomeAction(env, {
    context: params.context,
    actionType: "review_email",
    status: "completed",
    provider: "customerio",
    providerMessageId: getProviderMessageId(responseBody),
    templateKey: params.template.templateKey,
    reviewDestination: params.template.reviewDestination,
    payload: {
      transactionalMessageId: params.template.customerioTransactionalMessageId,
      recipientEmail,
      executionMode: params.context.executionMode ?? "production",
      testRunId: params.context.testRunId,
      response: responseBody,
    },
  });
}

function resolveEventCustomerEmail(context: SalesforceOrderLifecycleEventContext): string {
  if (context.customerEmail) {
    return context.customerEmail;
  }

  throw new Error(`Order ${context.orderId} did not include a Customer.io email identity.`);
}

function buildTrackAuthHeader(siteId: string, apiKey: string): string {
  return `Basic ${btoa(`${siteId}:${apiKey}`)}`;
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

function requireEnv(value: string | undefined, name: string): string {
  if (value) {
    return value;
  }

  throw new Error(`Missing required environment variable: ${name}.`);
}

function requireValue(value: string | undefined, label: string): string {
  if (value) {
    return value;
  }

  throw new Error(`Missing required ${label}.`);
}

function resolveRecipientEmail(context: ReviewOutcomeContext): string {
  if (context.executionMode !== "test") {
    return requireValue(context.customerEmail, "customer email");
  }

  return requireValue(context.testOverrides?.recipientEmail, "test recipient email");
}

function buildIdentifiers(
  context: ReviewOutcomeContext,
  recipientEmail: string,
): Record<string, string> {
  if (context.executionMode === "test") {
    return { email: recipientEmail };
  }

  return {
    ...(context.customerIoPersonId ? { id: context.customerIoPersonId } : {}),
    email: recipientEmail,
  };
}

function getProviderMessageId(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const id = record.delivery_id ?? record.message_id ?? record.id;
  return typeof id === "string" ? id : undefined;
}
