# QA Validation

## Foundation Checks

1. Run `npm run typecheck`.
2. Run `npm run cloudflare:deploy:dry-run`.
3. Start `npm run cloudflare:dev`.
4. Request `GET /health` and confirm the product name and timestamp.
5. Inspect `cloudflare.logs` for the health-check path and unexpected errors.

## Required Checks Before A Provider Integration

- Provider webhook signature is verified against the exact raw body.
- Production webhooks do not accept manual testing bypass credentials.
- Runtime schemas reject missing required event and entity identifiers.
- Duplicate delivery and retry behavior is tested.
- Provider success followed by persistence failure cannot duplicate the action.
- Test mode cannot contact customers or mutate production CRM records.
- Logs redact email, phone, address, transcripts, recordings, and raw payloads.
- Retell, R2, and PlanetScale have no automatic deletion or lifecycle-expiry
  configuration.
- An authenticated Retell webhook writes the exact raw body to private R2 and a
  matching object key/checksum/size to PlanetScale.
- R2 failure produces a retryable webhook failure and no false completed state.
- Retrying the same event reuses its provider-event row and deterministic R2
  key rather than creating duplicate objects.
- PlanetScale does not contain a duplicate full-payload JSON column.

## Required Call-Agent Scenarios

When a conversation platform is selected, build golden tests around the
GenStone handbook before publishing:

- New project intake and centralized callback scheduling.
- Existing order lookup and Zendesk follow-up without asking for a callback
  date or time.
- Zendesk field and tag mapping: Support group, no assignee, Type `Question`,
  normal priority, Ticket Type `Answering Service`, `answer_connect`, caller
  type, Customer Name, Phone, and Country when known.
- Existing-order close says customer service responds by the end of the next
  business day without mentioning a case or ticket.
- Named-person transfer with route-aware failure fallback.
- Product question with verified fact versus required escalation.
- Return, refund, RGA, warranty, and damage intake without approval promises.
- Retailer/Pro Desk intake.
- Billing intake without payment-card collection.
- Wrong-number, DNC, silent-call, and bad-connection closure.

Record test ids, provider run URLs, database side effects, and expected versus
actual outcomes for every release candidate.

## Local Reliability Validation — 2026-08-10

- Twelve test files with thirty-eight tests pass.
- Worker and Retell TypeScript checks pass.
- The Wrangler production-shape dry run completes and reports the expected
  Hyperdrive, private R2, environment, and company bindings. Wrangler cannot
  write its optional desktop log file inside the restricted Codex sandbox, but
  the bundle and binding validation complete successfully.
- Release `v3` checks every repository-owned Retell configuration field during
  provider readback and has a regression test proving a stale prompt is
  rejected even when node IDs match.
- The local Doppler session is not authenticated, so migration `0003`, Retell
  `v3` deployment/readback, and live phone-call validation remain release
  operations rather than locally claimed successes.

## Live Integration Check — 2026-08-09

- Signed Salesforce contact reads by email, phone, and the production
  phone-then-email fallback completed with `not_found` for the authorized test
  identity.
- Signed Salesforce employee read completed with `ambiguous`, confirming the
  provider path without exposing employee records.
- Signed WooCommerce order read completed with `not_found` for the authorized
  test phone.
- Shipment read was not run because there was no candidate order and the test
  must not forge item and masked-email confirmations.
- A private, clearly labeled authorized Zendesk QA ticket was created for
  `adeola@datastacklabs.com` and found in a separate Zendesk read-back.
- The Zendesk creation path received Customer.io acceptance for its internal
  case-created notice. Acceptance is not proof of inbox delivery.
- Five9 DNC suppression for the authorized test phone completed successfully
  through the signed Worker route using `FIVE9_USERNAME` and
  `FIVE9_PASSWORD`.
- The first Retell local-subflow attempt wrote nothing because the API rejected
  the unresolved local component id atomically.
- After explicit approval of dedicated shared subflows, Retell created all
  eight immutable GenStone `v1` subflows, Conversation Flow
  `conversation_flow_4bd447d96757` version `0`, and draft agent
  `agent_f8bfef2720fa80075ac99b6a46`.
- The deployment command separately read back the agent and flow and verified
  that every component node points to the expected shared id. The agent remains
  unpublished and has no phone number binding.
- Seven automated test files with fourteen tests passed. The Worker and
  Retell-specific strict TypeScript checks also passed.
- The Retell call-path matrix and live Twilio transfer behavior remain untested
  because the account has no bound phone number.
