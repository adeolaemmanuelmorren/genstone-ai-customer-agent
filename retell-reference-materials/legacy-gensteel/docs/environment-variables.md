# Environment Variables And Bindings

Do not commit secret values. Local secrets belong in Doppler `dev`; production
secrets belong in Wrangler secrets.

## Cloudflare Bindings

| Name                      | Owner          | Required                  | Purpose                                                                                                                        | Missing Behavior                                 |
| ------------------------- | -------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `HYPERDRIVE`              | Worker binding | Yes                       | Shared Bradford PlanetScale Hyperdrive binding, id `4f2b062305f141cba347166c4ee33c62`. Used for idempotency and outcome state. | Database calls fail closed.                      |
| `ORDER_LIFECYCLE_WORKFLOW` | Worker binding | Yes                      | Durable Salesforce Order lifecycle enrichment and Customer.io email identify plus `Order Created` / `Order Delivered` event emission. | `/api/order-created` and `/api/order-delivered` cannot start durable work. |
| `CALL_CUSTOMER_WORKFLOW`  | Worker binding | Yes                       | Durable Salesforce enrichment, idempotent follow-up reservation, and Retell outbound call orchestration.                         | `/api/call-customer` cannot start durable work.  |
| `REVIEW_OUTCOME_WORKFLOW` | Worker binding | Yes                       | Durable post-call outcome orchestration.                                                                                       | `call_analyzed` webhooks cannot trigger actions. |
| `EMAIL`                   | Worker binding | Yes for staff notifications | Cloudflare Email Service send binding for internal post-call staff emails.                                                     | Internal staff email cannot send.                |

Bradford Worker products reuse the same Hyperdrive config id and keep product
ownership separated by schema-qualified SQL.

## Wrangler Vars

| Name                                          | Owner  | Required                         | Purpose                                                                          | Missing Behavior                                      |
| --------------------------------------------- | ------ | -------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `ENVIRONMENT`                                 | Worker | Recommended                      | Runtime label for logs and diagnostics.                                          | Defaults are less explicit.                           |
| `GENSTEEL_COMPANY_ID`                         | Worker | Recommended                      | Company scope for product rows.                                                  | Defaults to `gensteel`.                               |
| `RETELL_AGENT_ID`                             | Worker | Yes                              | Retell draft agent to use for outbound calls.                                    | Retell create-call fails.                             |
| `RETELL_MULTI_PROMPT_AGENT_ID`                | Worker | Optional for test calls          | Optional Retell multi-prompt draft agent used when `prompt_agent = multi_prompt`. | Multi-prompt test-call creation fails closed.          |
| `RETELL_API_BASE_URL`                         | Worker | Optional                         | Retell API base URL.                                                             | Defaults to `https://api.retellai.com`.               |
| `CUSTOMERIO_WORKSPACE_ID`                     | Worker | Recommended                      | Customer.io workspace id that owns the AI Review Flow campaign.                  | Docs and diagnostics are less explicit.               |
| `CUSTOMERIO_AI_REVIEW_FLOW_CAMPAIGN_ID`       | Worker | Recommended                      | Customer.io campaign id for the pre-call warm-up journey.                        | Docs and diagnostics are less explicit.               |
| `CUSTOMERIO_ORDER_CREATED_EVENT_NAME`         | Worker | Recommended                      | Customer.io event name that enters the warm-up campaign.                         | Defaults are less explicit.                           |
| `CUSTOMERIO_ORDER_DELIVERED_EVENT_NAME`       | Worker | Recommended                      | Customer.io event name emitted when Salesforce reports the order status changed to Delivered. | Defaults to `Order Delivered`.                        |
| `CUSTOMERIO_TRACK_API_BASE_URL`               | Worker | Optional                         | Customer.io Track API base URL for journey event ingestion.                      | Defaults to `https://track.customer.io`.              |
| `CUSTOMERIO_TRANSACTIONAL_API_BASE_URL`       | Worker | Optional                         | Customer.io App API base URL for transactional email.                            | Defaults to `https://api.customer.io`.                |
| `INTERNAL_STAFF_EMAIL_FROM`                   | Worker | Yes for post-call staff email     | Verified Cloudflare Email sender for internal post-call staff notifications.      | Internal staff email fails.                           |
| `INTERNAL_STAFF_EMAIL_TO`                     | Worker | Yes for post-call staff email     | Internal post-call staff recipients. Supports comma, semicolon, or whitespace-separated addresses. | Internal staff email fails.                           |
| `SLACK_REVIEW_AGENT_CHANNEL_ID`               | Worker | Yes for Slack notifications      | Slack channel for all post-call outcome notifications.                           | Slack notifications are skipped.                      |
| `REVIEW_TEMPLATE_CONSUMER_AFFAIRS_MESSAGE_ID` | Worker | Yes for ConsumerAffairs rotation | Customer.io transactional message id for ConsumerAffairs review requests.        | That destination is not seeded into rotation.         |
| `REVIEW_TEMPLATE_GOOGLE_MESSAGE_ID`           | Worker | Yes for Google rotation          | Customer.io transactional message id for Google review requests. Gmail-only.     | Google is not seeded into rotation.                   |
| `REVIEW_TEMPLATE_BBB_MESSAGE_ID`              | Worker | Yes for BBB rotation             | Customer.io transactional message id for Better Business Bureau review requests. | That destination is not seeded into rotation.         |
| `LOG_LEVEL`                                   | Worker | Optional                         | Structured logger minimum level.                                                 | Defaults to `debug` in development, otherwise `info`. |

## Wrangler Secrets

| Name                                      | Owner  | Required                    | Purpose                                                                        | Missing Behavior                       |
| ----------------------------------------- | ------ | --------------------------- | ------------------------------------------------------------------------------ | -------------------------------------- |
| `GENSTEEL_AI_REVIEW_AGENT_WORKER_API_KEY` | Worker | Yes                         | Service bearer token for manual service calls and the shared secret accepted from Salesforce as `x-salesforce-secret` on order lifecycle and delivery-check routes. | `/api/order-created`, `/api/order-delivered`, `/api/check-order-delivery`, and `/api/call-customer` reject requests. |
| `RETELL_API_KEY_GENSTEEL`                 | Worker | Yes                         | Retell REST API key for outbound call creation.                                | Call-customer flow fails.              |
| `RETELL_FROM_NUMBER_GENSTEEL`             | Worker | Yes                         | Retell phone number used as outbound caller.                                   | Call-customer flow fails.              |
| `RETELL_WEBHOOK_SECRET_GENSTEEL`          | Worker | Yes                         | Shared secret accepted on Retell webhook calls.                                | Retell webhook route returns `500`.    |
| `CUSTOMERIO_APP_API_KEY`                  | Worker | Yes for positive outcomes   | Customer.io App API bearer token for transactional email.                      | Review email send fails.               |
| `CUSTOMERIO_TRACK_SITE_ID`                | Worker | Yes for lifecycle identify/event emission | Customer.io Track API site id for identifying people by email and posting `Order Created` / `Order Delivered` journey events. | Order lifecycle workflows cannot identify people or emit Customer.io events. |
| `CUSTOMERIO_TRACK_API_KEY`                | Worker | Yes for lifecycle identify/event emission | Customer.io Track API key paired with `CUSTOMERIO_TRACK_SITE_ID`.              | Order lifecycle workflows cannot identify people or emit Customer.io events. |
| `CLOUDRUN_SALESFORCE_API_URL`             | Worker | Yes for lifecycle and call-customer workflows | Bradford Salesforce API base URL used to fetch full Order and Opportunity records. | Salesforce enrichment fails.         |
| `CLOUDRUN_SALESFORCE_API_KEY`             | Worker | Yes for lifecycle and call-customer workflows | Shared API key sent as `x-api-key` to the Bradford Salesforce API.             | Salesforce enrichment fails.         |
| `SLACK_BOT_TOKEN`                         | Worker | Yes for Slack notifications | Slack bot token for `chat.postMessage`. The deployed Wrangler secret must be kept in sync with Doppler; a stale or wrong Doppler value can break future secret syncs. | Slack notifications fail and are recorded in `outcome_actions`. |

## Obsolete Names

Do not introduce generic database names such as `DATABASE_URL` or
`DATABASE_CONNECTION_STRING`. New Worker database access uses `HYPERDRIVE`.

`NEGATIVE_ESCALATION_EMAIL_FROM` and `NEGATIVE_ESCALATION_EMAIL_TO` were
replaced by `INTERNAL_STAFF_EMAIL_FROM` and `INTERNAL_STAFF_EMAIL_TO` so all
post-call outcomes use one staff notification path.
