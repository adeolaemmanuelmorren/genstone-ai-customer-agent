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
- [x] Zendesk creates the first private answering-service ticket for an
  unresolved call and appends later related call details as private comments.
- [x] Five9 do-not-call suppression using `FIVE9_USERNAME` and
  `FIVE9_PASSWORD`; live suppression validation passed.

## 3. Retell Agent

- [x] Build the documented Conversation Flow definition.
- [x] Configure warm Twilio transfers, whisper, caller-number display, and
  fallback.
- [x] Attach only approved knowledge.
- [x] Configure the GenSteel-derived voice and model settings.
- [x] Build local Retell release `v53` with main-flow tools and four owning
  subagents. It has no shared-component transitions.
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
- [x] Create and provider-verify the immutable `v66` behavior rebuild with seven normal
  responsibility subflows, terminal Human Escalation, resumable Named Employee
  transfer, and intake-routed DNC. The draft is unpublished and unbound.
- [x] Replace `v66` auto-layout with the `v67` clean-canvas build. Every node
  has an explicit diagram-based position, and transfers are visible Call
  Transfer nodes with explicit failure edges.
- [ ] Run live phone-path and Twilio transfer QA on the bound number before
  wider rollout.
- [x] Create and provider-verify the immutable `v67` draft. Agent
  `agent_6361f738f0db11c11e28fcd410` uses Conversation Flow
  `conversation_flow_dd94122b40ee`, version `0`; it remains unpublished and
  unbound.
- [x] Build local `v68`: make Understand Request initial intake only; keep
  same-project follow-up inside New Project and additional general questions
  inside General Knowledge; remove the generic Close or Continue component.
- [x] Create and provider-verify the immutable `v68` draft. Agent
  `agent_8b046ee2a101562736f6822a9f` uses Conversation Flow
  `conversation_flow_0716a0a4a349`, version `0`; it remains unpublished and
  unbound.
- [x] Build local `v69`: keep later same-project questions in the New Project
  continuation subagent instead of restarting its transfer/callback sequence.
- [x] Create and provider-verify the immutable `v69` draft. Agent
  `agent_4863348a135c633285041a504b` uses Conversation Flow
  `conversation_flow_193ce1ce720d`, version `0`; it remains unpublished and
  unbound.
- [x] Build local `v70`: pass a one-time `pending_request` between responsibility
  components, clear it immediately after the destination consumes it, remove
  `current_context`, and terminate callback-delivery failures after attempting
  a private Slack alert.
- [x] Build local `v71`: merge callback success into New Project continuation,
  consolidate callback failure speech, and replace terminal statement-to-silent-
  exit chains with speaking component exits.
- [x] Build local `v72`: use one responsibility router and one-time handoff,
  clear verified-order state at permanent handoffs, replace persistent result
  statuses with current-tool-result routing, use purpose-specific contact
  variables, split verified and unverified support writes, derive caller last
  four silently, and hide raw shipment/contact provider data from Retell.
- [x] Build local `v73`: accept one unique eligible Salesforce employee from a
  partial-name search; when several employees match, ask once for the full
  name, retry, and then resume the interrupted conversation if no unique match
  is found.
- [x] Build local `v74`: move every conversational extraction into a dedicated
  Extract Dynamic Variables node, validate captured values with equation
  transitions, fail closed on unknown intake and human-request classifications,
  and remove automatic knowledge-answer skip transitions.
- [ ] Apply and provider-verify `v74`; no paid call or simulation is required for
  the configuration readback.
- [ ] Obtain owner approval before publishing `v74` and repinning the live
  number.

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
`64a23a61-f2ab-4ead-983e-c0a53ca08d81`. Reliability migration `0003` is
applied. The latest inspected production call used published GenStone agent
`agent_4863348a135c633285041a504b`, agent version `2`, and Conversation Flow
`conversation_flow_193ce1ce720d`, version `2`, named for release `v73`.
Live phone-path and Twilio transfer QA remain launch work. The Customer.io
messages remain drafts pending launch validation and activation.

The active local candidate is `v74`. The published agent currently uses `v73`;
`v74` supersedes it for the next deployment. No Retell call or paid simulation
was run for `v74`.
