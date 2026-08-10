import type { Queryable } from "./db";

export interface ProviderEventInput {
  id: string;
  companyId: string;
  providerEventId: string;
  eventType: string;
  callId?: string;
  payloadSha256: string;
  payloadSizeBytes: number;
}

export async function beginProviderEvent(
  db: Queryable,
  input: ProviderEventInput,
): Promise<{ id: string; processingStatus: string; archiveStatus: string }> {
  const result = await db.query<{
    id: string;
    processing_status: string;
    archive_status: string;
  }>(
    `
      insert into genstone_customer_agent.provider_events (
        id,
        company_id,
        provider,
        provider_event_id,
        event_type,
        call_id,
        payload_sha256,
        payload_size_bytes
      ) values ($1, $2, 'retell', $3, $4, $5, $6, $7)
      on conflict (company_id, provider, provider_event_id)
      do update set
        attempt_count = genstone_customer_agent.provider_events.attempt_count + 1,
        updated_at = now()
      returning id, processing_status, archive_status
    `,
    [
      input.id,
      input.companyId,
      input.providerEventId,
      input.eventType,
      input.callId ?? null,
      input.payloadSha256,
      input.payloadSizeBytes,
    ],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Provider event could not be started.");
  }

  return {
    id: row.id,
    processingStatus: row.processing_status,
    archiveStatus: row.archive_status,
  };
}

export async function markProviderEventArchived(
  db: Queryable,
  input: {
    id: string;
    objectKey: string;
    payloadSha256: string;
    payloadSizeBytes: number;
  },
): Promise<void> {
  await db.query(
    `
      update genstone_customer_agent.provider_events
      set payload_object_key = $2,
          payload_sha256 = $3,
          payload_size_bytes = $4,
          archive_status = 'archived',
          archived_at = now(),
          processing_status = 'processing',
          safe_error_code = null,
          updated_at = now()
      where id = $1
    `,
    [input.id, input.objectKey, input.payloadSha256, input.payloadSizeBytes],
  );
}

export async function markProviderEventFailed(
  db: Queryable,
  id: string,
  safeErrorCode: string,
): Promise<void> {
  await db.query(
    `
      update genstone_customer_agent.provider_events
      set processing_status = 'failed',
          safe_error_code = $2,
          updated_at = now()
      where id = $1
    `,
    [id, safeErrorCode],
  );
}

export async function markProviderEventCompleted(
  db: Queryable,
  id: string,
): Promise<void> {
  await db.query(
    `
      update genstone_customer_agent.provider_events
      set processing_status = 'completed',
          safe_error_code = null,
          processed_at = now(),
          updated_at = now()
      where id = $1
    `,
    [id],
  );
}
