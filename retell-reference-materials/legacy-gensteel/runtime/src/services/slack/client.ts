import type { ReviewAgentEnv } from "../../types/env";
import type { ReviewOutcomeContext } from "../../workflows/review-outcome/review-outcome.types";
import { createLogger } from "../../lib/observability/logger";
import {
  getAnalysisString,
  getCallOutcome,
  type RetellWebhookEvent,
} from "../../schemas/retell-webhook";
import { recordOutcomeAction } from "../persistence/review-agent-repository";

type SlackApiResponse = {
  ok: boolean;
  error?: string;
  channel?: string;
  ts?: string;
};

export async function notifyReviewOutcomeSlack(
  env: ReviewAgentEnv,
  context: ReviewOutcomeContext,
): Promise<void> {
  await notifySlack(env, context, "workflow_outcome_slack_notification");
}

export async function notifyCallAnalyzedSlack(
  env: ReviewAgentEnv,
  event: RetellWebhookEvent,
  params: { followupId?: string },
): Promise<{ notified: boolean; error?: string }> {
  const context = buildContextFromRetellEvent(event, params.followupId);
  return await notifySlack(env, context, "call_analyzed_slack_notification");
}

async function notifySlack(
  env: ReviewAgentEnv,
  context: ReviewOutcomeContext,
  actionType: string,
): Promise<{ notified: boolean; error?: string }> {
  const botToken = env.SLACK_BOT_TOKEN;
  const channel = env.SLACK_REVIEW_AGENT_CHANNEL_ID;
  const logger = createLogger({
    minLevel: env.ENVIRONMENT === "production" ? "info" : "debug",
    context: {
      provider: "slack",
      action: actionType,
      callId: context.callId,
      orderId: context.orderId,
    },
  });

  if (!botToken || !channel) {
    const error = "Slack bot token or channel id is missing.";
    logger.warn("Skipping Slack notification", { error });
    await recordSlackAction(env, context, actionType, "skipped", { error });
    return { notified: false, error };
  }

  logger.info("Posting Slack notification", {
    channel,
    outcome: context.callOutcome,
    isTestCall: context.isTestCall,
    executionMode: context.executionMode ?? "production",
    testRunId: context.testRunId,
  });

  try {
    const response = await postSlackApi(botToken, "chat.postMessage", {
      channel,
      text: buildFallbackText(context),
      blocks: buildBlocks(context),
      unfurl_links: false,
      unfurl_media: false,
    });

    logger.info("Slack notification posted", {
      channel: response.channel,
      ts: response.ts,
    });

    await recordSlackAction(env, context, actionType, "completed", {
      channel: response.channel,
      ts: response.ts,
    }, response.ts);

    return { notified: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Slack notification failed", { error: message });
    await recordSlackAction(env, context, actionType, "failed", { error: message });
    return { notified: false, error: message };
  }
}

async function postSlackApi(
  botToken: string,
  method: string,
  body: Record<string, unknown>,
): Promise<SlackApiResponse> {
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      Authorization: `Bearer ${botToken}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json<SlackApiResponse>();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? `Slack API call failed: ${method}`);
  }

  return payload;
}

function buildFallbackText(context: ReviewOutcomeContext): string {
  const prefix = isTestContext(context) ? "[TEST] " : "";
  return `${prefix}GenSteel review call outcome: ${context.callOutcome ?? "unknown"} for ${context.customerName ?? context.orderId ?? context.callId}`;
}

function buildBlocks(context: ReviewOutcomeContext): Array<Record<string, unknown>> {
  const fields = [
    { type: "mrkdwn", text: `*Outcome:*\n${context.callOutcome ?? "unknown"}` },
    { type: "mrkdwn", text: `*Execution:*\n${isTestContext(context) ? "test" : "production"}` },
    { type: "mrkdwn", text: `*Order:*\n${context.orderNumber ?? context.orderId ?? "unknown"}` },
    { type: "mrkdwn", text: `*Customer:*\n${context.customerName ?? "unknown"}` },
    { type: "mrkdwn", text: `*Email:*\n${context.customerEmail ?? "unknown"}` },
    { type: "mrkdwn", text: `*Call ID:*\n\`${context.callId}\`` },
  ];

  if (isTestContext(context)) {
    fields.splice(2, 0, {
      type: "mrkdwn",
      text: `*Test Run:*\n${context.testRunId ?? "unknown"}`,
    });
    fields.splice(4, 0, {
      type: "mrkdwn",
      text: `*Source Order:*\n${context.sourceOrderNumber ?? context.sourceOrderId ?? "unknown"}`,
    });
  }

  if (context.buildingDescription) {
    fields.splice(3, 0, {
      type: "mrkdwn",
      text: `*Building:*\n${context.buildingDescription}`,
    });
  }

  const blocks: Array<Record<string, unknown>> = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${isTestContext(context) ? "[TEST] " : ""}GenSteel Review Call Outcome`,
      },
    },
    {
      type: "section",
      fields,
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Summary:*\n${truncate(context.callSummary ?? "No summary captured.")}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Issue:*\n${truncate(context.issueSummary ?? "No issue captured.")}`,
      },
    },
  ];

  const buttons = buildCallUrlButtons(context);
  if (buttons.length > 0) {
    blocks.push({
      type: "actions",
      elements: buttons,
    });
  }

  return blocks;
}

function buildContextFromRetellEvent(
  event: RetellWebhookEvent,
  followupId: string | undefined,
): ReviewOutcomeContext {
  const dynamicVariables = readDynamicVariables(event.rawPayload);

  return {
    followupId,
    orderId: readString(event.metadata.source_order_id) ?? event.orderId ?? readString(dynamicVariables.order_id),
    orderNumber: readString(event.metadata.source_order_number) ?? readString(dynamicVariables.order_number),
    executionMode: readExecutionMode(event.metadata),
    testRunId: readString(event.metadata.test_run_id),
    sourceOrderId: readString(event.metadata.source_order_id),
    sourceOrderNumber: readString(event.metadata.source_order_number),
    testOverrides: {
      recipientEmail: readString(event.metadata.test_recipient_email),
      recipientName: readString(event.metadata.test_recipient_name),
      escalationEmail: readString(event.metadata.test_escalation_email),
      callbackDelaySeconds: readPositiveInteger(event.metadata.test_callback_delay_seconds),
    },
    callId: requireCallId(event),
    callOutcome: getCallOutcome(event.analysis),
    customerName: readString(dynamicVariables.customer_name),
    customerEmail: getAnalysisString(event.analysis, "confirmed_email")
      ?? readString(event.metadata.customer_email)
      ?? readString(dynamicVariables.customer_email),
    buildingDescription: readString(dynamicVariables.building_description),
    retellPublicLogUrl: readString(readRetellCallField(event.rawPayload, "public_log_url")),
    retellRecordingUrl: readString(readRetellCallField(event.rawPayload, "recording_url")),
    callSummary: getAnalysisString(event.analysis, "call_summary"),
    issueSummary: getAnalysisString(event.analysis, "issue_summary"),
    callbackTimePreference: getAnalysisString(event.analysis, "callback_time_preference"),
    isTestCall: isTestMetadata(event.metadata),
  };
}

async function recordSlackAction(
  env: ReviewAgentEnv,
  context: ReviewOutcomeContext,
  actionType: string,
  status: string,
  payload: Record<string, unknown>,
  providerMessageId?: string,
): Promise<void> {
  await recordOutcomeAction(env, {
    context,
    actionType,
    status,
    provider: "slack",
    providerMessageId,
    errorMessage: typeof payload.error === "string" ? payload.error : undefined,
    payload: {
      ...payload,
      retellPublicLogUrl: context.retellPublicLogUrl,
      retellRecordingUrl: context.retellRecordingUrl,
    },
  });
}

function buildCallUrlButtons(context: ReviewOutcomeContext): Array<Record<string, unknown>> {
  const buttons: Array<Record<string, unknown>> = [];

  if (context.retellPublicLogUrl) {
    buttons.push({
      type: "button",
      text: {
        type: "plain_text",
        text: "Open Retell Log",
      },
      url: context.retellPublicLogUrl,
    });
  }

  if (context.retellRecordingUrl) {
    buttons.push({
      type: "button",
      text: {
        type: "plain_text",
        text: "Listen to Recording",
      },
      url: context.retellRecordingUrl,
    });
  }

  return buttons;
}

function readDynamicVariables(rawPayload: unknown): Record<string, unknown> {
  const payload = readRecord(rawPayload);
  const call = readRecord(payload.call) ?? payload;
  return readRecord(call.retell_llm_dynamic_variables) ?? {};
}

function readRetellCallField(rawPayload: unknown, fieldName: string): unknown {
  const payload = readRecord(rawPayload);
  const call = readRecord(payload.call) ?? payload;
  return call[fieldName];
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requireCallId(event: RetellWebhookEvent): string {
  if (event.callId) {
    return event.callId;
  }

  throw new Error("Cannot post Slack notification without call_id.");
}

function isTestContext(context: ReviewOutcomeContext): boolean {
  return context.executionMode === "test" || context.isTestCall === true;
}

function readExecutionMode(metadata: Record<string, unknown>): "production" | "test" {
  return isTestMetadata(metadata) ? "test" : "production";
}

function isTestMetadata(metadata: Record<string, unknown>): boolean {
  return metadata.execution_mode === "test" || metadata.gensteel_test_call === "true";
}

function readPositiveInteger(value: unknown): number | undefined {
  const rawValue = typeof value === "number" ? value : Number(readString(value));

  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return undefined;
  }

  return Math.round(rawValue);
}

function truncate(value: string): string {
  if (value.length <= 1000) {
    return value;
  }

  return `${value.slice(0, 1000)}...`;
}
