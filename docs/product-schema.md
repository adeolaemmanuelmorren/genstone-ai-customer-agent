# Product Schema

## Ownership

The PlanetScale Postgres schema is:

```text
genstone_customer_agent
```

It owns customer-agent call sessions, provider-event pointers, durable action
state, tool execution records, safe provider references, outcomes, and product
audit events. Shared `auth` and `core` schemas remain owned by
`@bradford-road/db`.

## Current State

Migrations `0001_create_genstone_customer_agent.sql` and
`0002_order_candidate_phone.sql` are applied in production. Migration
`0003_reliability_and_call_analysis.sql` is the next release migration. It adds
recoverable execution leases, call-scoped payload-aware idempotency, indexed
post-call analysis, and removes the unused Zendesk case-reference table.

## Tables

| Table group | Purpose |
| --- | --- |
| `call_sessions` | One normalized operational record per Retell call, including the latest Retell event and searchable post-call outcome/capability-gap fields. |
| `provider_events` | Idempotent Retell event ledger with processing state and the private R2 object pointer. |
| `tool_executions` | Recoverable tool attempts, call-and-payload-scoped idempotency, safe result codes, provider references, and external-write state. |
| `order_candidates` | Opaque, expiring WooCommerce candidates and caller-safe verification hints. |
| `contact_references` | Opaque Salesforce contact references. |
| `outcomes` | Callback, shipment email, support, transfer, DNC, and other safe outcomes. |
| `audit_events` | Important state transitions and recoverable failures. |

## Required Conventions

- Every company-owned row includes `company_id`.
- Runtime SQL is schema-qualified.
- Provider event handling uses explicit received, processing, completed, and
  failed states.
- Idempotency keys protect every external write and retryable side effect. The
  database scope includes company, call, tool, key, and normalized request
  hash. Exact completed replays return the original result; corrected payloads
  receive a new execution; stale or failed attempts can be reclaimed.
- Exact Retell webhook bodies are retained in private R2, not PlanetScale JSON
  columns. PlanetScale stores the R2 object key and normalized searchable data.
- Provider archives and operational rows have no automatic deletion. Logs must
  still redact customer data and complete object keys.
- Product migrations live in this repository under `migrations/`.
- Generated database types are committed after migrations are applied.

The old GenSteel review schema is retained only as historical context under
`retell-reference-materials/legacy-gensteel` and is not the starting schema for
this product.

See [Call data storage](./call-data-storage.md) for the confirmed R2 and Retell
boundary.
