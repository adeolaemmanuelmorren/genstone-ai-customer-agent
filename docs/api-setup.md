# API Setup

## Current Routes

| Route | Class | Authentication | Purpose |
| --- | --- | --- | --- |
| `GET /health` | Public health | None | Liveness and deploy verification. |
| `POST /v1/retell/webhooks` | Provider webhook | `X-Retell-Signature` over the exact raw body | Archive and process Retell events. |
| `POST /v1/retell/tools/business-hours/status` | Retell tool | Worker bearer plus Retell signature | Determine live-transfer availability using GenStone's Mountain-time hours and standard holidays. |
| `POST /v1/retell/tools/contacts/lookup` | Retell tool | Worker bearer plus Retell signature | Salesforce contact lookup. |
| `POST /v1/retell/tools/employees/lookup` | Retell tool | Worker bearer plus Retell signature | Active employee lookup. |
| `POST /v1/retell/tools/orders/lookup` | Retell tool | Worker bearer plus Retell signature | WooCommerce order lookup by confirmed phone, exact email, or order number; retained-candidate traversal uses the same route. |
| `POST /v1/retell/tools/shipments/lookup` | Retell tool | Worker bearer plus Retell signature | Verified stored shipment lookup. |
| `POST /v1/retell/tools/callbacks/schedule` | Retell tool | Worker bearer plus Retell signature | Customer.io callback request with private Slack escalation on delivery failure. |
| `POST /v1/retell/tools/prospects/follow-up` | Retell tool | Worker bearer plus Retell signature | Internal Customer.io follow-up for a confirmed unmatched new prospect. |
| `POST /v1/retell/tools/shipments/email` | Retell tool | Worker bearer plus Retell signature | Customer.io shipment email. |
| `POST /v1/retell/tools/support/follow-up` | Retell tool | Worker bearer plus Retell signature | Create the call's first private Zendesk follow-up or append a private comment with related later details. |
| `POST /v1/retell/tools/dnc/suppress` | Retell tool | Worker bearer plus Retell signature | Five9 DNC suppression. |

## Route Classes

Future routes must use the Bradford Worker boundary:

| Class | Authentication |
| --- | --- |
| Internal/service routes | `Authorization: Bearer $GENSTONE_AI_CUSTOMER_AGENT_WORKER_API_KEY` |
| Human/frontend routes | Not present. Add only behind a trusted server boundary and verified Better Auth session. |
| Provider webhooks | Provider signature verification; no production manual-secret bypass. |

## Data Boundary

The Worker owns product API access and future product persistence. Browser code
must not query PlanetScale directly. External systems should send stable ids;
trusted services resolve customer, order, product, and ownership details.

## Conversation Provider Boundary

Retell Conversation Flow is selected. The signed webhook and tool endpoints are
implemented. The draft flow definition, approved capability and tool design,
and clearly labeled historical material live under
[`../retell-reference-materials`](../retell-reference-materials/README.md).

Retell webhooks and custom functions verify `X-Retell-Signature` against the
exact raw body using the workspace-designated Retell webhook API key. The
webhook archives
that body in private R2, persists the R2 object key and processing state in
PlanetScale, and only then processes normalized call outcomes. See
[Call data storage](./call-data-storage.md).
