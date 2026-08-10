# GenSteel Retell Voice Agent Handoff

## Current Status

We created the Retell side of the GenSteel post-order follow-up voice agent as a draft.

The agent is not published. The production webhook URL is configured on the
draft agent.

## Source Materials Reviewed

Repo files reviewed:

- `good-example-1-smarsh-call-2026-04-08-2-23-pm-7049842462.md`
- `good-example-2-smarsh-call-2026-04-23-2-46-pm-8013881351.md`
- `good-example-3-smarsh-call-2026-05-21-2-26-pm-2073701001.md`
- `notes.md`

The example calls show the desired Bruce-style pattern:

1. Ask for the customer by name.
2. Introduce Bruce from GenSteel.
3. Ask if now is a good time.
4. Follow up on the building order or delivery.
5. If the customer is positive, confirm the named employee did a five-star job.
6. If that is also positive, introduce the review request and $50 gift card promo.
7. Confirm the customer's email.
8. If the customer is not positive, do not ask for a review. Escalate and set expectation for a callback.

## Retell Assets Created With MCP

These were created through the `retell_gensteel` MCP.

```text
conversation_flow_id: conversation_flow_af26875307e6
conversation_flow_version: 0

agent_id: agent_de8969556ad849660fb8dca417
agent_version: 0
agent_name: GenSteel Post-Order Review Follow-Up - Draft
voice_id: custom_voice_42177f113236175867ad1e552f
published: false
```

The Retell agent uses a Conversation Flow response engine:

```text
response_engine.type: conversation-flow
response_engine.conversation_flow_id: conversation_flow_af26875307e6
response_engine.version: 0
```

An optional multi-prompt version is documented in
[`gensteel-retell-multi-prompt-agent.md`](./gensteel-retell-multi-prompt-agent.md). After
that Retell draft agent is created, put its id in `RETELL_MULTI_PROMPT_AGENT_ID`
so the GenStone `/gensteel-review` test page can select it for browser test
calls.

Webhook events enabled on the agent:

```text
call_started
call_ended
call_analyzed
```

Webhook URL:

```text
https://gensteel-ai-review-agent.travis-m.workers.dev/api/retell-webhook
```

Webhook delivery is verified by the Worker with Retell's `x-retell-signature`
header.

## Opening Script Requirements

The agent must introduce itself as Lisa from GenSteel. Do not use phone-gate
phrases such as:

```text
Hello, {{customer_name}} please?
```

The conversation flow is configured with `start_speaker=user`, so Lisa should
wait for the customer to answer before speaking.

Preferred first line after the customer says hello:

```text
Hi {{customer_name}}, this is Lisa from GenSteel. Did I catch you at a good time?
```

After the customer agrees to continue, Lisa should briefly explain:

```text
Thanks, I will keep it brief. I am calling from GenSteel to check in on your
recent order and see how everything went.
```

## Conversation Flow Shape

The flow has 12 nodes:

- Identity And Good Time
- Ask Experience
- Confirm Employee
- Review Promo
- Confirm Email
- Capture Issue
- Callback Later
- Wrong Person Close
- Positive No Review Close
- Positive Close
- Escalation Close
- End Call

High-level call path:

```text
Start
  -> confirm customer identity and good time
  -> ask about order / delivery experience
  -> if positive:
       confirm employee did a five-star job
       ask for review
       confirm email
       close
  -> if negative / neutral / issue:
       apologize
       capture issue
       set escalation callback expectation
       close
  -> if busy:
       capture callback preference
       close
  -> if wrong person:
       apologize
       close
```

No function tools were added to the Retell flow. The agent handles conversation only. Side effects happen after the call through Cloudflare.

## Dynamic Variables Expected

When Cloudflare creates the Retell outbound call, pass order/customer context through `retell_llm_dynamic_variables`.

All dynamic variable values should be strings.

```ts
retell_llm_dynamic_variables: {
  customer_name: "Larry",
  order_number: "12345",
  order_id: "internal-or-salesforce-order-id",
  building_size: "40 by 50 building",
  delivery_date: "April 8",
  sales_rep_name: "Ben Lombard",
  delivery_coordinator_name: "Kasey Starr",
  project_coordinator_name: "Casey Smith",
  file_team_summary: "you worked with Ben on the sales side and Kasey on delivery coordination",
  customer_email: "larry@example.com"
}
```

Use `metadata` for internal orchestration identifiers that the agent does not need to say out loud:

```ts
metadata: {
  order_id: "internal-order-id",
  customer_id: "internal-customer-id",
  salesforce_order_id: "salesforce-order-id",
  salesforce_account_id: "salesforce-account-id",
  customer_io_person_id: "customer-io-person-id"
}
```

## Retell Create Call Example

Cloudflare should create the outbound Retell call roughly like this:

```ts
await fetch("https://api.retellai.com/v2/create-phone-call", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${RETELL_API_KEY_GENSTEEL}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    from_number: "+1YOUR_RETELL_NUMBER",
    to_number: customer.phone,
    override_agent_id: "agent_de8969556ad849660fb8dca417",
    retell_llm_dynamic_variables: {
      customer_name: customer.firstName,
      order_number: String(order.orderNumber),
      order_id: String(order.id),
      building_size: order.buildingSize,
      delivery_date: order.deliveryDate,
      sales_rep_name: order.salesRepName,
      delivery_coordinator_name: order.deliveryCoordinatorName,
      project_coordinator_name: order.projectCoordinatorName,
      file_team_summary: order.fileTeamSummary,
      customer_email: customer.email,
    },
    metadata: {
      order_id: order.id,
      customer_id: customer.id,
      salesforce_order_id: order.salesforceOrderId,
      salesforce_account_id: customer.salesforceAccountId,
      customer_io_person_id: customer.customerIoPersonId,
    },
  }),
});
```

## Post-Call Analysis Fields

The Retell agent was configured with these post-call analysis fields:

```text
call_summary
call_successful
user_sentiment
experience_sentiment
employee_sentiment
review_requested
review_consent
confirmed_email
needs_escalation
issue_summary
callback_time_preference
call_outcome
```

Expected `call_outcome` values:

```text
positive_review_email_needed
positive_no_review
negative_escalation_needed
callback_requested
wrong_person_or_number
no_meaningful_conversation
```

These fields should drive the downstream Cloudflare orchestration:

```text
positive_review_email_needed
  -> send Customer.io review email
  -> send internal staff summary email with gift-card Zapier link

negative_escalation_needed
  -> send internal staff summary email clearly marked as escalation

callback_requested
  -> persist callback request and notify staff

wrong_person_or_number
  -> persist outcome and notify staff

positive_no_review
  -> persist outcome and notify staff
```

## Orchestration Decision

We are not using n8n.

The production orchestration should be built with Cloudflare Workers, with Cloudflare Workflows if durable multi-step execution is needed.

Recommended shape:

```text
Customer.io order_created event campaign
  -> Customer.io webhook action
  -> Cloudflare Worker /order-created endpoint
  -> Worker validates payload and idempotency
  -> Worker creates Retell outbound phone call
  -> Worker stores order_id <-> call_id mapping

Retell call_analyzed webhook
  -> Cloudflare Worker /retell-webhook endpoint
  -> Worker validates Retell webhook
  -> Worker reads call_analysis and metadata
  -> Worker branches by call_outcome
  -> Worker triggers Customer.io review email when positive
  -> Worker sends internal staff summary email for every outcome
  -> Worker includes Retell transcript/log and recording URLs when available
```

Use Cloudflare Workflows if any of these are needed:

- durable retries across Retell, Customer.io, and Salesforce
- long waits
- explicit multi-step state tracking
- replay/debug visibility for each order follow-up
- waiting for future events

Use plain Workers plus a small database if the flow stays simple:

- receive Customer.io webhook
- call Retell
- receive Retell webhook
- branch and call Customer.io/Salesforce

## Customer.io Trigger Decision

Use an event-based Customer.io campaign trigger.

The event should represent the discrete business event:

```json
{
  "name": "order_created",
  "data": {
    "order_id": "006xx000...",
    "order_number": "12345",
    "opportunity_id": "006xx000...",
    "order_email": "larry@example.com"
  }
}
```

The Worker fetches the full Salesforce Order and Opportunity before creating
the Retell call. Retell dynamic variables are built from the enriched
Salesforce records, not from the Customer.io event payload.

Use attributes for durable customer state:

```text
first_name
phone
email
salesforce_account_id
do_not_call
review_eligible
last_order_id
```

Do not use an attribute-based trigger for the main order-created workflow unless the source system cannot emit events.

## Implementation Notes

Keep the Retell agent conversation-only for now.

Do not add Retell function tools unless something must happen during the live call. Current plan:

- Retell handles conversation and structured analysis.
- Cloudflare handles all side effects.
- Customer.io sends review emails.
- Salesforce stores call summaries, cases, tasks, and status.

Add idempotency around:

- `order_id`
- `call_id`
- Customer.io webhook delivery ID if available
- Retell webhook event ID if available

Store enough state to answer:

- Has this order already triggered a call?
- What Retell call ID belongs to this order?
- Did Retell finish and analyze the call?
- Was the review email sent?
- Was Salesforce updated?
- Does this order need human escalation?

## Docs

Retell docs:

- [Single/Multi Prompt Agent Overview](https://docs.retellai.com/build/single-multi-prompt/prompt-overview)
- [Build a Multi-Prompt Agent](https://docs.retellai.com/build/single-multi-prompt/write-multi-prompt)
- [Conversation Flow Overview](https://docs.retellai.com/build/conversation-flow/overview)
- [Conversation Flow Nodes](https://docs.retellai.com/build/conversation-flow/node)
- [Transition Conditions](https://docs.retellai.com/build/conversation-flow/transition-condition)
- [Dynamic Variables](https://docs.retellai.com/build/dynamic-variables)
- [Create Phone Call API](https://docs.retellai.com/api-references/create-phone-call)
- [Webhooks](https://docs.retellai.com/features/webhook-overview)
- [Post-Call Analysis](https://docs.retellai.com/features/post-call-analysis)
- [Testing Overview](https://docs.retellai.com/test/test-overview)

Customer.io docs:

- [Campaign Triggers](https://docs.customer.io/journeys/campaign-triggers/)
- [Webhooks](https://docs.customer.io/integrations/data-out/connections/webhook/)
- [Liquid Trigger Data](https://docs.customer.io/journeys/using-liquid/)

Cloudflare docs:

- [Workers](https://developers.cloudflare.com/workers/)
- [Workers Runtime APIs](https://developers.cloudflare.com/workers/runtime-apis/)
- [Workflows](https://developers.cloudflare.com/workflows/)
- [Workflows Events And Parameters](https://developers.cloudflare.com/workflows/build/events-and-parameters/)
- [Queues](https://developers.cloudflare.com/queues/)

Salesforce docs:

- [REST API Developer Guide](https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/intro_rest.htm)

## Next Steps

1. Build Cloudflare Worker endpoint for Customer.io `order_created` webhook.
2. Add webhook signature/shared-secret validation.
3. Add idempotency storage.
4. Create Retell outbound call from Worker.
5. Build Cloudflare Worker endpoint for Retell webhooks.
6. Update Retell agent webhook URL to the Cloudflare endpoint.
7. Route `call_analyzed` outcomes to Customer.io and Salesforce.
8. Run test calls with sample dynamic variables.
9. Tune the Retell conversation flow based on transcripts.
10. Publish the Retell agent only after test behavior is acceptable.
