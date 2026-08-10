import type { ExecutionMode, TestExecutionOverrides } from "../../schemas/order-created";

export interface ReviewOutcomeWorkflowPayload {
  callId: string;
  eventId?: string;
}

export interface ReviewOutcomeContext {
  followupId?: string;
  orderId?: string;
  orderNumber?: string;
  executionMode?: ExecutionMode;
  testRunId?: string;
  sourceOrderId?: string;
  sourceOrderNumber?: string;
  testOverrides?: TestExecutionOverrides;
  callId: string;
  callOutcome?: string;
  customerName?: string;
  customerEmail?: string;
  customerIoPersonId?: string;
  buildingDescription?: string;
  retellPublicLogUrl?: string;
  retellRecordingUrl?: string;
  callSummary?: string;
  issueSummary?: string;
  callbackTimePreference?: string;
  isTestCall?: boolean;
}
