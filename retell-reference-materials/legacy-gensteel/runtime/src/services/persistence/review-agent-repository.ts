import type {
  ExecutionMode,
  NormalizedOrderCreated,
  OrderCreatedPayload,
  TestExecutionOverrides,
} from "../../schemas/order-created";
import {
  getAnalysisBoolean,
  getAnalysisString,
  getCallOutcome,
  type RetellWebhookEvent,
} from "../../schemas/retell-webhook";
import type { ReviewAgentEnv } from "../../types/env";
import type { ReviewOutcomeContext } from "../../workflows/review-outcome/review-outcome.types";
import { createId } from "../../utils/ids";
import { getCompanyId, withDatabase, withTransaction, type Queryable } from "./db";

export type RecordedOrderEventName =
  | "Order Created"
  | "Order Delivered"
  | "Call Customer Requested";

export interface OrderFollowupRow {
  id: string;
  order_id: string;
  call_id: string | null;
  status: string;
  customer_email: string | null;
  customer_io_person_id: string | null;
  execution_mode: ExecutionMode;
  test_run_id: string | null;
  source_order_id: string | null;
  source_order_number: string | null;
  test_overrides: TestExecutionOverrides;
}

export interface ReviewEmailTemplateSelection {
  id: string;
  templateKey: string;
  reviewDestination: string;
  customerioTransactionalMessageId: string;
}

export type TestCallActionSummary = {
  actionType: string;
  status: string;
  provider?: string;
  reviewDestination?: string;
  createdAt?: string;
  completedAt?: string;
};

export type TestCallSummary = {
  testRunId: string;
  sourceOrderId?: string;
  sourceOrderNumber?: string;
  orderNumber?: string;
  callId?: string;
  outcome?: string;
  followupStatus: string;
  workflowStatus?: string;
  retellPublicLogUrl?: string;
  retellRecordingUrl?: string;
  createdAt: string;
  updatedAt: string;
  actions: TestCallActionSummary[];
};

type TestCallHistoryRow = {
  test_run_id: string | null;
  source_order_id: string | null;
  source_order_number: string | null;
  order_number: string | null;
  call_id: string | null;
  call_outcome: string | null;
  followup_status: string;
  workflow_status: string | null;
  retell_public_log_url: string | null;
  retell_recording_url: string | null;
  created_at: string;
  updated_at: string;
  actions: unknown;
};

type TestCallActionRow = {
  actionType?: unknown;
  status?: unknown;
  provider?: unknown;
  reviewDestination?: unknown;
  createdAt?: unknown;
  completedAt?: unknown;
};

export async function listTestCalls(
  env: ReviewAgentEnv,
  params: { limit?: number } = {},
): Promise<{ calls: TestCallSummary[] }> {
  const limit = Math.min(200, Math.max(1, params.limit ?? 50));

  return withDatabase(env, async (client) => {
    const result = await client.query<TestCallHistoryRow>(
      `
        SELECT
          f.test_run_id,
          f.source_order_id,
          f.source_order_number,
          f.order_number,
          f.call_id,
          COALESCE(r.call_outcome, f.call_outcome) AS call_outcome,
          f.status AS followup_status,
          COALESCE(r.workflow_status, f.outcome_workflow_status) AS workflow_status,
          r.retell_public_log_url,
          r.retell_recording_url,
          f.created_at::text AS created_at,
          f.updated_at::text AS updated_at,
          COALESCE(actions.rows, '[]'::jsonb) AS actions
        FROM gensteel_review_agent.order_followups f
        LEFT JOIN gensteel_review_agent.call_results r
          ON r.company_id = f.company_id
          AND r.call_id = f.call_id
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(
            jsonb_build_object(
              'actionType', a.action_type,
              'status', a.status,
              'provider', a.provider,
              'reviewDestination', a.review_destination,
              'createdAt', a.created_at,
              'completedAt', a.completed_at
            )
            ORDER BY a.created_at DESC
          ) AS rows
          FROM gensteel_review_agent.outcome_actions a
          WHERE a.company_id = f.company_id
            AND a.call_id = f.call_id
            AND a.execution_mode = 'test'
        ) actions ON true
        WHERE f.company_id = $1
          AND f.execution_mode = 'test'
        ORDER BY f.created_at DESC
        LIMIT $2
      `,
      [getCompanyId(env), limit],
    );

    return {
      calls: result.rows.map(toTestCallSummary),
    };
  });
}

export async function recordOrderCreatedEvent(
  env: ReviewAgentEnv,
  params: {
    payload: OrderCreatedPayload;
    workflowInstanceId: string;
  },
): Promise<{ duplicate: boolean }> {
  return recordOrderLifecycleEvent(env, {
    ...params,
    eventName: "Order Created",
  });
}

export async function recordOrderLifecycleEvent(
  env: ReviewAgentEnv,
  params: {
    payload: OrderCreatedPayload;
    workflowInstanceId: string;
    eventName: RecordedOrderEventName;
  },
): Promise<{ duplicate: boolean }> {
  const companyId = getCompanyId(env);
  const eventId = createId("webhook");
  const now = new Date().toISOString();
  const providerEventId = `${toProviderEventPrefix(params.eventName)}:${companyId}:${params.payload.data.order_id}`;

  return withDatabase(env, async (client) => {
    const result = await client.query(
      `
        INSERT INTO gensteel_review_agent.webhook_events (
          id,
          company_id,
          provider,
          provider_event_id,
          event_type,
          order_id,
          payload,
          processed_at,
          created_at
        )
        VALUES ($1, $2, 'salesforce', $3, $4, $5, $6::jsonb, $7, $7)
        ON CONFLICT (provider, provider_event_id)
          WHERE provider_event_id IS NOT NULL
          DO NOTHING
      `,
      [
        eventId,
        companyId,
        providerEventId,
        params.eventName,
        params.payload.data.order_id,
        JSON.stringify({
          ...params.payload,
          workflow_instance_id: params.workflowInstanceId,
        }),
        now,
      ],
    );

    return { duplicate: result.rowCount === 0 };
  });
}

function toProviderEventPrefix(eventName: RecordedOrderEventName): string {
  if (eventName === "Order Delivered") {
    return "order-delivered";
  }

  if (eventName === "Call Customer Requested") {
    return "call-customer";
  }

  return "order-created";
}

export async function reserveOrderFollowup(
  env: ReviewAgentEnv,
  order: NormalizedOrderCreated,
): Promise<{ followup: OrderFollowupRow; shouldCreateCall: boolean }> {
  const companyId = getCompanyId(env);
  const now = new Date().toISOString();
  const id = createId("followup");

  return withTransaction(env, async (client) => {
    await client.query(
      `
        INSERT INTO gensteel_review_agent.order_followups (
          id,
          company_id,
          order_id,
          order_number,
          customer_id,
          customer_io_person_id,
          salesforce_order_id,
          salesforce_account_id,
          customer_name,
          customer_phone,
          customer_email,
          building_description,
          delivery_date,
          employee_name,
          employee_role,
          execution_mode,
          test_run_id,
          source_order_id,
          source_order_number,
          test_overrides,
          status,
          raw_order_payload,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20::jsonb,
          'reserved', $21::jsonb, $22, $22
        )
        ON CONFLICT (company_id, order_id) DO NOTHING
      `,
      [
        id,
        companyId,
        order.orderId,
        order.orderNumber,
        order.customerId,
        order.customerIoPersonId,
        order.salesforceOrderId,
        order.salesforceAccountId,
        order.customerName,
        order.customerPhone,
        order.customerEmail,
        order.buildingDescription,
        order.deliveryDate,
        order.employeeName,
        order.employeeRole,
        order.executionMode ?? "production",
        order.testRunId,
        order.sourceOrderId,
        order.sourceOrderNumber,
        JSON.stringify(order.testOverrides ?? {}),
        JSON.stringify(order.rawPayload),
        now,
      ],
    );

    const followup = await getOrderFollowupByOrderId(client, companyId, order.orderId);
    if (!followup) {
      throw new Error(`Failed to reserve follow-up for order ${order.orderId}.`);
    }

    return {
      followup,
      shouldCreateCall: !followup.call_id && followup.status !== "completed",
    };
  });
}

export async function markRetellCallCreated(
  env: ReviewAgentEnv,
  params: {
    orderId: string;
    callId: string;
    response: unknown;
  },
): Promise<void> {
  await withDatabase(env, async (client) => {
    await client.query(
      `
        UPDATE gensteel_review_agent.order_followups
        SET
          call_id = $1,
          status = 'call_created',
          retell_create_call_response = $2::jsonb,
          last_error = NULL,
          updated_at = $3
        WHERE company_id = $4 AND order_id = $5
      `,
      [
        params.callId,
        JSON.stringify(params.response),
        new Date().toISOString(),
        getCompanyId(env),
        params.orderId,
      ],
    );
  });
}

export async function markRetellCallFailed(
  env: ReviewAgentEnv,
  params: { orderId: string; errorMessage: string },
): Promise<void> {
  await withDatabase(env, async (client) => {
    await client.query(
      `
        UPDATE gensteel_review_agent.order_followups
        SET status = 'call_create_failed', last_error = $1, updated_at = $2
        WHERE company_id = $3 AND order_id = $4
      `,
      [params.errorMessage, new Date().toISOString(), getCompanyId(env), params.orderId],
    );
  });
}

export async function recordRetellWebhookEvent(
  env: ReviewAgentEnv,
  event: RetellWebhookEvent,
): Promise<{ duplicate: boolean }> {
  const companyId = getCompanyId(env);
  const eventId = createId("webhook");
  const now = new Date().toISOString();
  const executionContext = readExecutionContextFromMetadata(event.metadata);

  return withDatabase(env, async (client) => {
    const result = await client.query(
      `
        INSERT INTO gensteel_review_agent.webhook_events (
          id,
          company_id,
          provider,
          provider_event_id,
          event_type,
          call_id,
          order_id,
          execution_mode,
          test_run_id,
          source_order_id,
          payload,
          created_at
        )
        VALUES ($1, $2, 'retell', $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
        ON CONFLICT (provider, provider_event_id)
          WHERE provider_event_id IS NOT NULL
          DO NOTHING
      `,
      [
        eventId,
        companyId,
        event.providerEventId,
        event.eventType,
        event.callId,
        event.orderId,
        executionContext.executionMode,
        executionContext.testRunId,
        executionContext.sourceOrderId,
        JSON.stringify(event.rawPayload),
        now,
      ],
    );

    return { duplicate: result.rowCount === 0 };
  });
}

export async function saveCallAnalysisResult(
  env: ReviewAgentEnv,
  event: RetellWebhookEvent,
): Promise<{ followupId?: string; outcome?: string }> {
  if (!event.callId) {
    throw new Error("Retell call_analyzed webhook is missing call_id.");
  }

  const companyId = getCompanyId(env);
  const now = new Date().toISOString();
  const followup = await findFollowupByCallOrOrder(env, {
    callId: event.callId,
    orderId: event.orderId,
  });
  const outcome = getCallOutcome(event.analysis);
  const executionContext = readExecutionContext(followup, event.metadata);

  await withDatabase(env, async (client) => {
    await client.query(
      `
        INSERT INTO gensteel_review_agent.call_results (
          id,
          company_id,
          order_followup_id,
          call_id,
          retell_public_log_url,
          retell_recording_url,
          call_summary,
          call_successful,
          user_sentiment,
          experience_sentiment,
          employee_sentiment,
          review_requested,
          review_consent,
          confirmed_email,
          needs_escalation,
          issue_summary,
          callback_time_preference,
          call_outcome,
          execution_mode,
          test_run_id,
          source_order_id,
          test_overrides,
          analysis,
          metadata,
          raw_payload,
          created_at,
          updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19,
          $20, $21, $22::jsonb, $23::jsonb, $24::jsonb, $25::jsonb, $26, $26
        )
        ON CONFLICT (call_id) DO UPDATE SET
          order_followup_id = EXCLUDED.order_followup_id,
          retell_public_log_url = EXCLUDED.retell_public_log_url,
          retell_recording_url = EXCLUDED.retell_recording_url,
          call_summary = EXCLUDED.call_summary,
          call_successful = EXCLUDED.call_successful,
          user_sentiment = EXCLUDED.user_sentiment,
          experience_sentiment = EXCLUDED.experience_sentiment,
          employee_sentiment = EXCLUDED.employee_sentiment,
          review_requested = EXCLUDED.review_requested,
          review_consent = EXCLUDED.review_consent,
          confirmed_email = EXCLUDED.confirmed_email,
          needs_escalation = EXCLUDED.needs_escalation,
          issue_summary = EXCLUDED.issue_summary,
          callback_time_preference = EXCLUDED.callback_time_preference,
          call_outcome = EXCLUDED.call_outcome,
          execution_mode = EXCLUDED.execution_mode,
          test_run_id = EXCLUDED.test_run_id,
          source_order_id = EXCLUDED.source_order_id,
          test_overrides = EXCLUDED.test_overrides,
          analysis = EXCLUDED.analysis,
          metadata = EXCLUDED.metadata,
          raw_payload = EXCLUDED.raw_payload,
          updated_at = EXCLUDED.updated_at
      `,
      [
        createId("call_result"),
        companyId,
        followup?.id,
        event.callId,
        getRetellCallString(event.rawPayload, "public_log_url"),
        getRetellCallString(event.rawPayload, "recording_url"),
        getAnalysisString(event.analysis, "call_summary"),
        getAnalysisBoolean(event.analysis, "call_successful"),
        getAnalysisString(event.analysis, "user_sentiment"),
        getAnalysisString(event.analysis, "experience_sentiment"),
        getAnalysisString(event.analysis, "employee_sentiment"),
        getAnalysisBoolean(event.analysis, "review_requested"),
        getAnalysisBoolean(event.analysis, "review_consent"),
        getAnalysisString(event.analysis, "confirmed_email"),
        getAnalysisBoolean(event.analysis, "needs_escalation"),
        getAnalysisString(event.analysis, "issue_summary"),
        getAnalysisString(event.analysis, "callback_time_preference"),
        outcome,
        executionContext.executionMode,
        executionContext.testRunId,
        executionContext.sourceOrderId,
        JSON.stringify(executionContext.testOverrides),
        JSON.stringify(event.analysis),
        JSON.stringify(event.metadata),
        JSON.stringify(event.rawPayload),
        now,
      ],
    );

    if (followup) {
      await client.query(
        `
          UPDATE gensteel_review_agent.order_followups
          SET status = 'call_analyzed', call_outcome = $1, updated_at = $2
          WHERE id = $3
        `,
        [outcome, now, followup.id],
      );
    }
  });

  return { followupId: followup?.id, outcome };
}

export async function markOutcomeWorkflowRunning(
  env: ReviewAgentEnv,
  params: { callId: string; workflowInstanceId: string },
): Promise<void> {
  await withDatabase(env, async (client) => {
    await client.query(
      `
        UPDATE gensteel_review_agent.order_followups
        SET
          outcome_workflow_instance_id = $1,
          outcome_workflow_status = 'running',
          status = 'outcome_workflow_running',
          updated_at = $2
        WHERE company_id = $3 AND call_id = $4
      `,
      [
        params.workflowInstanceId,
        new Date().toISOString(),
        getCompanyId(env),
        params.callId,
      ],
    );

    await client.query(
      `
        UPDATE gensteel_review_agent.call_results
        SET
          outcome_workflow_instance_id = $1,
          workflow_started_at = COALESCE(workflow_started_at, $2),
          workflow_status = 'running',
          updated_at = $2
        WHERE company_id = $3 AND call_id = $4
      `,
      [
        params.workflowInstanceId,
        new Date().toISOString(),
        getCompanyId(env),
        params.callId,
      ],
    );
  });
}

export async function getOutcomeContext(
  env: ReviewAgentEnv,
  callId: string,
): Promise<ReviewOutcomeContext> {
  return withDatabase(env, async (client) => {
    const result = await client.query<{
      followup_id: string | null;
      order_id: string | null;
      call_id: string;
      call_outcome: string | null;
      customer_name: string | null;
      customer_email: string | null;
      customer_io_person_id: string | null;
      retell_public_log_url: string | null;
      retell_recording_url: string | null;
      call_summary: string | null;
      issue_summary: string | null;
      callback_time_preference: string | null;
      execution_mode: ExecutionMode;
      test_run_id: string | null;
      source_order_id: string | null;
      source_order_number: string | null;
      test_overrides: TestExecutionOverrides | null;
    }>(
      `
        SELECT
          f.id AS followup_id,
          COALESCE(f.source_order_id, r.source_order_id, f.order_id) AS order_id,
          r.call_id,
          r.call_outcome,
          f.customer_name,
          CASE
            WHEN COALESCE(f.execution_mode, r.execution_mode) = 'test'
              THEN COALESCE(f.test_overrides->>'recipientEmail', r.test_overrides->>'recipientEmail')
            ELSE COALESCE(r.confirmed_email, f.customer_email)
          END AS customer_email,
          f.customer_io_person_id,
          r.retell_public_log_url,
          r.retell_recording_url,
          r.call_summary,
          r.issue_summary,
          r.callback_time_preference,
          COALESCE(f.execution_mode, r.execution_mode) AS execution_mode,
          COALESCE(f.test_run_id, r.test_run_id) AS test_run_id,
          COALESCE(f.source_order_id, r.source_order_id) AS source_order_id,
          COALESCE(f.source_order_number, f.order_number) AS source_order_number,
          COALESCE(f.test_overrides, r.test_overrides) AS test_overrides
        FROM gensteel_review_agent.call_results r
        LEFT JOIN gensteel_review_agent.order_followups f
          ON f.company_id = r.company_id
          AND f.call_id = r.call_id
        WHERE r.company_id = $1 AND r.call_id = $2
        LIMIT 1
      `,
      [getCompanyId(env), callId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error(`No call result found for call ${callId}.`);
    }

    return {
      followupId: row.followup_id ?? undefined,
      orderId: row.order_id ?? undefined,
      callId: row.call_id,
      callOutcome: row.call_outcome ?? undefined,
      customerName: row.customer_name ?? undefined,
      customerEmail: row.customer_email ?? undefined,
      customerIoPersonId: row.customer_io_person_id ?? undefined,
      executionMode: row.execution_mode,
      testRunId: row.test_run_id ?? undefined,
      sourceOrderId: row.source_order_id ?? undefined,
      sourceOrderNumber: row.source_order_number ?? undefined,
      testOverrides: row.test_overrides ?? undefined,
      retellPublicLogUrl: row.retell_public_log_url ?? undefined,
      retellRecordingUrl: row.retell_recording_url ?? undefined,
      callSummary: row.call_summary ?? undefined,
      issueSummary: row.issue_summary ?? undefined,
      callbackTimePreference: row.callback_time_preference ?? undefined,
      isTestCall: row.execution_mode === "test",
    };
  });
}

export async function selectReviewEmailTemplate(
  env: ReviewAgentEnv,
  context: ReviewOutcomeContext,
): Promise<ReviewEmailTemplateSelection> {
  const companyId = getCompanyId(env);
  await ensureReviewEmailTemplates(env);

  return withTransaction(env, async (client) => {
    const allowGoogle = isGmailAddress(context.customerEmail);
    const rotationColumns = context.executionMode === "test"
      ? {
          sendCount: "test_send_count",
          lastSelectedAt: "test_last_selected_at",
        }
      : {
          sendCount: "send_count",
          lastSelectedAt: "last_selected_at",
        };
    const result = await client.query<{
      id: string;
      template_key: string;
      review_destination: string;
      customerio_transactional_message_id: string;
    }>(
      `
        SELECT
          id,
          template_key,
          review_destination,
          customerio_transactional_message_id
        FROM gensteel_review_agent.review_email_templates
        WHERE company_id = $1
          AND enabled = true
          AND (gmail_only = false OR $2 = true)
        ORDER BY ${rotationColumns.sendCount} ASC, ${rotationColumns.lastSelectedAt} ASC NULLS FIRST, template_key ASC
        LIMIT 1
        FOR UPDATE
      `,
      [companyId, allowGoogle],
    );

    const template = result.rows[0];
    if (!template) {
      throw new Error("No enabled review email templates are configured.");
    }

    await client.query(
      `
        UPDATE gensteel_review_agent.review_email_templates
        SET
          ${rotationColumns.sendCount} = ${rotationColumns.sendCount} + 1,
          ${rotationColumns.lastSelectedAt} = $1,
          updated_at = $1
        WHERE id = $2
      `,
      [new Date().toISOString(), template.id],
    );

    return {
      id: template.id,
      templateKey: template.template_key,
      reviewDestination: template.review_destination,
      customerioTransactionalMessageId: template.customerio_transactional_message_id,
    };
  });
}

export async function recordOutcomeAction(
  env: ReviewAgentEnv,
  params: {
    context: ReviewOutcomeContext;
    actionType: string;
    status: string;
    provider?: string;
    providerMessageId?: string;
    templateKey?: string;
    reviewDestination?: string;
    errorMessage?: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await withDatabase(env, async (client) => {
    await client.query(
      `
        INSERT INTO gensteel_review_agent.outcome_actions (
          id,
          company_id,
          order_followup_id,
          call_id,
          action_type,
          status,
          execution_mode,
          test_run_id,
          source_order_id,
          provider,
          provider_message_id,
          template_key,
          review_destination,
          error_message,
          payload,
          created_at,
          updated_at,
          completed_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15::jsonb, $16, $16, $17
        )
      `,
      [
        createId("action"),
        getCompanyId(env),
        params.context.followupId,
        params.context.callId,
        params.actionType,
        params.status,
        params.context.executionMode ?? "production",
        params.context.testRunId,
        params.context.sourceOrderId,
        params.provider,
        params.providerMessageId,
        params.templateKey,
        params.reviewDestination,
        params.errorMessage,
        JSON.stringify(params.payload ?? {}),
        now,
        params.status === "completed" ? now : null,
      ],
    );

    if (params.provider !== "slack" || params.status !== "completed") {
      return;
    }

    await client.query(
      `
        UPDATE gensteel_review_agent.order_followups
        SET slack_notified = true, updated_at = $1
        WHERE company_id = $2 AND call_id = $3
      `,
      [now, getCompanyId(env), params.context.callId],
    );
  });
}

export async function completeOutcomeWorkflow(
  env: ReviewAgentEnv,
  params: {
    callId: string;
    status: string;
    slackNotified?: boolean;
    callbackDueAt?: string;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await withDatabase(env, async (client) => {
    await client.query(
      `
        UPDATE gensteel_review_agent.order_followups
        SET
          status = $1,
          outcome_workflow_status = $1,
          slack_notified = slack_notified OR $2,
          callback_due_at = COALESCE($3, callback_due_at),
          callback_notified_at = CASE
            WHEN $1 = 'callback_notified' THEN $4
            ELSE callback_notified_at
          END,
          review_email_sent = CASE
            WHEN call_outcome = 'positive_review_email_needed' AND $1 = 'completed' THEN true
            ELSE review_email_sent
          END,
          needs_escalation = CASE
            WHEN $1 = 'needs_escalation' THEN true
            ELSE needs_escalation
          END,
          updated_at = $4
        WHERE company_id = $5 AND call_id = $6
      `,
      [
        params.status,
        params.slackNotified ?? false,
        params.callbackDueAt ?? null,
        now,
        getCompanyId(env),
        params.callId,
      ],
    );

    await client.query(
      `
        UPDATE gensteel_review_agent.call_results
        SET workflow_status = $1, workflow_completed_at = $2, updated_at = $2
        WHERE company_id = $3 AND call_id = $4
      `,
      [params.status, now, getCompanyId(env), params.callId],
    );
  });
}

export async function markOutcomeWorkflowFailed(
  env: ReviewAgentEnv,
  params: { callId: string; errorMessage: string },
): Promise<void> {
  const now = new Date().toISOString();
  await withDatabase(env, async (client) => {
    await client.query(
      `
        UPDATE gensteel_review_agent.order_followups
        SET
          status = 'outcome_workflow_failed',
          outcome_workflow_status = 'failed',
          last_error = $1,
          updated_at = $2
        WHERE company_id = $3 AND call_id = $4
      `,
      [params.errorMessage, now, getCompanyId(env), params.callId],
    );

    await client.query(
      `
        UPDATE gensteel_review_agent.call_results
        SET workflow_status = 'failed', updated_at = $1
        WHERE company_id = $2 AND call_id = $3
      `,
      [now, getCompanyId(env), params.callId],
    );
  });
}

async function ensureReviewEmailTemplates(env: ReviewAgentEnv): Promise<void> {
  const templates = [
    {
      templateKey: "consumer_affairs",
      reviewDestination: "consumer_affairs",
      customerioTransactionalMessageId: env.REVIEW_TEMPLATE_CONSUMER_AFFAIRS_MESSAGE_ID,
      gmailOnly: false,
    },
    {
      templateKey: "google",
      reviewDestination: "google",
      customerioTransactionalMessageId: env.REVIEW_TEMPLATE_GOOGLE_MESSAGE_ID,
      gmailOnly: true,
    },
    {
      templateKey: "better_business_bureau",
      reviewDestination: "better_business_bureau",
      customerioTransactionalMessageId: env.REVIEW_TEMPLATE_BBB_MESSAGE_ID,
      gmailOnly: false,
    },
  ].filter((template) => !!template.customerioTransactionalMessageId);

  if (templates.length === 0) {
    return;
  }

  const now = new Date().toISOString();
  await withDatabase(env, async (client) => {
    for (const template of templates) {
      await client.query(
        `
          INSERT INTO gensteel_review_agent.review_email_templates (
            id,
            company_id,
            template_key,
            review_destination,
            customerio_transactional_message_id,
            gmail_only,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
          ON CONFLICT (company_id, template_key) DO UPDATE SET
            customerio_transactional_message_id = EXCLUDED.customerio_transactional_message_id,
            review_destination = EXCLUDED.review_destination,
            gmail_only = EXCLUDED.gmail_only,
            updated_at = EXCLUDED.updated_at
        `,
        [
          createId("template"),
          getCompanyId(env),
          template.templateKey,
          template.reviewDestination,
          template.customerioTransactionalMessageId,
          template.gmailOnly,
          now,
        ],
      );
    }
  });
}

function isGmailAddress(email: string | undefined): boolean {
  if (!email) {
    return false;
  }

  const domain = email.split("@").at(1)?.toLowerCase();
  return domain === "gmail.com" || domain === "googlemail.com";
}

function toTestCallSummary(row: TestCallHistoryRow): TestCallSummary {
  return {
    testRunId: row.test_run_id ?? "",
    sourceOrderId: row.source_order_id ?? undefined,
    sourceOrderNumber: row.source_order_number ?? undefined,
    orderNumber: row.order_number ?? undefined,
    callId: row.call_id ?? undefined,
    outcome: row.call_outcome ?? undefined,
    followupStatus: row.followup_status,
    workflowStatus: row.workflow_status ?? undefined,
    retellPublicLogUrl: row.retell_public_log_url ?? undefined,
    retellRecordingUrl: row.retell_recording_url ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    actions: readTestCallActions(row.actions),
  };
}

function readTestCallActions(value: unknown): TestCallActionSummary[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const action = readRecord(item) as TestCallActionRow;
    const actionType = readString(action.actionType);
    const status = readString(action.status);

    if (!actionType || !status) {
      return [];
    }

    return {
      actionType,
      status,
      provider: readString(action.provider),
      reviewDestination: readString(action.reviewDestination),
      createdAt: readString(action.createdAt),
      completedAt: readString(action.completedAt),
    };
  });
}

async function findFollowupByCallOrOrder(
  env: ReviewAgentEnv,
  params: { callId?: string; orderId?: string },
): Promise<OrderFollowupRow | null> {
  return withDatabase(env, async (client) => {
    const companyId = getCompanyId(env);

    if (params.callId) {
      const byCall = await client.query<OrderFollowupRow>(
        `
          SELECT
            id,
            order_id,
            call_id,
            status,
            customer_email,
            customer_io_person_id,
            execution_mode,
            test_run_id,
            source_order_id,
            source_order_number,
            test_overrides
          FROM gensteel_review_agent.order_followups
          WHERE company_id = $1 AND call_id = $2
          LIMIT 1
        `,
        [companyId, params.callId],
      );

      if (byCall.rows[0]) {
        return byCall.rows[0];
      }
    }

    if (!params.orderId) {
      return null;
    }

    return getOrderFollowupByOrderId(client, companyId, params.orderId);
  });
}

async function getOrderFollowupByOrderId(
  client: Queryable,
  companyId: string,
  orderId: string,
): Promise<OrderFollowupRow | null> {
  const result = await client.query<OrderFollowupRow>(
    `
      SELECT
        id,
        order_id,
        call_id,
        status,
        customer_email,
        customer_io_person_id,
        execution_mode,
        test_run_id,
        source_order_id,
        source_order_number,
        test_overrides
      FROM gensteel_review_agent.order_followups
      WHERE company_id = $1 AND order_id = $2
      LIMIT 1
    `,
    [companyId, orderId],
  );

  return result.rows[0] ?? null;
}

function readExecutionContext(
  followup: OrderFollowupRow | null,
  metadata: Record<string, unknown>,
): {
  executionMode: ExecutionMode;
  testRunId?: string;
  sourceOrderId?: string;
  testOverrides: TestExecutionOverrides;
} {
  if (followup) {
    return {
      executionMode: followup.execution_mode,
      testRunId: followup.test_run_id ?? undefined,
      sourceOrderId: followup.source_order_id ?? undefined,
      testOverrides: followup.test_overrides ?? {},
    };
  }

  return readExecutionContextFromMetadata(metadata);
}

function readExecutionContextFromMetadata(metadata: Record<string, unknown>): {
  executionMode: ExecutionMode;
  testRunId?: string;
  sourceOrderId?: string;
  testOverrides: TestExecutionOverrides;
} {
  const executionMode = metadata.execution_mode === "test" || metadata.gensteel_test_call === "true"
    ? "test"
    : "production";

  return {
    executionMode,
    testRunId: readString(metadata.test_run_id),
    sourceOrderId: readString(metadata.source_order_id),
    testOverrides: {
      recipientEmail: readString(metadata.test_recipient_email),
      recipientName: readString(metadata.test_recipient_name),
      escalationEmail: readString(metadata.test_escalation_email),
      callbackDelaySeconds: readPositiveInteger(metadata.test_callback_delay_seconds),
    },
  };
}

function getRetellCallString(rawPayload: unknown, fieldName: string): string | undefined {
  const payload = readRecord(rawPayload);
  const call = readRecord(payload.call) ?? payload;
  const value = call[fieldName];

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return undefined;
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
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

function readPositiveInteger(value: unknown): number | undefined {
  const rawValue = typeof value === "number" ? value : Number(readString(value));

  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return undefined;
  }

  return Math.round(rawValue);
}
