import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { createLogger } from "../../lib/observability/logger";
import { recordOrderLifecycleEvent } from "../../services/persistence/review-agent-repository";
import { startReviewFollowup } from "../../services/review-orchestration/review-followup";
import {
  buildReviewOrderFromSalesforce,
  fetchSalesforceOpportunity,
  fetchSalesforceOrder,
  type SalesforceRecord,
} from "../../services/salesforce/client";
import type { ReviewAgentEnv } from "../../types/env";
import {
  CALL_CUSTOMER_DB_STEP_CONFIG,
  CALL_CUSTOMER_RETELL_STEP_CONFIG,
  CALL_CUSTOMER_SALESFORCE_STEP_CONFIG,
} from "./call-customer.steps";
import type { CallCustomerWorkflowPayload } from "./call-customer.types";

export class CallCustomerWorkflow extends WorkflowEntrypoint<
  ReviewAgentEnv,
  CallCustomerWorkflowPayload
> {
  async run(
    event: WorkflowEvent<CallCustomerWorkflowPayload>,
    step: WorkflowStep,
  ): Promise<{ orderId: string; status: string; callId?: string; duplicate?: boolean }> {
    const payload = event.payload;
    const logger = createLogger({
      minLevel: this.env.ENVIRONMENT === "production" ? "info" : "debug",
      context: {
        workflow: "call-customer",
        workflowInstanceId: event.instanceId,
        orderId: payload.data.order_id,
        opportunityId: payload.data.opportunity_id,
      },
    });

    await step.do("record call-customer request", CALL_CUSTOMER_DB_STEP_CONFIG, async () => {
      await recordOrderLifecycleEvent(this.env, {
        payload,
        workflowInstanceId: event.instanceId,
        eventName: "Call Customer Requested",
      });
    });

    const orderRecord = await step.do(
      "fetch salesforce order",
      CALL_CUSTOMER_SALESFORCE_STEP_CONFIG,
      async () => {
        return await fetchSalesforceOrder(this.env, payload.data.order_id) as any;
      },
    ) as SalesforceRecord;

    const opportunityId = payload.data.opportunity_id ?? readString(orderRecord, "OpportunityId");
    if (!opportunityId) {
      throw new Error(`Salesforce order ${payload.data.order_id} did not include OpportunityId.`);
    }

    const opportunityRecord = await step.do(
      "fetch salesforce opportunity",
      CALL_CUSTOMER_SALESFORCE_STEP_CONFIG,
      async () => {
        return await fetchSalesforceOpportunity(this.env, opportunityId) as any;
      },
    ) as SalesforceRecord;

    const order = await step.do("build review order", CALL_CUSTOMER_DB_STEP_CONFIG, async () => {
      return buildReviewOrderFromSalesforce(payload, orderRecord, opportunityRecord) as any;
    }) as ReturnType<typeof buildReviewOrderFromSalesforce>;

    logger.info("Starting Retell review follow-up from enriched Salesforce order", {
      orderNumber: order.orderNumber,
      customerEmail: order.customerEmail,
    });

    const result = await step.do("start review follow-up", CALL_CUSTOMER_RETELL_STEP_CONFIG, async () => {
      return await startReviewFollowup(this.env, order);
    }) as Awaited<ReturnType<typeof startReviewFollowup>>;

    return {
      orderId: result.orderId,
      callId: result.callId,
      duplicate: result.duplicate,
      status: result.duplicate ? "duplicate" : "started",
    };
  }
}

function readString(record: SalesforceRecord, fieldName: string): string | undefined {
  const value = record[fieldName];
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return undefined;
}
