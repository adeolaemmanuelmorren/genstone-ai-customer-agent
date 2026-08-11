# Implementation Next Steps

The planning decisions are complete. There are no remaining owner questions in
the tool or storage checklist.

## 1. Foundation

- [x] Create PlanetScale migrations for calls, provider events, tool executions,
  and outcomes.
- [x] Add the private R2 bucket binding.
- [x] Build the signed Retell webhook route.
- [x] Archive the full payload in R2 and save its key in PlanetScale.
- [x] Add source-owned Customer.io email routing.

## 2. Tool Integrations

- [x] Salesforce contact and employee lookup.
- [x] WooCommerce order and shipment lookup.
- [x] Customer.io callback, shipment, and internal case-notice emails.
- [x] Zendesk creates one new private answering-service ticket for each
  confirmed existing-order support call. The prior open-ticket matching and
  update design was removed.
- [x] Five9 do-not-call suppression using `FIVE9_USERNAME` and
  `FIVE9_PASSWORD`; live suppression validation passed.

## 3. Retell Agent

- [x] Build the documented Conversation Flow definition.
- [x] Configure warm Twilio transfers, whisper, caller-number display, and
  fallback.
- [x] Attach only approved knowledge.
- [x] Configure the GenSteel-derived voice and model settings.
- [x] Create and read back the Retell draft agent through the API. The approved
  build uses dedicated, versioned GenStone shared subflows because Retell's API
  returns stable ids for shared subflows but exposes no usable id for embedded
  local subflows. These subflows must never be reused by another agent or
  edited in place; a changed release creates new versioned names and ids.
- [x] Publish GenStone agent version `0`, bind the purchased Retell-managed
  Twilio number for inbound calls, and update the production Doppler
  from-number setting.
- [x] Rebuild the repository definition with deterministic routing:
  new-project follow-up retains its prospect/callback behavior; unresolved
  existing orders → Zendesk. Remove every existing-order callback edge from the
  graph.
- [x] Update the Zendesk write contract: Support group, no
  assignee, Type `Question`, normal priority, Ticket Type `Answering Service`,
  explicit `answer_connect`, field-derived `answering_service` and caller-type
  tags, plus Customer Name, Phone, caller type, and Country when known.
- [x] Deploy repository release `v5` to update the existing unpublished Retell
  agent draft with complete provider readback.
- [x] Run the fully mocked Retell call-path suite. All nine scenarios pass with
  deterministic tool-call assertions.
- [x] Replace the node-per-turn draft with Retell release `v17`: multi-turn
  Subagents for ordinary dialogue, silent nodes only for atomic lookup/write/
  transfer gates, and one post-verification shipment/support router. The final
  ten-scenario batch passed with zero deterministic violations.
- [x] Deploy Retell release `v26`: collect caller name first; skip the
  new-project/existing-order question when the caller already answered it;
  use route-neutral contact lookup; keep order item and email verification to
  separate turns; route damage and other service problems by the help being
  requested rather than incidental shipping words; and create support or
  prospect follow-up without redundant contact or summary confirmation.
- [x] Deploy Retell release `v36`: announce the order lookup with the approved
  courtesy sentence; speak the verified item summary once; ask the caller to
  state the order email and compare it silently; collect support details with
  one open question; write Zendesk silently; and use one fixed team-follow-up
  sentence before the normal goodbye.
- [x] Deploy Retell release `v37`: confirm caller ID by its last four digits;
  use fixed order-item, alternate-lookup, and email-verification sentences;
  add a brief empathetic damage acknowledgment; and keep Zendesk ticket ids in
  internal persistence without returning them to Retell.
- [x] Deploy Retell release `v38`: switch the default cascading model from
  `gpt-5.2` to `gpt-5.5` while retaining high priority and temperature `0.2`.
- [x] Deploy Retell release `v39`: put the approved static lookup sentence on
  both order Function nodes so Retell cannot ask what the caller needs while
  an order lookup is still pending.
- [x] Deploy Retell release `v40`: use a separate static announcement before
  each silent order lookup; exclude WooCommerce quotes from newest-order
  selection; verify the order by its items; and collect an email only when the
  caller accepts a shipment-details email.
- [x] Deploy Retell release `v41`: add phone-first Salesforce contact lookup
  with a confirmed-email fallback; require confirmed email for prospect,
  callback, and Zendesk writes; attach the customer as Zendesk requester; and
  send the Customer.io shipment carrier as `provider`.
- [x] Deploy Retell release `v42`: continue rejected order matching through an
  order-number or next-recent-order path; use explicit extraction before
  support, callback, and prospect writes; ignore rejected order context in
  Zendesk; and use a support-specific write-failure response.
- [x] Deploy Retell release `v43`: allow exact order-number lookup for
  quote-status WooCommerce records; keep actual orders ahead of quotes for
  phone matching; speak natural item quantities; and answer unavailable
  shipment status without forcing damage/support intake.
- [x] Deploy Retell release `v44`: exclude quote-status drafts from every order
  lookup and give the approved processing-order shipment response when
  tracking is not yet available.
- [x] Deploy Retell release `v45`: identify stored sample and explicitly
  signaled retail candidates, ask for an order number at most once, continue
  through all remaining non-quote phone candidates, and reuse an already
  stated unresolved-order issue instead of asking for more details.
- [x] Deploy Retell release `v46`: reduce the main canvas from 34 to 22 nodes
  and every shared responsibility to one focused Subagent plus one exit. Keep
  backend verification, idempotency, quote exclusion, and write guards while
  removing node-per-turn contact, order, support, callback, prospect, and
  transfer state machines.
- [x] Remove the dedicated support-photo field from Retell, the Worker schema,
  Zendesk comments, and internal email data. Make support writes silent so
  they do not announce a generic lookup message.
- [ ] Run live phone-path and Twilio transfer QA on the bound number before
  wider rollout.

### Superseded Retell Draft — 2026-08-09

- Agent: `agent_f8bfef2720fa80075ac99b6a46`
- Conversation Flow: `conversation_flow_4bd447d96757`, version `0`
- Knowledge base: `knowledge_base_032c34629284ba5d`

The old flow listed above predates the deterministic owner routing and must not
be published. Release `v5` updated the existing agent draft and created eight
versioned shared components plus Conversation Flow
`conversation_flow_04211cf21adf`, version `0`. Complete provider readback and
the nine-scenario mocked suite passed. The agent remains unpublished and has no
phone-number binding.

## 4. Validation

- Run every path in the Retell test matrix.
- Verify Twilio transfer behavior.
- Verify R2 and PlanetScale persistence.
- Verify Zendesk remains internal-only.
- Publish the pinned Retell version.

The Worker is deployed as Cloudflare version
`efd62f82-5dcc-4ea6-9faa-da0ce0aa8a96`. Reliability migration `0003` is
applied. Retell release `v49` uses Conversation Flow
`conversation_flow_99fd9a4d70ac`, version `0`; agent version `0` is published
and pinned to the purchased inbound number. Live phone-path and Twilio transfer
QA remain launch work. The Customer.io messages remain drafts pending launch
validation and activation.
