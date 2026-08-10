# Call Data Storage

This document defines where GenStone call data is retained. Retell, Cloudflare
R2, and PlanetScale have separate responsibilities.

## Confirmed Launch Decisions

| Layer | Confirmed responsibility |
| --- | --- |
| Retell | Use **Everything** so Retell retains recordings, transcripts, logs, dynamic variables, and normal call artifacts. |
| Cloudflare R2 | Archive the exact full body of every authenticated Retell webhook as a private JSON object. |
| PlanetScale | Store normalized operational records and the R2 object key, checksum, size, and archive status. Do not duplicate the full webhook payload in a JSON column. |

The R2 webhook object contains the full Retell webhook payload, including any
recording or log URLs Retell sends. It does **not** contain the recording audio
itself. Retell owns the recording and transcript artifacts initially. Copying
recording files into R2 would be a separate approved capability.

## R2 Boundary

Use a private Worker R2 binding named `CALL_ARCHIVE_BUCKET`. Do not configure a
public bucket URL.

Use deterministic, opaque object keys with no customer name, phone, email,
order number, or issue text. Initial key shape:

```text
retell/webhooks/YYYY/MM/{call_id}/{provider_event_id_or_digest}.json
```

The Worker must not log the complete object key or payload. Store the exact raw
request body with content type `application/json` and a SHA-256 checksum.

## PlanetScale Boundary

The `genstone_customer_agent` schema should include a provider-event ledger.
Each Retell event row stores:

- `company_id`;
- provider and event type;
- provider event id and call id;
- `payload_object_key`;
- payload SHA-256 and byte size;
- archive status and archived timestamp;
- processing status, attempt/error context, and timestamps.

Call-session, tool-execution, transfer, callback, Zendesk, and audit tables store
their normalized searchable fields. Call sessions include the final route,
outcome, verification flag, and capability-gap summary from Retell post-call
analysis. They may reference the provider-event row; they do not copy the full
webhook JSON.

## Idempotent Webhook Lifecycle

After verifying `X-Retell-Signature` against the exact raw body:

1. Derive a stable provider-event identity and deterministic R2 key.
2. Insert or resume the PlanetScale event row with archive status `pending`.
3. Write the exact raw body to R2 using that key and checksum.
4. Mark the event `archived` with the key, checksum, size, and timestamp.
5. Parse and process the event into normalized product records.
6. Mark processing `completed` or `failed` without deleting the archived input.

If R2 archival fails, do not process the event as successful. Return a retryable
failure. A retry reuses the same event identity and object key. This makes an
R2-success/PlanetScale-failure or PlanetScale-success/R2-failure recoverable
without creating multiple archive objects.

## Retention

Store the records with no automatic deletion:

- Retell keeps recordings, transcripts, logs, and call artifacts.
- R2 keeps the full webhook payload objects with no lifecycle-expiration rule.
- PlanetScale keeps provider-event, call, tool, handoff, follow-up, and audit
  rows with no scheduled cleanup.

Deletion is not part of the normal call lifecycle. Any future deletion must be
a deliberate administrative operation, not an automatic expiration policy.
