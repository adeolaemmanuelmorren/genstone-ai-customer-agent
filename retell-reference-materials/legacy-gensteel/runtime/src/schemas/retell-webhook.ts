import { z } from "zod";
import { isRecord } from "@bradford-road/api";

export const retellWebhookPayloadSchema = z.object({}).passthrough();

export type RetellWebhookPayload = z.infer<typeof retellWebhookPayloadSchema>;

export type RetellWebhookEvent = {
  eventType: string;
  providerEventId?: string;
  callId?: string;
  orderId?: string;
  metadata: Record<string, unknown>;
  analysis: Record<string, unknown>;
  rawPayload: RetellWebhookPayload;
};

export type CallOutcome =
  | "positive_review_email_needed"
  | "positive_no_review"
  | "negative_escalation_needed"
  | "callback_requested"
  | "wrong_person_or_number"
  | "no_meaningful_conversation";

export function normalizeRetellWebhook(payload: RetellWebhookPayload): RetellWebhookEvent {
  const call = getRecord(payload.call) ?? payload;
  const analysis = getRecord(call.call_analysis) ?? getRecord(payload.call_analysis) ?? {};
  const metadata = getRecord(call.metadata) ?? getRecord(payload.metadata) ?? {};
  const callId = getString(call.call_id) ?? getString(payload.call_id);
  const eventType = getString(payload.event) ?? getString(payload.event_type) ?? "unknown";
  const providerEventId = getString(payload.event_id) ?? getString(payload.eventId) ?? getString(payload.id);
  const orderId = getString(metadata.order_id);

  return {
    eventType,
    providerEventId,
    callId,
    orderId,
    metadata,
    analysis,
    rawPayload: payload,
  };
}

export function getAnalysisString(
  analysis: Record<string, unknown>,
  fieldName: string,
): string | undefined {
  const customAnalysis = getRecord(analysis.custom_analysis_data);
  return getString(customAnalysis?.[fieldName]) ?? getString(analysis[fieldName]);
}

export function getAnalysisBoolean(
  analysis: Record<string, unknown>,
  fieldName: string,
): boolean | undefined {
  const customAnalysis = getRecord(analysis.custom_analysis_data);
  return getBoolean(customAnalysis?.[fieldName]) ?? getBoolean(analysis[fieldName]);
}

export function getCallOutcome(analysis: Record<string, unknown>): CallOutcome | undefined {
  const value = getAnalysisString(analysis, "call_outcome");

  if (
    value === "positive_review_email_needed" ||
    value === "positive_no_review" ||
    value === "negative_escalation_needed" ||
    value === "callback_requested" ||
    value === "wrong_person_or_number" ||
    value === "no_meaningful_conversation"
  ) {
    return value;
  }

  return undefined;
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function getBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
