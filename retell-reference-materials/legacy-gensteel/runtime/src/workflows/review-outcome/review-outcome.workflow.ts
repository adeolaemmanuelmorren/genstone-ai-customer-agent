import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import { createLogger } from "../../lib/observability/logger";
import type { ReviewAgentEnv } from "../../types/env";
import {
  completeOutcomeWorkflow,
  getOutcomeContext,
  markOutcomeWorkflowFailed,
  markOutcomeWorkflowRunning,
  selectReviewEmailTemplate,
} from "../../services/persistence/review-agent-repository";
import { sendTransactionalReviewEmail } from "../../services/customerio/client";
import {
  sendAdminReviewEmail,
  type AdminReviewEmailOptions,
} from "../../services/email/admin-notification";
import {
  DB_STEP_CONFIG,
  PROVIDER_STEP_CONFIG,
} from "./review-outcome.steps";
import type {
  ReviewOutcomeContext,
  ReviewOutcomeWorkflowPayload,
} from "./review-outcome.types";

export class ReviewOutcomeWorkflow extends WorkflowEntrypoint<
  ReviewAgentEnv,
  ReviewOutcomeWorkflowPayload
> {
  async run(
    event: WorkflowEvent<ReviewOutcomeWorkflowPayload>,
    step: WorkflowStep,
  ): Promise<{ callId: string; status: string; outcome?: string }> {
    const payload = event.payload;
    const logger = createLogger({
      minLevel: this.env.ENVIRONMENT === "production" ? "info" : "debug",
      context: {
        workflow: "review-outcome",
        workflowInstanceId: event.instanceId,
        callId: payload.callId,
      },
    });

    try {
      await step.do("mark workflow running", DB_STEP_CONFIG, async () => {
        await markOutcomeWorkflowRunning(this.env, {
          callId: payload.callId,
          workflowInstanceId: event.instanceId,
        });
      });

      const context = await step.do("resolve outcome context", DB_STEP_CONFIG, async () => {
        return await getOutcomeContext(this.env, payload.callId);
      }) as ReviewOutcomeContext;

      logger.info("Routing review outcome", {
        outcome: context.callOutcome,
        orderId: context.orderId,
      });

      let adminEmailOptions: AdminReviewEmailOptions = {};

      if (context.callOutcome === "positive_review_email_needed") {
        adminEmailOptions = await this.handlePositiveReviewEmail(step, context);
      }

      await this.handleAdminReviewEmail(step, context, adminEmailOptions);

      if (context.callOutcome === "callback_requested") {
        await this.handleCallbackRequested(step, context);
      }

      const finalStatus = this.resolveFinalStatus(context);

      await step.do("mark workflow complete", DB_STEP_CONFIG, async () => {
        await completeOutcomeWorkflow(this.env, {
          callId: payload.callId,
          status: finalStatus,
        });
      });

      logger.info("Review outcome workflow completed", {
        status: finalStatus,
        outcome: context.callOutcome,
        orderId: context.orderId,
      });

      return {
        callId: payload.callId,
        status: "completed",
        outcome: context.callOutcome,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Review outcome workflow failed", { error: message });

      await step.do("mark workflow failed", DB_STEP_CONFIG, async () => {
        await markOutcomeWorkflowFailed(this.env, {
          callId: payload.callId,
          errorMessage: message,
        });
      });

      throw error;
    }
  }

  private async handlePositiveReviewEmail(
    step: WorkflowStep,
    context: ReviewOutcomeContext,
  ): Promise<AdminReviewEmailOptions> {
    const logger = createLogger({
      minLevel: this.env.ENVIRONMENT === "production" ? "info" : "debug",
      context: {
        workflow: "review-outcome",
        action: "positive-review-email",
        callId: context.callId,
        orderId: context.orderId,
      },
    });

    logger.info("Selecting Customer.io review email template", {
      customerEmail: context.customerEmail,
    });

    const selectedTemplate = await step.do(
      "select review email template",
      DB_STEP_CONFIG,
      async () => {
        return await selectReviewEmailTemplate(this.env, context);
      },
    ) as Awaited<ReturnType<typeof selectReviewEmailTemplate>>;

    logger.info("Customer.io review email template selected", {
      templateKey: selectedTemplate.templateKey,
      reviewDestination: selectedTemplate.reviewDestination,
      transactionalMessageId: selectedTemplate.customerioTransactionalMessageId,
    });

    logger.info("Sending Customer.io review email");

    await step.do("send customer.io transactional review email", PROVIDER_STEP_CONFIG, async () => {
      await sendTransactionalReviewEmail(this.env, {
        context,
        template: selectedTemplate,
      });
    });

    logger.info("Customer.io review email step completed");

    return {
      reviewDestination: selectedTemplate.reviewDestination,
    };
  }

  private async handleAdminReviewEmail(
    step: WorkflowStep,
    context: ReviewOutcomeContext,
    options: AdminReviewEmailOptions,
  ): Promise<void> {
    const logger = createLogger({
      minLevel: this.env.ENVIRONMENT === "production" ? "info" : "debug",
      context: {
        workflow: "review-outcome",
        action: "admin-review-email",
        callId: context.callId,
        orderId: context.orderId,
      },
    });

    logger.info("Sending admin review email", {
      outcome: context.callOutcome,
      reviewDestination: options.reviewDestination,
    });

    await step.do("send admin review email", PROVIDER_STEP_CONFIG, async () => {
      await sendAdminReviewEmail(this.env, context, options);
    });

    logger.info("Admin review email step completed");
  }

  private async handleCallbackRequested(
    step: WorkflowStep,
    context: ReviewOutcomeContext,
  ): Promise<void> {
    const callbackDate = resolveCallbackDate(context);
    if (!callbackDate) {
      return;
    }

    const logger = createLogger({
      minLevel: this.env.ENVIRONMENT === "production" ? "info" : "debug",
      context: {
        workflow: "review-outcome",
        action: "callback-requested",
        callId: context.callId,
        orderId: context.orderId,
      },
    });

    logger.info("Persisting callback due time", {
      callbackDueAt: callbackDate.toISOString(),
    });

    await step.do("persist callback due time", DB_STEP_CONFIG, async () => {
      await completeOutcomeWorkflow(this.env, {
        callId: context.callId,
        status: "callback_waiting",
        callbackDueAt: callbackDate.toISOString(),
      });
    });

    logger.info("Sleeping until callback requested time", {
      callbackDueAt: callbackDate.toISOString(),
    });

    await step.sleepUntil("wait until callback requested time", callbackDate);
  }

  private resolveFinalStatus(context: ReviewOutcomeContext): string {
    if (context.callOutcome === "negative_escalation_needed") {
      return "needs_escalation";
    }

    if (context.callOutcome === "callback_requested") {
      return "callback_notified";
    }

    return "completed";
  }
}

function resolveCallbackDate(context: ReviewOutcomeContext): Date | null {
  if (context.executionMode === "test" && context.testOverrides?.callbackDelaySeconds) {
    return new Date(Date.now() + context.testOverrides.callbackDelaySeconds * 1000);
  }

  return parseCallbackDate(context.callbackTimePreference);
}

function parseCallbackDate(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  const date = new Date(timestamp);
  if (date.getTime() <= Date.now()) {
    return null;
  }

  return date;
}
