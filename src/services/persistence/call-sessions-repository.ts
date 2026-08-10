import type { NormalizedRetellWebhook } from "../../schemas/retell-webhook";
import type { Queryable } from "./db";

export async function upsertCallSession(
  db: Queryable,
  companyId: string,
  event: NormalizedRetellWebhook,
): Promise<void> {
  if (!event.callId) {
    return;
  }

  await db.query(
    `
      insert into genstone_customer_agent.call_sessions (
        id,
        company_id,
        retell_call_id,
        direction,
        call_status,
        started_at,
        ended_at,
        caller_phone,
        called_phone,
        last_event_type,
        primary_route,
        call_outcome,
        order_verified,
        capability_gap_summary
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      on conflict (company_id, retell_call_id)
      do update set
        direction = coalesce(excluded.direction, genstone_customer_agent.call_sessions.direction),
        call_status = case
          when excluded.call_status = 'unknown'
            then genstone_customer_agent.call_sessions.call_status
          else excluded.call_status
        end,
        started_at = coalesce(excluded.started_at, genstone_customer_agent.call_sessions.started_at),
        ended_at = coalesce(excluded.ended_at, genstone_customer_agent.call_sessions.ended_at),
        caller_phone = coalesce(excluded.caller_phone, genstone_customer_agent.call_sessions.caller_phone),
        called_phone = coalesce(excluded.called_phone, genstone_customer_agent.call_sessions.called_phone),
        last_event_type = excluded.last_event_type,
        primary_route = coalesce(excluded.primary_route, genstone_customer_agent.call_sessions.primary_route),
        call_outcome = coalesce(excluded.call_outcome, genstone_customer_agent.call_sessions.call_outcome),
        order_verified = coalesce(excluded.order_verified, genstone_customer_agent.call_sessions.order_verified),
        capability_gap_summary = coalesce(excluded.capability_gap_summary, genstone_customer_agent.call_sessions.capability_gap_summary),
        updated_at = now()
    `,
    [
      crypto.randomUUID(),
      companyId,
      event.callId,
      event.direction ?? null,
      event.callStatus ?? "unknown",
      event.startedAt ?? null,
      event.endedAt ?? null,
      event.callerPhone ?? null,
      event.calledPhone ?? null,
      event.eventType,
      event.primaryRoute ?? null,
      event.callOutcome ?? null,
      event.orderVerified ?? null,
      event.capabilityGapSummary ?? null,
    ],
  );
}
