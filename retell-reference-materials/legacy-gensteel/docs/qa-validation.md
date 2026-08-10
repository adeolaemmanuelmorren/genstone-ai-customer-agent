# QA Validation

## Local Worker Smoke

1. Start the Worker with `npm run cloudflare:dev`.
2. Call `GET /health`.
3. Call `POST /api/test/web-call` with a real Salesforce order and an explicit
   test recipient email.
4. Inspect the response for a Retell `callId` and `accessToken`.
5. Verify an `order_followups` row exists with `execution_mode = 'test'`,
   `test_run_id`, and the real order in `source_order_id`.
6. Verify no Salesforce records changed.

Do not call `POST /api/call-customer` for smoke testing unless a real outbound
phone call should be created and the Retell from-number is configured.

## Retell Webhook Smoke

1. Send a representative `call_analyzed` payload to `/api/retell-webhook`.
2. Inspect the HTTP response for `ok: true`.
3. Inspect `cloudflare.logs` for the Retell event type, call id, and outcome.
4. Verify `webhook_events` and `call_results` rows exist.
5. Verify `REVIEW_OUTCOME_WORKFLOW` starts for test and production calls.
6. For test web calls, verify Customer.io and Cloudflare Email recipients use
   explicit test overrides, not Salesforce customer fields.
7. Verify Slack includes `[TEST]`, `test_run_id`, source order, Retell log URL,
   and recording URL when available.
8. Verify `outcome_actions` rows include `execution_mode = 'test'`.

## Production Cutover Checks

- Hyperdrive binding exists and points at the intended PlanetScale database.
- `ORDER_LIFECYCLE_WORKFLOW` binding exists and exports `OrderLifecycleWorkflow`.
- `CALL_CUSTOMER_WORKFLOW` binding exists and exports `CallCustomerWorkflow`.
- `REVIEW_OUTCOME_WORKFLOW` binding exists and exports `ReviewOutcomeWorkflow`.
- `EMAIL` send binding is configured with a verified sender.
- Retell agent webhook URL points at the deployed Worker
  `/api/retell-webhook` route.
- Customer.io `AI Review Flow` has webhook actions for `/api/check-order-delivery`
  and `/api/call-customer` with the real Worker service bearer token.
- Customer.io `AI Review Flow` stores `journey_order_id` before the first email
  and waits for `Order Delivered` where event `order_id` matches that journey
  attribute.
- Customer.io transactional message ids are configured for ConsumerAffairs,
  Google, and BBB templates.
- Slack channel id and bot token are configured.
- Production logs show order lifecycle, call-customer, and Retell webhook processing without
  leaking secrets.

## Known Gaps

- Callback waiting depends on Retell returning a callback time preference that
  `Date.parse` can read. Ambiguous natural language preferences are persisted
  and Slack-notified without sleeping.
