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
- [ ] Bind the production phone number. The Retell account currently has no
  phone number and the configured from-number value is not valid E.164.
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
- [ ] Run live phone and Twilio transfer QA before publishing.

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
`838b96f1-9ae0-4a1e-adc9-63d6015905e9`, and its production health endpoint
passed. Reliability migration `0003` and Retell release `v5` are deployed and
verified by production readback. Production phone binding and live call-path
and Twilio transfer QA remain launch blockers. The Customer.io messages remain
drafts pending launch validation and activation.
