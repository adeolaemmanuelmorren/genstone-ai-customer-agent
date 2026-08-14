# Owner Test Call Findings and Correction Plan

The owner's three test calls showed context-loss and transition problems, not a
need for more prompt rules. The `v66` rebuild addresses those problems
by changing ownership boundaries. The live `v64` flow remains documented below
as deployment history.

## Findings and corrections

| Finding | Cause | Current correction |
| --- | --- | --- |
| Email was rejected as an order lookup value | Lookup was split into rigid identifier paths | The verification owner accepts phone, email, or order number |
| Talking over the agent did not stop it | Low interruption setting and long responses | Preserve `0.85` interruption sensitivity and keep responses short |
| Agent ended after a second request | Multiple paths could close independently | One closure owner; only Retell End says goodbye |
| Long pauses between answers | Fragmented transitions plus slow WooCommerce searches | Use one explicit component boundary per responsibility and keep direct WooCommerce reads |
| Spoken grouped digits were misheard | Search ran before natural confirmation | Confirm newly dictated lookup values before searching |
| New projects did not transfer | Project and callback responsibilities were fragmented | One new-project owner checks hours, transfers, or schedules fallback |
| Existing-order escalation was inconsistent | Transfer and Zendesk lacked a reliable fallback boundary | One escalation owner tries both service lines, then routes to one support-follow-up owner |
| Visualizer answer became a monologue | Knowledge retrieval appeared in operational turns | Knowledge is node-scoped and answers only the current question |
| Email was requested repeatedly | Multiple components each owned confirmation | Confirm email only where operationally required and reuse it |
| Damage details were lost during verification | Handoffs depended on extracted summary variables | The owning component uses Retell's conversation history and the server-confirmed order token |

## v66 rebuild decisions

- Retell conversation history is the source for what the caller already said.
  Do not maintain a rolling request or call-context summary.
- Component-specific exit results and verified-order state remain small
  deterministic routing state. A one-time `pending_request` carries only a
  newly switched request and is cleared by the receiving owner.
- DNC is classified by initial intake and handled by a normal component. It is
  not a global interruption.
- A generic request for a person is a terminal global handoff path. New
  projects transfer to the coordinator or fall back to callback; existing
  orders transfer to customer service or fall back to Zendesk.
- A named-employee request is a separate global interruption. A failed or
  declined transfer returns to the exact prior node with Retell Go Back.
- Callback and Zendesk writes receive a one-time factual summary generated from
  the available conversation when the tool is called. This is a tool argument,
  not continuously extracted flow state.

## v64 implemented boundary

- `S_New_Project` owns business hours, transfer, and callback.
- `S_Order_Verification` owns order lookup, candidate selection, and confirmation.
- `S_Existing_Order_Help` owns the caller's request and knowledge answer.
- `S_Shipment_Help` owns shipment lookup and the optional tracking email.
- `S_Customer_Service_Escalation` owns business hours and both service lines.
- `S_Support_Follow_Up` owns contact matching and the Zendesk follow-up.
- `S_Close_Or_Continue` owns the single “Is there anything else…” question.
- `S_Knowledge_Answer` is the only general knowledge answerer.
- `record_support_follow_up` creates the first Zendesk ticket and appends later
  related details as private comments.

The existing-order boundaries do not use extracted summaries to pass the issue
between nodes. Retell's conversation history preserves the caller's words, and
the Worker stores the confirmed order against the call-scoped token.

Operational transitions are deterministic. Interactive nodes only ask or
confirm information. Separate tool-only nodes execute order confirmation,
shipment lookup/email, business-hours checks, callback scheduling, Zendesk
follow-up, employee lookup, and DNC writes. Those execution nodes use Retell's
reserved skip-response transition into small result branches, so an agent
cannot announce a cross-node action without actually invoking its tool.

## Measured tool times that drove the decision

| Operation | Reviewed duration |
| --- | ---: |
| Business-hours check | 90 ms |
| Callback | 296 ms |
| Contact lookup | 567 ms |
| Shipment lookup | 677 ms |
| Zendesk creation | 1.17 s |
| WooCommerce order lookup | 2.7–9.8 s |

WooCommerce remains the only order system. The flow removes redundant provider
lookups and retains candidates within the call, but does not maintain a copied
order index.

## Deployment state

Retell `v64` is published and bound inbound and outbound to `+1 720-799-2976`.
The Worker is deployed at `https://genstone-ai-customer-agent.travis-m.workers.dev`.

The v64 main canvas is an orchestrator, not a conversation owner. It contains
only component entries, result routers, global interruptions, and the final end
node. Eleven shared components each own one responsibility and always return to
the main canvas before another responsibility begins. Components do not link
into one another's internal nodes. The 398 obsolete GenStone shared components
were removed after v64 was published.

Three generated-voice calls were run. The first two exposed a callback closure
failure and a support-email variable mismatch. Long manual reply gaps also
triggered Retell silence reminders, so reminder repeats were not treated as
normal caller behavior. The third call exposed two opening regressions and was
stopped early. Those corrections are incorporated into `v64` through the
focused responsibility components described above:

- closes a scheduled callback from the successful callback tool result;
- passes newly spoken operational emails directly to the relevant tool;
- disables global Retell speech normalization while explicitly spelling an
  order-lookup email character by character for confirmation;
- asks “What can I help you with?” when an existing-order request is missing;
- starts order verification with caller-ID last-four confirmation; and
- does not claim a support action was recorded before the tool succeeds.

For order lookup by email, the agent says every character, says “at” and “dot,”
and waits for confirmation before searching. After a correction, it spells the
complete corrected address again before searching. All operational tool-only
steps run as Retell function nodes so they cannot generate an extra response
before their deterministic result branches. Fixed completion messages speak
once and then transition automatically. A bare “yes” at the final help check
receives “Please go ahead” instead of a second “How can I help?” question.

No additional call or simulation was run while publishing `v64`.

## v66 superseded draft

The rebuilt `v66` draft was created without publishing or phone binding:

- Agent: `agent_aff1d212bc7fce93d36a8c0abc`
- Conversation Flow: `conversation_flow_f6b94204af86`, version `0`
- Nine immutable subflows passed provider readback.
- No Retell call or paid simulation was run.

The draft is superseded by the `v67` clean-canvas build because `v66` relied on
Retell auto-layout and embedded transfer tools. Do not publish or bind `v66`.

## v67 clean-canvas draft

The replacement `v67` draft was created without publishing, phone binding,
calls, or simulations:

- Agent: `agent_6361f738f0db11c11e28fcd410`
- Conversation Flow: `conversation_flow_dd94122b40ee`, version `0`
- Nine immutable subflows passed provider readback.
- Every main-flow and subflow node has an explicit display position.
- Transfers are visible Call Transfer nodes with explicit failure paths.

This draft is superseded by local release `v68`. The new release removes the
generic Close or Continue component: New Project, Existing Order, and General
Knowledge each keep same-context follow-up questions inside their own subflow.
Understand Request is initial intake only. Do not publish or bind `v67`.

## v68 responsibility-owned continuation draft

The `v68` draft was created without publishing, phone binding, calls, or
simulations:

- Agent: `agent_8b046ee2a101562736f6822a9f`
- Conversation Flow: `conversation_flow_0716a0a4a349`, version `0`
- Eight immutable subflows passed provider readback.
- Understand Request is initial intake only.
- New Project, Existing Order, and General Knowledge own their same-context
  continuation internally.

The `v68` draft is superseded by local `v69`, which keeps later same-project
questions in New Project without restarting transfer or callback handling. Do
not publish or bind `v68`.

## v69 superseded provider draft

- Agent: `agent_4863348a135c633285041a504b`
- Conversation Flow: `conversation_flow_193ce1ce720d`, version `0`
- Eight immutable subflows passed provider readback.
- Published: no
- Phone number bound: no
- Calls or simulations run: none

The owner-edited New Project canvas is the current source. Its
`S_Project_Knowledge` node now waits for the caller and handles repeated
same-project questions. It has no Skip User Response edge and advances to
transfer/callback handling only when the questions are finished, human
follow-up is requested, or approved knowledge cannot answer. Provider readback
verified the in-place component update.

## v70 local candidate

- Removes `current_context` entirely.
- Uses only `new_project_next`, `existing_order_next`, or `knowledge_next` for
  normal component exits.
- Captures one `pending_request` only when responsibility changes. New Project,
  Existing Order, or General Knowledge consumes it and immediately clears it in
  a silent Retell code node.
- Human Escalation performs its own one-time `human_request_type`
  classification from the conversation.
- A Customer.io callback delivery failure attempts a private Slack alert to
  Travis. A notified or unnotified system failure states one terminal message
  and exits; it never returns to project continuation.
- No call or paid simulation has been run for this local candidate.

## v71 graph cleanup candidate

- Merges the successful new-project callback statement into the owning
  continuation subagent, which now says the result and asks for additional
  project questions in one turn.
- Routes every callback delivery failure through one terminal message.
- Replaces terminal statement-to-silent-exit chains in Human Escalation, Named
  Employee, and DNC with speaking component exits.
- Preserves the separate shipment, support, and knowledge result boundaries
  that feed the shared existing-order continuation; merging those would risk
  replaying stale result speech.
- No call or paid simulation has been run for this local candidate.
