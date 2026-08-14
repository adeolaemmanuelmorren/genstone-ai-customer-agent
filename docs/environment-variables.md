# Environment Variables And Bindings

This document lists configuration names and ownership, never secret values.

## Cloudflare Bindings

| Name | Owner | Required | Purpose | Missing behavior |
| --- | --- | --- | --- | --- |
| `HYPERDRIVE` | Cloudflare binding | Yes for product persistence | Connects the Worker to the shared PlanetScale Postgres database. | Database helpers fail closed. |
| `CALL_ARCHIVE_BUCKET` | Cloudflare R2 binding | Yes for Retell webhook ingestion | Stores the exact authenticated Retell webhook body as a private JSON object. PlanetScale stores the object key and archive metadata. | The webhook must fail retryably before business processing; do not discard the payload or mark the event completed. |

`CALL_ARCHIVE_BUCKET` is a Worker binding, not a Doppler secret or string
environment variable. It is bound in `wrangler.jsonc` to the private bucket
`genstone-ai-customer-agent-call-archive`. Do not introduce R2 access-key
secrets for normal Worker binding access.

The current Hyperdrive binding uses the shared Bradford config id defined in
`wrangler.jsonc`. Product SQL must remain schema-qualified.

## Wrangler Static Vars

| Name | Owner | Required | Purpose |
| --- | --- | --- | --- |
| `ENVIRONMENT` | Wrangler `vars` | Yes | Selects production versus development logging behavior. |
| `GENSTONE_COMPANY_ID` | Wrangler `vars` | Yes | Company scope for GenStone-owned rows. Defaults to `genstone` in local helpers. |
| `LOG_LEVEL` | Wrangler `vars` or local Doppler injection | No | Overrides `debug`, `info`, `warn`, or `error`. |

## Worker Integration Secrets

| Name | Owner | Required | Purpose | Missing behavior |
| --- | --- | --- | --- | --- |
| `GENSTONE_AI_CUSTOMER_AGENT_WORKER_API_KEY` | Worker secret | Required when protected routes exist | Authenticates internal and backend-to-backend calls. | Protected routes return `401`. |
| `CLOUDRUN_SALESFORCE_API_KEY` | Worker secret | Yes for Salesforce tools | Authenticates requests to the Salesforce adapter. | Contact and employee-directory lookups fail closed. |
| `CLOUDRUN_SALESFORCE_API_URL` | Worker secret/config | Yes for Salesforce tools | Base URL for the Salesforce adapter. | Salesforce tools are unavailable. |
| `CUSTOMERIO_APP_API_KEY` | Worker secret | Yes for transactional email | Authorizes Customer.io transactional sends. | Callback, case-created, and shipment emails fail closed. |
| `CUSTOMERIO_TRACK_API_KEY` | Worker secret | Only if Track API events are used | Authorizes Customer.io Track API calls. | Track API events are unavailable; transactional App API sends are unaffected. |
| `CUSTOMERIO_TRACK_SITE_ID` | Worker secret/config | Only if Track API events are used | Identifies the Customer.io Track workspace/site. | Track API events are unavailable. |
| `FIVE9_USERNAME` | Worker secret/config | Yes for DNC | Dedicated Five9 administrator username. | DNC suppression fails closed. |
| `FIVE9_PASSWORD` | Worker secret | Yes for DNC | Password for the dedicated Five9 administrator. The Worker constructs the HTTP Basic header. | DNC suppression fails closed. |
| `RETELL_API_KEY_GENSTONE` | Doppler command secret | Yes for Retell management/API operations | Authenticates GenStone Retell API calls from the draft deployment command. It is not uploaded to the Worker. | Retell API operations are unavailable. |
| `RETELL_FROM_NUMBER_GENSTONE` | Doppler command config | Yes for GenStone telephony | GenStone Retell phone number used by call operations. It is not uploaded to the Worker. | Phone operations requiring the configured number are unavailable. |
| `RETELL_WEBHOOK_API_KEY_GENSTONE` | Worker secret | Yes for Retell webhooks and custom functions | Retell-designated webhook API key used to verify `X-Retell-Signature`. | Webhooks and custom functions must be rejected. |
| `SLACK_BOT_TOKEN` | Worker secret | Yes for callback-failure escalation | Authenticates the private Slack alert sent to Travis when Customer.io cannot schedule a callback. | The callback still ends safely, but the agent must not claim the team was notified. |
| `WOO_CONSUMER_KEY` | Worker secret | Yes for WooCommerce tools | WooCommerce REST consumer key. | Order and shipment lookups fail closed. |
| `WOO_CONSUMER_SECRET` | Worker secret | Yes for WooCommerce tools | WooCommerce REST consumer secret. | Order and shipment lookups fail closed. |
| `ZENDESK_GENSTONE_API_EMAIL` | Worker secret/config | Yes for tracked support | Canonical Zendesk API identity email. The client authenticates as `<email>/token`. | Case lookup/create/update fails closed. |
| `ZENDESK_GESNTONE_API_TOKEN` | Worker secret | Yes for tracked support | Zendesk API token. The misspelling is the existing production Doppler name and is retained deliberately until a coordinated secret migration. | Case lookup/create/update fails closed. |

Do not introduce `ZENDESK_GENSTONE_API_TOKEN` as a second token name. The
runtime contract uses `ZENDESK_GENSTONE_API_EMAIL` for the email and the exact
legacy token key `ZENDESK_GESNTONE_API_TOKEN` for the token.

`RETELL_WEBHOOK_SECRET_GENSTONE` is obsolete. Retell signs webhooks and custom
function calls with the workspace's designated webhook API key. Store that
exact key under `RETELL_WEBHOOK_API_KEY_GENSTONE`; do not create an unrelated
shared secret.

The Retell account has one purchased Retell-managed Twilio number.
`RETELL_FROM_NUMBER_GENSTONE` matches that E.164 number in production Doppler.
The number's inbound route is pinned to published GenStone agent version `0`;
it does not follow an unpinned `latest` alias.

## Local Command Configuration

| Name | Owner | Required | Purpose |
| --- | --- | --- | --- |
| `BETTER_AUTH_DATABASE_CONNECTION_STRING` | Doppler-injected migration command secret | Required for production migrations | Supplies the shared PlanetScale Postgres connection to `scripts/apply-sql-migration.mjs`. It is not uploaded to the Worker; production Worker access uses `HYPERDRIVE`. |
| `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` | Wrangler local binding emulator | Required for local database access | Supplies the local connection string for the binding named `HYPERDRIVE`. |

Local development uses Doppler config `dev`. Production secret synchronization
uses Doppler config `prd` and uploads secrets to Wrangler separately from the
deployment command.

The two generic internal-email names previously copied from GenSteel are not
part of the GenStone runtime contract and must not be added to Doppler,
Wrangler secrets, `.env`, or `CustomerAgentEnv`:

- `INTERNAL_STAFF_EMAIL_FROM`
- `INTERNAL_STAFF_EMAIL_TO`

Internal email sender, recipient, and transactional-message routing is
product-owned source configuration. The implementation should use one typed
source module rather than generic runtime overrides. The confirmed initial
routing is:

| Message | Sender | Recipient |
| --- | --- | --- |
| Callback request (`5`, template `75`, Customer.io identifier `genstone_callback_request_v2`) | `GenStone <projects@genstone.com>` | `appt@genstone.com` |
| Unmatched prospect (`6`, template `76`, Customer.io identifier `genstone_unmatched_prospect_v2`) | `GenStone <projects@genstone.com>` | `travis.m@genstone.com` |
| Shipment details (`7`, template `77`, Customer.io identifier `genstone_order_tracking_details_v2`) | `GenStone <projects@genstone.com>` | Confirmed WooCommerce order email at runtime |
| Support case created (`8`, template `78`, Customer.io identifier `genstone_support_case_created_v1`) | `GenStone <projects@genstone.com>` | `appt@genstone.com` |

The Customer.io identifier is a management label. It does not initiate a
send. The Worker explicitly sends the numeric transactional message id after
the corresponding confirmed action.

The four transactional messages are currently Customer.io drafts. Activation
is a launch action after preview and path validation; the backend must not
replace these source-owned ids or recipients with generic environment
variables.

The environment names above record responsibilities only, never values.

`CUSTOMERIO_APP_API_KEY` is the transactional-send credential. Do not assume
that the Track API key can replace it. `GENSTONE_AI_CUSTOMER_AGENT_WORKER_API_KEY`
is the full name of the variable that was visually truncated in the secret UI.
