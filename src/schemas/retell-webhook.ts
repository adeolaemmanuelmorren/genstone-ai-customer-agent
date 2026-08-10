import { z } from "zod";

export const retellWebhookPayloadSchema = z.object({}).loose();

export type RetellWebhookPayload = z.infer<typeof retellWebhookPayloadSchema>;

export interface NormalizedRetellWebhook {
  eventType: string;
  providerEventId?: string;
  callId?: string;
  callStatus?: string;
  direction?: string;
  callerPhone?: string;
  calledPhone?: string;
  startedAt?: Date;
  endedAt?: Date;
  primaryRoute?: string;
  callOutcome?: string;
  orderVerified?: boolean;
  capabilityGapSummary?: string;
}

export function normalizeRetellWebhook(
  payload: RetellWebhookPayload,
): NormalizedRetellWebhook {
  const call = readRecord(payload.call) ?? payload;
  const callAnalysis = readRecord(call.call_analysis);
  const customAnalysis = readRecord(callAnalysis?.custom_analysis_data)
    ?? readRecord(call.custom_analysis_data);

  return {
    eventType: readString(payload.event) ?? readString(payload.event_type) ?? "unknown",
    providerEventId: readString(payload.event_id) ?? readString(payload.id),
    callId: readString(call.call_id) ?? readString(payload.call_id),
    callStatus: readString(call.call_status) ?? readString(call.status),
    direction: readString(call.direction),
    callerPhone: readString(call.from_number),
    calledPhone: readString(call.to_number),
    startedAt: readRetellDate(call.start_timestamp),
    endedAt: readRetellDate(call.end_timestamp),
    primaryRoute: readString(customAnalysis?.primary_route),
    callOutcome: readString(customAnalysis?.call_outcome),
    orderVerified: readBoolean(customAnalysis?.order_verified),
    capabilityGapSummary: readString(customAnalysis?.capability_gap_summary),
  };
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function readRetellDate(value: unknown): Date | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  const milliseconds = value > 10_000_000_000 ? value : value * 1000;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
