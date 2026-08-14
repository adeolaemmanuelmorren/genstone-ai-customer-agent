import type { Queryable } from "./db";

export async function findLatestOutcomeExternalReference(
  db: Queryable,
  input: {
    companyId: string;
    callId: string;
    outcomeType: string;
  },
): Promise<string | undefined> {
  const result = await db.query<{ external_reference: string | null }>(
    `
      select external_reference
      from genstone_customer_agent.outcomes
      where company_id = $1
        and call_id = $2
        and outcome_type = $3
        and external_reference is not null
      order by created_at desc
      limit 1
    `,
    [input.companyId, input.callId, input.outcomeType],
  );

  return result.rows[0]?.external_reference ?? undefined;
}

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
