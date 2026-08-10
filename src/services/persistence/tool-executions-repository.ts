import type { ToolResult } from "../../types/tool-result";
import type { Queryable } from "./db";

export interface ToolExecutionRecord {
  id: string;
  shouldExecute: boolean;
  executionStatus: string;
  executionOk?: boolean;
  resultCode?: string;
  safeSummary?: string;
  data?: Record<string, unknown>;
}

export async function beginToolExecution(
  db: Queryable,
  input: {
    companyId: string;
    callId: string;
    toolName: string;
    idempotencyKey?: string;
    requestSha256: string;
  },
): Promise<ToolExecutionRecord> {
  const id = crypto.randomUUID();
  const leaseId = crypto.randomUUID();
  const result = await db.query<{
    id: string;
    execution_status: string;
    result_code: string | null;
    safe_summary: string | null;
    caller_safe_data: Record<string, unknown> | null;
    result_ok: boolean | null;
    should_execute: boolean;
  }>(
    `
      with claimed as (
        insert into genstone_customer_agent.tool_executions (
          id,
          company_id,
          call_id,
          tool_name,
          idempotency_key,
          request_sha256,
          execution_status,
          lease_id
        ) values ($1, $2, $3, $4, $5, $6, 'started', $7)
        on conflict (company_id, call_id, tool_name, idempotency_key, request_sha256)
          where idempotency_key is not null
        do update set
          execution_status = 'started',
          result_code = null,
          safe_summary = null,
          caller_safe_data = null,
          result_ok = null,
          lease_id = excluded.lease_id,
          attempt_count = genstone_customer_agent.tool_executions.attempt_count + 1,
          completed_at = null,
          updated_at = now()
        where genstone_customer_agent.tool_executions.execution_status = 'failed'
           or (
             genstone_customer_agent.tool_executions.execution_status = 'started'
             and genstone_customer_agent.tool_executions.updated_at < now() - interval '30 seconds'
           )
        returning id, execution_status, result_code, safe_summary, caller_safe_data,
                  result_ok, true as should_execute
      )
      select * from claimed
      union all
      select id, execution_status, result_code, safe_summary, caller_safe_data,
             result_ok, false as should_execute
      from genstone_customer_agent.tool_executions
      where company_id = $2
        and call_id = $3
        and tool_name = $4
        and idempotency_key = $5
        and request_sha256 = $6
        and not exists (select 1 from claimed)
      limit 1
    `,
    [
      id,
      input.companyId,
      input.callId,
      input.toolName,
      input.idempotencyKey ?? null,
      input.requestSha256,
      leaseId,
    ],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Tool execution could not be started.");
  }

  return {
    id: row.id,
    shouldExecute: row.should_execute,
    executionStatus: row.execution_status,
    executionOk: row.result_ok ?? undefined,
    resultCode: row.result_code ?? undefined,
    safeSummary: row.safe_summary ?? undefined,
    data: row.caller_safe_data ?? undefined,
  };
}

export async function completeToolExecution(
  db: Queryable,
  id: string,
  result: ToolResult,
  externalReference?: string,
): Promise<void> {
  await db.query(
    `
      update genstone_customer_agent.tool_executions
      set execution_status = 'completed',
          result_ok = $2,
          result_code = $3,
          safe_summary = $4,
          caller_safe_data = $5::jsonb,
          external_reference = $6,
          completed_at = now(),
          updated_at = now()
      where id = $1
    `,
    [
      id,
      result.ok,
      result.result_code,
      result.safe_summary,
      JSON.stringify(result.data ?? {}),
      externalReference ?? null,
    ],
  );
}

export async function failToolExecution(
  db: Queryable,
  id: string,
  result: ToolResult,
): Promise<void> {
  await db.query(
    `
      update genstone_customer_agent.tool_executions
      set execution_status = 'failed',
          result_ok = false,
          result_code = $2,
          safe_summary = $3,
          completed_at = now(),
          updated_at = now()
      where id = $1
    `,
    [id, result.result_code, result.safe_summary],
  );
}
