import type { NormalizedOrderCreated } from "../../schemas/order-created";
import type { RetellPromptAgent } from "../../schemas/test-web-call";
import type { ReviewAgentEnv } from "../../types/env";
import { createLogger } from "../../lib/observability/logger";
import { createRetellCall, createRetellWebCall } from "../retell/client";
import {
  markRetellCallCreated,
  markRetellCallFailed,
  reserveOrderFollowup,
} from "../persistence/review-agent-repository";

export async function startReviewFollowup(
  env: ReviewAgentEnv,
  order: NormalizedOrderCreated,
): Promise<{ orderId: string; callId?: string; duplicate: boolean }> {
  const logger = createLogger({
    minLevel: env.ENVIRONMENT === "production" ? "info" : "debug",
    context: {
      service: "review-followup",
      action: "start-review-followup",
      orderId: order.orderId,
    },
  });

  logger.info("Reserving review follow-up", {
    orderNumber: order.orderNumber,
    customerEmail: order.customerEmail,
  });
  const reservation = await reserveOrderFollowup(env, order);

  if (!reservation.shouldCreateCall) {
    logger.info("Review follow-up already has call state", {
      callId: reservation.followup.call_id,
      status: reservation.followup.status,
    });
    return {
      orderId: order.orderId,
      callId: reservation.followup.call_id ?? undefined,
      duplicate: true,
    };
  }

  try {
    logger.info("Creating Retell call for reserved review follow-up");
    const retellCall = await createRetellCall(env, order);
    await markRetellCallCreated(env, {
      orderId: order.orderId,
      callId: retellCall.callId,
      response: retellCall.response,
    });

    logger.info("Review follow-up call created", { callId: retellCall.callId });

    return {
      orderId: order.orderId,
      callId: retellCall.callId,
      duplicate: false,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown Retell create call error.";
    logger.error("Review follow-up call creation failed", { error: errorMessage });
    await markRetellCallFailed(env, {
      orderId: order.orderId,
      errorMessage,
    });
    throw error;
  }
}

export async function startTestWebReviewFollowup(
  env: ReviewAgentEnv,
  order: NormalizedOrderCreated,
  options: { promptAgent?: RetellPromptAgent } = {},
): Promise<{
  orderId: string;
  callId?: string;
  accessToken?: string;
  duplicate: boolean;
  response?: unknown;
}> {
  const logger = createLogger({
    minLevel: env.ENVIRONMENT === "production" ? "info" : "debug",
    context: {
      service: "review-followup",
      action: "start-test-web-review-followup",
      orderId: order.orderId,
      testRunId: order.testRunId,
      sourceOrderId: order.sourceOrderId,
      promptAgent: options.promptAgent ?? "conversation_flow",
    },
  });

  logger.info("Reserving test review follow-up", {
    sourceOrderNumber: order.sourceOrderNumber,
    testRecipientEmail: order.testOverrides?.recipientEmail,
  });
  const reservation = await reserveOrderFollowup(env, order);

  if (!reservation.shouldCreateCall) {
    logger.info("Test review follow-up already has call state", {
      callId: reservation.followup.call_id,
      status: reservation.followup.status,
    });
    return {
      orderId: order.orderId,
      callId: reservation.followup.call_id ?? undefined,
      duplicate: true,
    };
  }

  try {
    logger.info("Creating Retell web call for reserved test follow-up");
    const retellCall = await createRetellWebCall(env, order, {
      promptAgent: options.promptAgent,
    });
    await markRetellCallCreated(env, {
      orderId: order.orderId,
      callId: retellCall.callId,
      response: retellCall.response,
    });

    logger.info("Test review follow-up web call created", { callId: retellCall.callId });

    return {
      orderId: order.orderId,
      callId: retellCall.callId,
      accessToken: retellCall.accessToken,
      duplicate: false,
      response: retellCall.response,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown Retell web-call error.";
    logger.error("Test review follow-up web-call creation failed", { error: errorMessage });
    await markRetellCallFailed(env, {
      orderId: order.orderId,
      errorMessage,
    });
    throw error;
  }
}
