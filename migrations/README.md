# Product Migrations

Product-owned PlanetScale migrations for the `genstone_customer_agent` schema
live here and run in numeric order through `npm run db:migrate:prod`.

Do not copy the GenSteel review-agent schema. New migrations must include
company scoping, explicit idempotency constraints, indexes for operational read
paths, and generated database types.

`0003_reliability_and_call_analysis.sql` changes the original execution ledger
to use recoverable leases and call-and-request-scoped idempotency, adds
searchable Retell post-call fields, and removes the unused support-case token
table.

`0004_order_candidate_sets.sql` groups the candidates returned by one order
search, preserves their caller-safe type and status summaries, and indexes the
call-scoped sequence so a rejected candidate can advance without another
WooCommerce request.
