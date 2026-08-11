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

- Twelve test files with thirty-nine tests pass.
- Worker and Retell TypeScript checks pass.
- The Wrangler production-shape dry run completes and reports the expected
  Hyperdrive, private R2, environment, and company bindings. Wrangler cannot
  write its optional desktop log file inside the restricted Codex sandbox, but
  the bundle and binding validation complete successfully.
- Release `v5` checks every repository-owned Retell configuration field during
  provider readback and has a regression test proving a stale prompt is
  rejected even when node IDs match.
- Local checks do not replace the production deployment evidence recorded
  below.

## Production Release Check — 2026-08-10

- All eleven Worker secrets required by current routes synchronized to
  Cloudflare without storing values in the repository.
- Migrations `0001`, `0002`, and `0003` applied successfully through the shared
  PlanetScale connection.
- A read-only schema query found all seven product-owned tables and all five
  searchable call-analysis columns; the obsolete support-case reference table
  is absent.
- Cloudflare Worker version `838b96f1-9ae0-4a1e-adc9-63d6015905e9` deployed.
- `GET https://genstone-ai-customer-agent.travis-m.workers.dev/health`
  returned the expected `ok` product response.
- Retell release `v5` updated draft agent
  `agent_f8bfef2720fa80075ac99b6a46`, created Conversation Flow
  `conversation_flow_04211cf21adf` version `0`, created all eight versioned
  components, and passed complete provider readback.
- Mocked Retell batch `test_batch_a32f9872c257` passed all nine conversation
  scenarios with zero errors and zero deterministic tool-call violations. The
  deterministic gate independently requires shipment tools and rejects support
  or callback tools on shipment-email scenarios.
- The Retell draft remains unpublished and has no phone-number binding. Live
  call-path and Twilio transfer validation remain launch work.

## Production Correction Release v7 — 2026-08-10

- Cloudflare Worker version `e66d464f-69db-4326-b3ff-c0fbfa583075` deployed
  the resilient order-phone search and voice-safe email hint response.
- `GET https://genstone-ai-customer-agent.travis-m.workers.dev/health`
  returned the expected `ok` product response after deployment.
- Retell release `v7` updated draft agent
  `agent_f8bfef2720fa80075ac99b6a46`, created Conversation Flow
  `conversation_flow_5552f5cdaee0` version `0`, created all eight immutable
  `v7` shared components, and passed complete provider readback.
- Retell batch `test_batch_fd9fb63fc028` passed all ten conversation
  evaluations. The replacement-phone shipment regression did not read back the
  replacement phone, request an order or tracking number after finding the
  order, repeat tool speech, expose structured output, or speak mask
  characters/provider names. The technical order-lookup error regression used
  existing-order follow-up without requesting another identifier.
- The deterministic tool gate still reports that the unrelated named-employee
  web-call simulation bypassed `lookup_active_employee` before scheduling its
  callback. The prose evaluator passed that scenario, but the deterministic
  failure remains open and was not suppressed.
- The Retell draft remains unpublished and has no phone-number binding.

## Retell Simplification Release v17 — 2026-08-10

- Retell release `v17` updated unpublished draft agent
  `agent_f8bfef2720fa80075ac99b6a46`, created Conversation Flow
  `conversation_flow_5d6c5dc4c65a` version `0`, and created all eight
  immutable `v17` shared components.
- Retell provider readback matched the complete repository-owned
  configuration. The draft remains unpublished and has no phone-number
  binding.
- The main graph is 31 nodes. Ordinary shared paths use a multi-turn Subagent
  instead of separate conversation/extraction/branch nodes for every turn.
  Silent nodes remain only for atomic business gates: latest confirmed contact
  before lookup, confirmed data before support/callback writes, the
  post-verification shipment/support router, and the phone/web transfer split.
- Retell batch `test_batch_8f2f9c4b26ec` passed all ten conversation
  evaluations with zero errors and zero deterministic tool-call violations.
- The regression suite verified replacement-phone lookup without read-back,
  bounded order verification, shipment answer and shipment email, internal
  support after confirmed summary, callback after confirmed read-back, named
  employee lookup on a web call without transfer, prospect follow-up, DNC, and
  Visualizer knowledge.
- Local validation passed: 45 tests, main TypeScript, Retell TypeScript, and
  whitespace checks.

## Retell Order Lookup and Dialogue Release v19 — 2026-08-10

- Cloudflare Worker version `ac8442b0-320e-4881-b4bb-04a349dcc9bc` removed
  application-level provider timeouts. Retell is now the timeout owner for
  voice tools, with a 30-second custom-tool limit.
- The production signed order lookup for `9787999918` returned `found` in
  4,004 ms and produced a candidate order reference.
- Retell release `v19` updated unpublished draft agent
  `agent_f8bfef2720fa80075ac99b6a46`, created Conversation Flow
  `conversation_flow_9fc11e426b7a` version `0`, and created all eight immutable
  `v19` shared components.
- Provider readback confirmed `C_Greet_Name` as the start node, the separate
  new-project/existing-order routing question, deterministic function-first
  order lookup, and 30-second timeouts on both primary and alternate order
  tools.
- Local validation passed: 45 tests plus main and Retell TypeScript checks.
- The draft remains unpublished and has no phone-number binding.

## Retell Minimal Dialogue Release v23 — 2026-08-10

- Cloudflare Worker version `550abdff-7ff6-45e6-81b4-cb41ff062aa6` deployed
  the strict prospect and support tool contracts. The obsolete confirmation
  fields are rejected instead of being accepted as compatibility aliases.
- Retell release `v23` updates unpublished draft agent
  `agent_f8bfef2720fa80075ac99b6a46`, creates Conversation Flow
  `conversation_flow_d8bd1ff141ca` version `0`, and creates all eight immutable
  `v23` shared components.
- Provider readback passed. The flow asks for the caller's name first, avoids
  repeating a route the caller already supplied, keeps order lookup silent,
  verifies order items and email in separate turns, and gives support problems
  priority over incidental words such as “shipment” or “arrived.”
- Prospect and support writes use information already present in the call,
  ask only for genuinely missing essentials, and do not require ceremonial
  read-backs. Callback scheduling retains its explicit date, time, subject,
  and destination approval because that is a customer commitment.
- Browser-only named-employee fallback does not perform an unnecessary
  directory lookup because Retell cannot transfer a web call. Phone calls still
  resolve an independently named active employee before attempting a warm
  transfer.
- Mocked Retell batch `test_batch_d3d085e7bbfb` passed all ten conversation
  scenarios with zero errors and zero deterministic tool-call violations.
  The regression set covers replacement-phone lookup without repetition,
  direct shipment routing, damage-to-support routing, shipment email choice,
  prospect follow-up, callback approval, named-employee browser fallback, DNC,
  lookup failure, and Visualizer knowledge.
- Local validation passed: 46 tests, main TypeScript, Retell TypeScript, and
  whitespace checks.
- The draft remains unpublished and has no phone-number binding.

## Retell Natural Order Help Release v24 — 2026-08-10

- Cloudflare Worker version `2bf1b13f-8b6d-4134-8640-c0f6ef7dbaba` returns the
  complete candidate order email for confirmation and keeps tracking numbers
  out of the spoken shipment summary while retaining them for the email.
- Retell release `v24` updates unpublished draft agent
  `agent_f8bfef2720fa80075ac99b6a46`, creates Conversation Flow
  `conversation_flow_de82ad05b111` version `0`, and creates all eight immutable
  `v24` shared components.
- When the caller has not stated the problem, the agent asks only “What can I
  help you with?” It does not suggest shipping, damage, returns, departments,
  or other possible routes.
- Order verification reads the complete email naturally instead of shortening
  or masking it. Shipment speech gives carrier/date/count context without
  reading tracking numbers. A caller can confirm the order email or a different
  complete address for the tracking email.
- Provider readback passed. Local validation passed: 48 tests, main
  TypeScript, Retell TypeScript, and whitespace checks.
- The draft remains unpublished and has no phone-number binding.

## Retell Intent Routing Correction v25 — 2026-08-10

- Retell release `v25` updates unpublished draft agent
  `agent_f8bfef2720fa80075ac99b6a46`, creates Conversation Flow
  `conversation_flow_d1640f58735c` version `0`, and creates all eight immutable
  `v25` shared components.
- The already-stated existing-order intent is extracted as the bounded Retell
  enum `shipment`, `support`, or `unknown`. Free-form caller language remains
  unchanged, while downstream routing no longer depends on an exact generated
  phrase such as `support for damage`.
- A failed or unavailable shipment lookup exits without offering an email for
  data the tool did not return.
- Provider readback passed. Local validation passed: 48 tests, main
  TypeScript, Retell TypeScript, and whitespace checks.
- The draft remains unpublished and has no phone-number binding.

## Retell Pending-Action Completion v26 — 2026-08-10

- Retell release `v26` updates unpublished draft agent
  `agent_f8bfef2720fa80075ac99b6a46`, creates Conversation Flow
  `conversation_flow_871f971e68d4` version `0`, and creates all eight immutable
  `v26` shared components.
- New-project questions are answered from approved knowledge first. Specific
  quotes, prices, turnaround estimates, callbacks, and other unresolved
  requests enter the existing contact/prospect or callback path without the
  knowledge node collecting extra contact fields or claiming work succeeded.
- The global end-call node cannot close while an agreed follow-up, callback,
  email, support write, transfer, or suppression action remains incomplete.
- Mocked Retell batch `test_batch_475e3b93231d` passed all ten scenarios with
  zero errors and zero deterministic tool-call violations. It verifies full
  order-email confirmation, open-ended order help without a menu, concise
  shipment speech without tracking numbers, alternate shipment-email delivery,
  damage-to-support routing, and completed prospect follow-up before closing.
- Provider readback passed. Local validation passed: 49 tests, main
  TypeScript, Retell TypeScript, and whitespace checks.
- The draft remains unpublished and has no phone-number binding.

## Temporary Shipment Email Safety Override — 2026-08-10

- Cloudflare Worker version `a811bf50-ff49-4538-b75b-406171ae5985` deployed
  the override.
- The Customer.io shipment path is temporarily hardcoded in source to send
  only to `adeolamorren@gmail.com` for browser QA.
- The Worker ignores the caller-confirmed destination when selecting the
  actual Customer.io recipient. Retell still collects the address so the
  conversation can be tested, but no shipment email can reach that customer.
- Remove the override and its regression test before phone binding or launch.
- Local validation passed: 50 tests, main TypeScript, and whitespace checks.

## Retell Support Conversation v33 — 2026-08-10

- Retell release `v33` updates unpublished draft agent
  `agent_f8bfef2720fa80075ac99b6a46`, creates Conversation Flow
  `conversation_flow_8129781f72a2` version `0`, and creates all eight
  immutable `v33` shared components.
- Existing-order caller-ID confirmation now asks whether the number is correct
  for the order. A failed order lookup says the system may be having trouble,
  asks only for a brief description, and continues into the existing Zendesk
  follow-up path.
- Caller-facing prompts no longer narrate graph mechanics such as using edges,
  remaining in a node, determining the route, or finishing a flow. The global
  prompt now contains only grounding and strict disclosure/success safeguards.
- Tracked support is one reusable multi-turn conversation, not a collection of
  damage, return, warranty, or claim paths. When the problem is vague, the
  agent asks one relevant question about the issue before writing the ticket.
  It does not restart contact or order verification inside support.
- After the support write succeeds, the agent accurately says the details were
  sent internally and that customer service responds by the end of the next
  business day. It does not claim that it emailed the customer, recite contact
  details, expose Zendesk terminology, or leave while the caller still has a
  clarification question.
- The post-transfer fallback is a silent Logic Split, preventing an
  intermediate conversation node from inventing a different callback method.
- The open existing-order help node says exactly “What can I help you with?”
  before the caller replies. The final End node uses Retell's static
  speak-during-execution message to say goodbye before disconnecting.
- Mocked Retell batch `test_batch_d2780fa5acaf` passed all ten scenarios with
  zero errors and zero deterministic tool-call violations. The suite includes
  replacement-phone order lookup, technical order-lookup failure to Zendesk,
  a vague broken-order report followed by useful damage detail and an email
  clarification, shipment email, and web-transfer callback fallback. The
  technical lookup fallback also verifies that support does not request more
  phone, email, order, ZIP, address, or lookup details.
- Provider readback passed. Local validation passed: 52 tests plus main and
  Retell TypeScript checks.
- The draft remains unpublished and has no phone-number binding.

## Retell Support Cleanup v35 — 2026-08-10

- Worker version `cb597d7a-7a53-4083-a86a-32c806a8cde9` removes the dedicated
  support-photo field from request validation, Zendesk comments, and the
  internal case-created email data.
- Retell release `v35` updates unpublished draft agent
  `agent_f8bfef2720fa80075ac99b6a46` with Conversation Flow
  `conversation_flow_6a57344ac384` version `0`. Provider readback passed for
  the flow and all eight immutable `v35` components.
- The support write runs silently instead of speaking the generic “One moment
  while I check that” tool message. The support prompt has no photo-specific
  field or instruction.
- Batch `test_batch_4e820512777f` against `v34` proved the exact broken-order
  scenario asks for useful damage detail, does not mention photos, and sends
  the detailed issue summary. That batch exposed two strict contact/order-
  detail regressions; release `v35` restores that safeguard without adding a
  photo prohibition.
- A new `v35` simulation batch could not start because Retell returned `402
  Credit balance exhausted`. Local validation passed: 52 tests plus main and
  Retell TypeScript checks.

## Retell Order and Support Simplification v36 — 2026-08-10

- Read-only review of call `call_c3933761b7f194e8b87d24c8064` confirmed the
  agent read a malformed stored email, repeated the order items during support,
  used a multiple-choice damage question, repeated the support handoff, and
  ended by reciting the caller's phone.
- Retell release `v36` updates unpublished draft agent
  `agent_f8bfef2720fa80075ac99b6a46` with Conversation Flow
  `conversation_flow_3484e9becba7` version `0` and eight immutable `v36`
  components.
- Provider readback confirms the order lookup speaks “Thank you. Just give me a
  moment to look up your order.” The caller now states the order email, which
  is compared silently instead of reading the stored address aloud.
- Provider readback confirms support has one collection node, a silent Zendesk
  Function node, and the fixed close “I'm letting our team know, and they'll be
  in touch as soon as possible.” The collection prompt uses “What was broken?”
  and does not list the verified items.
- No Retell simulation, test scenario, web call, phone call, local automated
  test, or typecheck was run for `v36`, following the owner's instruction.
  Validation is limited to source inspection and non-billable provider
  readback.

## Retell Verification and Zendesk Reference Correction v37 — 2026-08-10

- Read-only review of call `call_01b8cf369e93a7875e5e6946270` confirmed the
  initial caller-ID prompt read the full number, the model invented a shipping
  ZIP lookup after an order was already found, the email request was too terse,
  and the final goodbye exposed Zendesk ticket `140736` from the tool result.
- Cloudflare Worker version `b0f35ace-80fe-43fe-b986-0e17f7874453` keeps the
  Zendesk reference in internal execution and outcome persistence but removes
  tool-result data before responding to Retell for the support route.
- Retell release `v37` updates unpublished draft agent
  `agent_f8bfef2720fa80075ac99b6a46` with Conversation Flow
  `conversation_flow_f3ceb3f21baa` version `0` and eight immutable `v37`
  components.
- Provider readback confirms last-four caller-ID confirmation, a fixed
  alternate lookup limited to phone or GenStone order number, a fixed item
  confirmation, the approved email-verification question, and the brief
  empathetic damage prompt.
- No Retell simulation, test scenario, web call, phone call, local automated
  test, or typecheck was run for `v37`, following the owner's instruction.
  Validation is limited to the source review, deployment result, and
  non-billable provider readback.

## Retell GPT-5.5 Model Release v38 — 2026-08-10

- Retell release `v38` updates unpublished draft agent
  `agent_f8bfef2720fa80075ac99b6a46` with Conversation Flow
  `conversation_flow_e44512270810` version `0` and eight immutable `v38`
  components.
- Provider readback confirms the default model is cascading `gpt-5.5` with
  high priority and temperature `0.2`.
- No business-flow, Worker, tool-contract, prompt, or knowledge-base behavior
  changed in this release.
- No Retell simulation, test scenario, web call, phone call, local automated
  test, or typecheck was run for `v38`, following the owner's instruction.
  Validation is limited to deployment and non-billable provider readback.

## Retell Order-Lookup Execution Speech Correction v39 — 2026-08-10

- Read-only review of call `call_778eb445c99e71de4c39e0284f8` confirmed the
  order Function node generated “How can I help?” while lookup was pending.
  The caller answered before the order result arrived, after which the normal
  item and email verification correctly resumed.
- Retell release `v39` updates unpublished draft agent
  `agent_f8bfef2720fa80075ac99b6a46` with Conversation Flow
  `conversation_flow_cbc1a6d4479c` version `0` and eight immutable `v39`
  components.
- Provider readback confirms both `F_Lookup_Order_By_Phone` and
  `F_Lookup_Order_Alternate` wait for their result and own the static execution
  sentence “Thank you. Just give me a moment to look up your order.”
- No business routing, verification, support, Worker, tool-contract, model, or
  knowledge-base behavior changed in this release.
- No Retell simulation, test scenario, web call, phone call, local automated
  test, or typecheck was run for `v39`, following the owner's instruction.
  Validation is limited to deployment and non-billable provider readback.

## Retell Order Selection And Just-in-Time Email v40 — 2026-08-10

- Read-only review of call `call_83e49e33186f26138c5e9200d2e` confirmed that
  phone `4015237056` matched the caller, but newest-by-time selection chose a
  newer WooCommerce quote instead of the latest completed purchase.
- Cloudflare Worker version `1cc8931c-aae0-42d9-a396-10d756433eb3` excludes
  quote records before selecting the newest order candidate.
- Retell release `v40` updates unpublished draft agent
  `agent_f8bfef2720fa80075ac99b6a46` with Conversation Flow
  `conversation_flow_5148fdff13f2` version `0` and eight immutable `v40`
  components.
- The order component uses a static skip-response announcement followed by a
  silent Function node, confirms the returned items once, and no longer asks
  for an email during universal order verification.
- Email is requested and confirmed only when the caller accepts the offer to
  receive shipment details. Support, callback, transfer, and prospect paths do
  not require it.
- Deployment performed exact provider readback of the created Retell
  components, flow, and agent. No Retell simulation, test scenario, web call,
  phone call, local automated test, or typecheck was run for `v40`, following
  the owner's instruction.

## Confirmed-Identifier And Silent Contact Correction v49 — 2026-08-10

- Retell release `v49` updated unpublished draft agent
  `agent_f8bfef2720fa80075ac99b6a46`, created Conversation Flow
  `conversation_flow_99fd9a4d70ac` version `0`, and created eight immutable
  `v49` shared components. Complete provider readback passed.
- Read-only review of web call `call_fb391998da7b3f889192aa3f9d4` found two
  primary order calls whose `identifier` was the unresolved literal
  `{{confirmed_phone}}`. Both correctly returned `validation_failed`; after
  Retell captured `7162137247`, the same lookup found the order.
- Primary, alternate, and next-order caller identifiers are now ordinary
  strict Retell tool arguments. They no longer depend on an extraction tool
  running before the lookup in the same Subagent turn.
- A successful Salesforce phone lookup no longer produces “I found your
  contact information.” The component uses that turn to collect the email
  already required by the follow-up path without narrating the CRM result.
- Damage-photo knowledge and routing were intentionally left unchanged at the
  owner's direction.
- No call, Retell simulation, or scenario test was run. Main and Retell
  TypeScript checks passed, and static graph/schema inspection found 21 nodes,
  no dangling destinations, and no dynamic-variable constant on any
  caller-supplied order identifier.

## Verified-Order Handoff Correction v48 — 2026-08-10

- Retell release `v48` updated unpublished draft agent
  `agent_f8bfef2720fa80075ac99b6a46`, created Conversation Flow
  `conversation_flow_b6f7de1f21eb` version `0`, and created eight immutable
  `v48` shared components. Complete provider readback passed.
- Read-only review of web call `call_ed0007745f424cd1e1b14ecc2c8` found that
  the order component spoke two verification responses 11.2 seconds apart.
  The caller's sample-arrival question was received before the component exit,
  so the next knowledge node answered from generic shipping policy instead of
  invoking `lookup_shipment`.
- The order component now uses one handoff sentence: “Great. What can I help
  you with?” It does not separately announce or repeat verification.
- One silent post-verification request branch is restored specifically at the
  Retell shared-component boundary. Arrival timing, including how long samples
  will take to arrive, routes to Shipment before the knowledge node can answer.
- No call, Retell simulation, or scenario test was run. Main and Retell
  TypeScript checks passed, and static graph inspection found 21 nodes with no
  dangling destinations.

## Simplified Retell Routing Release v47 — 2026-08-10

- Retell release `v47` updated unpublished draft agent
  `agent_f8bfef2720fa80075ac99b6a46`, created Conversation Flow
  `conversation_flow_c6a58287fa44` version `0`, and created eight immutable
  `v47` shared components.
- Complete provider readback passed. The draft remains unpublished and has no
  phone-number binding.
- Existing-order calls now confirm the order phone and verify WooCommerce
  before Salesforce contact lookup. Salesforce phone/email lookup runs only
  when the call is entering Tracked Support; shipment-only calls do not collect
  a Salesforce fallback email.
- One existing-order conversation node now reuses a request already stated or
  asks one open help question. The duplicate silent request classifier was
  removed.
- Failed or declined named-person transfers resume the ordinary verified-order,
  unverified-order, or new-project gates. They no longer jump directly to
  Callback or Tracked Support.
- Answered conversations and completed components now go directly to the
  Retell end node, which owns the single goodbye.
- The order-verification instruction is shorter. WooCommerce tools continue to
  own quote exclusion, candidate sequencing, and call-scoped order references.
- No call, Retell simulation, or scenario test was run. Main and Retell
  TypeScript checks passed, and a local static graph inspection found 20 nodes,
  no dangling destinations, and no obsolete duplicate-router or close nodes.

## Contact Email And Zendesk Requester Release v41 — 2026-08-10

- Cloudflare Worker version `4b6f66b9-3e03-4a84-b84e-54785267ffda` requires a
  confirmed email for callback, prospect, and Zendesk writes; attaches the
  confirmed customer name and email as the Zendesk requester; keeps the
  initial comment private; and sends shipment entries with Customer.io's
  expected `provider` field.
- Retell release `v41` updates unpublished draft agent
  `agent_f8bfef2720fa80075ac99b6a46` with Conversation Flow
  `conversation_flow_711d8ecf0c30` version `0` and eight immutable `v41`
  components.
- Salesforce contact lookup is phone-first. A `not_found` or `ambiguous`
  result asks for and confirms email once, then performs one silent email
  lookup. Technical lookup errors do not trigger another identifier request.
- Callback, unmatched-prospect follow-up, and Zendesk intake collect confirmed
  email at their action step. Transfer, DNC, universal order verification, and
  fully answered questions do not.
- Deployment performed exact provider readback of the created Retell
  components, flow, and agent. No Retell simulation, test scenario, web call,
  phone call, local automated test, or typecheck was run for `v41`, following
  the owner's instruction.

## Rejected Order And Deterministic Write Capture v42 — 2026-08-10

- Read-only review of call `call_258cec8b6f6a4af4af572f9f4df` confirmed that
  Retell correctly marked the presented order as rejected, but the old flow
  exited verification instead of checking another order. It also entered the
  support write without invoking its optional capture tool, leaving email,
  summary, and caller type unresolved and causing backend validation failure.
- Cloudflare Worker version `8e9c1306-4372-4a2d-926d-eac46ad57acf` supports a
  previous-candidate cursor for up to three recent non-quote phone matches and
  ignores unverified or rejected order context when building Zendesk intake.
- Retell release `v42` updates unpublished draft agent
  `agent_f8bfef2720fa80075ac99b6a46` with Conversation Flow
  `conversation_flow_c017069c442e` version `0` and eight immutable `v42`
  components.
- A rejected candidate asks for the GenStone order number. If unavailable, the
  flow checks the next recent candidate. Exhaustion uses support follow-up
  without linking a rejected order.
- Support asks about the issue and email in separate turns, confirms email
  once, and uses explicit extraction nodes before Zendesk. Callback and
  prospect writes likewise use explicit extraction rather than optional
  subagent capture tools.
- A support write failure now says specifically that the information could not
  be sent to customer service; it no longer uses the vague global “unable to
  complete that request” response.
- Deployment performed exact provider readback of the created Retell
  components, flow, and agent. No Retell simulation, test scenario, web call,
  phone call, local automated test, or typecheck was run for `v42`, following
  the owner's instruction.

## Exact Quote-Status Order And Shipment Routing v43 — 2026-08-10

- Read-only review of call `call_e2c06ff57d866d22685c6cf6885` confirmed that
  exact order number `2505000137613` was extracted correctly but rejected by
  the Worker's global quote exclusion. The live WooCommerce record exists with
  status `quote`, contains the caller-listed Chicago products, and has no
  tracking metadata.
- Cloudflare Worker version `03d97e80-af44-4927-8e91-9e1e5ba9cca7` allows an
  exact order-number lookup to return any WooCommerce status. Phone searches
  present actual orders before quote-status records, while still allowing
  quotes among subsequent candidates.
- Item summaries omit the multiplication symbol: quantity one speaks only the
  product name, and larger quantities use “units of.”
- Retell release `v43` updates unpublished draft agent
  `agent_f8bfef2720fa80075ac99b6a46` with Conversation Flow
  `conversation_flow_a8c439cc58e5` version `0` and eight immutable `v43`
  components.
- When a verified order has no tracking metadata, the shipment tool states the
  stored order status and that no shipment or arrival date is available. It
  does not ask what happened, create support follow-up, or offer a tracking
  email.
- Deployment performed exact provider readback of the created Retell
  components, flow, and agent. No Retell simulation, test scenario, web call,
  phone call, local automated test, or typecheck was run for `v43`, following
  the owner's instruction.

## Quote Draft Exclusion And Processing Shipment Response v44 — 2026-08-10

- Owner clarification supersedes the `v43` quote behavior: WooCommerce records
  with status `quote` are drafts and are excluded from phone, alternate, next,
  and exact order-number lookup.
- Cloudflare Worker version `95541030-5a1b-4fb6-96aa-147e4327d7bf` restores
  complete quote exclusion. For a verified `processing` order without tracking,
  it returns: “Your order is still processing. You will be notified by email
  once it is ready to be shipped.”
- Other statuses retain their actual stored status and do not get mislabeled as
  processing. Missing tracking does not force damage/support intake.
- Retell release `v44` updates unpublished draft agent
  `agent_f8bfef2720fa80075ac99b6a46` with Conversation Flow
  `conversation_flow_88ec5b2e148c` version `0` and eight immutable `v44`
  components.
- Deployment performed exact provider readback of the created Retell
  components, flow, and agent. No Retell simulation, test scenario, web call,
  phone call, local automated test, or typecheck was run for `v44`, following
  the owner's instruction.

## Candidate Classification And Single Order-Number Request v45 — 2026-08-10

- Read-only review of call `call_a5730b12ac803f4e08e98152bb9` confirmed two
  completed sample orders for the supplied phone. The Chicago Panel, Chicago
  Outside Corner, and Big Stretch White Caulking record was order
  `2505000137613` with status `quote`, so it remains excluded as a draft.
- The duplicate order-number question was structural: every rejected candidate
  returned to the same question. The flow now remembers an unavailable order
  number, asks at most once, and checks every remaining recent non-quote order
  for the confirmed phone without asking again.
- Candidate confirmation now identifies `gs_payroll_type=sample` as a sample
  order and uses the stored explicit retail signal for retail wording. Neither
  label replaces item confirmation.
- The unresolved-order support path now reuses a clearly stated issue. In
  particular, an arrival request already described by the caller does not
  trigger “What else can you tell me about the order or shipment?”
- Cloudflare Worker version `f50775fb-446e-4204-a25f-8fa0b11bb49b` and Retell
  release `v45` were deployed. The unpublished draft agent uses Conversation
  Flow `conversation_flow_135ebd4cee7f`, version `0`, with eight immutable
  `v45` components.
- Deployment performed exact provider readback of the created Retell
  components, flow, and agent. No Retell simulation, test scenario, web call,
  phone call, local automated test, or typecheck was run for `v45`, following
  the owner's instruction.

## Retell-Owned Conversation Simplification v46 — 2026-08-10

- The main canvas was reduced from 34 nodes to 22. The eight shared components
  were reduced from 55 total nodes to 16: one focused Subagent plus one exit
  for Contact Lookup, Order Verification, Prospect Follow-Up, Shipment,
  Tracked Support, Callback, Named Employee Transfer, and DNC.
- Backend guarantees remain unchanged: quote drafts are excluded, order
  candidates are sequential, item confirmation is required, order references
  are call-scoped, writes are schema-validated and idempotent, Zendesk requires
  confirmed email, and transfer targets come only from active Salesforce users.
- The opening always asks for the caller's name and then new project or
  existing order. It no longer extracts or routes a shipment/support intent
  from the name turn.
- Contact, order-candidate dialogue, support intake, callback intake, prospect
  intake, and named transfer now keep corrections, fact capture, tool calls,
  and caller-safe result speech inside their responsible Subagent.
- Generic human requests no longer jump directly around verification or
  primary-route gates. Only a caller-supplied employee name enters the named
  transfer component.
- Retell release `v46` updates unpublished draft agent
  `agent_f8bfef2720fa80075ac99b6a46` with Conversation Flow
  `conversation_flow_8d43cad67f04`, version `0`, and eight immutable `v46`
  components.
- Deployment performed exact provider readback of the created Retell
  components, flow, and agent. No Retell simulation, test scenario, web call,
  phone call, local automated test, or typecheck was run for `v46`, following
  the owner's instruction.

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

## GenStone Employee Transfer Scope — 2026-08-10

- Salesforce Cloud Run revision
  `bradford-salesforce-api-endpoint-00039-z8v` added company-scoped active User
  lookup and is serving 100 percent of traffic.
- `company=GenStone` restricts eligible Users to the GenStone, GenStone Manager,
  and GenStone Remote Access Salesforce profiles and requires a direct phone
  number. Unknown company values fail closed.
- Cloudflare Worker version `efd62f82-5dcc-4ea6-9faa-da0ce0aa8a96` makes every
  named-employee lookup with `company=GenStone`.
- The Salesforce API and Worker TypeScript checks passed, and the Worker dry-run
  packaged successfully before deployment.
- The existing Retell employee tool and transfer graph did not change, so no
  Retell flow release was created. No call, simulation, email, ticket, employee
  query, or transfer test was run.

## Production Retell Number Publication And Binding — 2026-08-11

- Retell inventory returned one purchased Retell-managed Twilio number,
  `(720) 799-2976`, with no prior inbound or outbound agent binding.
- GenStone agent `agent_f8bfef2720fa80075ac99b6a46` version `0` was published.
  It points to the verified `v49` Conversation Flow
  `conversation_flow_99fd9a4d70ac`, version `0`.
- The number's inbound route is pinned to that exact agent version with weight
  `1`. It does not use `latest` or `latest_published`, and outbound routing was
  left empty.
- Production Doppler `RETELL_FROM_NUMBER_GENSTONE` now matches the purchased
  E.164 number. Provider read-back confirmed publication and the exact inbound
  binding.
- No phone call, web call, transfer, simulation, email, ticket, or tool-path
  test was run. Live phone-path and Twilio transfer QA remain outstanding.

## Shipment Tracking Internal Copy — 2026-08-11

- Cloudflare Worker version `cee08de1-afa2-4c74-ac14-18cc8201033e` deployed the
  shipment-only BCC routing change.
- The temporary shipment-email safety override still sends the primary message
  only to `adeolamorren@gmail.com` instead of the caller-supplied address.
- The same Customer.io request now BCCs `travis.m@generalsteel.com`. Callback,
  prospect, and Zendesk case-notice recipient routing is unchanged.
- No email, call, Retell simulation, ticket, or live tool-path test was run.
