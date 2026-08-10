# Product Schema

## Ownership

The product schema is `gensteel_review_agent`.

It owns Retell review follow-up orchestration state only. Auth/core tables stay
in Bradford shared schemas, and GenSteel social-image tables stay in
`gensteel_social_image`.

## Tables

| Table | Purpose |
| --- | --- |
| `order_followups` | One row per GenSteel order follow-up attempt. Stores idempotency, Retell call id, order/customer context, and outcome flags. |
| `webhook_events` | Provider event ledger for Retell webhook idempotency and replay inspection. |
| `call_results` | Normalized post-call analysis fields, Retell log/recording URLs, and raw Retell analysis payload. |
| `review_email_templates` | DB-backed Customer.io transactional template rotation state. Tracks destination, Gmail-only eligibility, send count, and last selection. |
| `outcome_actions` | Per-provider action ledger for Customer.io email, Cloudflare escalation email, Slack, and callback notifications. |

## Conventions

- Every row has `company_id`.
- Runtime SQL is schema-qualified.
- `order_followups` is idempotent by `(company_id, order_id)`.
- Test follow-ups use `order_id = test_run_id` and keep the real Salesforce
  order in `source_order_id`.
- Retell webhook idempotency uses `(provider, provider_event_id)` when Retell
  sends an event id.
- Review email template rotation prefers the lowest `send_count`, then the
  oldest `last_selected_at`.
- Test review email template rotation uses `test_send_count` and
  `test_last_selected_at` so production round-robin state is not consumed.
- Google review templates are only eligible for `gmail.com` and
  `googlemail.com` recipients.
- Product migrations live in `migrations/`.

## Migration

Start with [0001_create_gensteel_review_agent.sql](../migrations/0001_create_gensteel_review_agent.sql),
then apply the numbered migrations in order.
Generate product DB types after the migration flow is finalized.
