import type { Queryable } from "./db";

export async function recordOutcome(
  db: Queryable,
  input: {
    companyId: string;
    callId: string;
    outcomeType: string;
    outcomeStatus: string;
    toolExecutionId: string;
    provider?: string;
    externalReference?: string;
    safeSummary: string;
  },
): Promise<void> {
  await db.query(
    `
      insert into genstone_customer_agent.outcomes (
        id,
        company_id,
        call_id,
        outcome_type,
        outcome_status,
        tool_execution_id,
        provider,
        external_reference,
        safe_summary
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      crypto.randomUUID(),
      input.companyId,
      input.callId,
      input.outcomeType,
      input.outcomeStatus,
      input.toolExecutionId,
      input.provider ?? null,
      input.externalReference ?? null,
      input.safeSummary,
    ],
  );
}
