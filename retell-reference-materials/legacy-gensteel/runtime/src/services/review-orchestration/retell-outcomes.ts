import {
  getCallOutcome,
  type RetellWebhookEvent,
} from "../../schemas/retell-webhook";
import type { ReviewAgentEnv } from "../../types/env";
import { createLogger } from "../../lib/observability/logger";
import {
  recordRetellWebhookEvent,
  saveCallAnalysisResult,
} from "../persistence/review-agent-repository";
import { notifyCallAnalyzedSlack } from "../slack/client";

export async function processRetellWebhook(
  env: ReviewAgentEnv,
  event: RetellWebhookEvent,
): Promise<{ duplicate: boolean; processed: boolean; outcome?: string }> {
  const logger = createLogger({
    minLevel: env.ENVIRONMENT === "production" ? "info" : "debug",
    context: {
      service: "retell-outcomes",
      eventType: event.eventType,
      callId: event.callId,
      orderId: event.orderId,
    },
  });

  logger.info("Recording Retell webhook event");
  const recordedEvent = await recordRetellWebhookEvent(env, event);
  if (recordedEvent.duplicate) {
    logger.info("Skipping duplicate Retell webhook event");
    return { duplicate: true, processed: false };
  }

  if (event.eventType !== "call_analyzed") {
    logger.info("Retell webhook recorded without analysis processing");
    return { duplicate: false, processed: false };
  }

  logger.info("Saving Retell call analysis result", {
    outcome: getCallOutcome(event.analysis),
    isTestCall: isTestWebCall(event),
  });
  const savedResult = await saveCallAnalysisResult(env, event);
  const slackResult = await notifyCallAnalyzedSlack(env, event, {
    followupId: savedResult.followupId,
  });
  logger.info("Retell call analysis Slack notification handled", {
    slackNotified: slackResult.notified,
    slackError: slackResult.error,
  });

  logger.info("Starting outcome workflow for Retell call analysis");
  await startOutcomeWorkflow(env, event);

  return {
    duplicate: false,
    processed: true,
    outcome: getCallOutcome(event.analysis),
  };
}

function isTestWebCall(event: RetellWebhookEvent): boolean {
  return event.metadata.gensteel_test_call === "true";
}

async function startOutcomeWorkflow(
  env: ReviewAgentEnv,
  event: RetellWebhookEvent,
): Promise<void> {
  if (!event.callId) {
    throw new Error("Cannot start outcome workflow without call_id.");
  }

  if (!env.REVIEW_OUTCOME_WORKFLOW) {
    throw new Error("Missing required Workflow binding: REVIEW_OUTCOME_WORKFLOW.");
  }

  try {
    await env.REVIEW_OUTCOME_WORKFLOW.create({
      id: `review-outcome-${event.callId}`,
      params: {
        callId: event.callId,
        eventId: event.providerEventId,
      },
    });
    return;
  } catch (error) {
    if (isWorkflowAlreadyExistsError(error)) {
      return;
    }

    throw error;
  }
}

function isWorkflowAlreadyExistsError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.toLowerCase().includes("already exists");
}
