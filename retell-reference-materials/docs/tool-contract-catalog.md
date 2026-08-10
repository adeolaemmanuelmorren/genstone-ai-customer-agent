# GenStone Tool Contract Catalog

This catalog contains only tools required by the
[GenStone capability map](./genstone-capability-map.md). A topic already handled
by a shared answer, callback, or Zendesk path does not get its own tool.

## Contract Rules

- The Worker owns credentials, validation, authorization, idempotency, and
  provider-specific payloads.
- Retell receives small, caller-safe outcomes and never receives provider
  credentials.
- A read result is not permission to write.
- A write must return success before the agent describes the resulting next
  step.
- Do not expose Salesforce IDs, Zendesk IDs, internal email addresses, raw
  provider errors, or secrets to the caller.

## Read Tools

| Name / description | Proposed route / Retell name | Required input | System | Caller-safe outcomes | Boundary |
| --- | --- | --- | --- | --- | --- |
| **Find Salesforce contact** — Determine whether the caller is an existing CRM contact and retrieve confirmed contact context. | `POST /v1/retell/tools/contacts/lookup` / `lookup_contact` | `call_id`; confirmed phone or email | Salesforce | `found`, `not_found`, `ambiguous`, `validation_failed`, `error` | Required. Does not verify an order and never creates or updates a Lead or Contact. |
| **Find active employee** — Resolve a caller-supplied employee name to an eligible direct transfer number. | `POST /v1/retell/tools/employees/lookup` / `lookup_active_employee` | `call_id`; employee name | Salesforce User | `found`, `not_found`, `ambiguous`, `missing_number`, `error` | Return a transfer token/dynamic value, not the direct number for the agent to speak. Only Active Users qualify. |
| **Find order candidate** — Find the candidate used by the shared existing-order verification gate. | `POST /v1/retell/tools/orders/lookup` / `lookup_order` | `call_id`; confirmed phone, alternate phone, or order number | WooCommerce | `found`, `not_found`, `ambiguous`, `validation_failed`, `error` | Return an opaque candidate token plus caller-safe item and masked-email confirmation hints. The token is not proof of verification. Downstream order tools require both confirmation flags and `order_verified=true`. Samples use this same path. |
| **Read stored shipment details** — Return shipment identifiers already stored on the verified order. | `POST /v1/retell/tools/shipments/lookup` / `lookup_shipment` | `call_id`; verified order token | WooCommerce | `found`, `shipment_unavailable`, `error` | No guessed carrier link, ETA, delivered/exception state, or item-level partial-shipment claim. |

## Write Tools

| Name / description | Proposed route / Retell name | Required input | System | Caller-safe outcomes | Boundary |
| --- | --- | --- | --- | --- | --- |
| **Send unmatched prospect follow-up** — Send a confirmed new prospect who was not found in Salesforce to Travis for internal follow-up. | `POST /v1/retell/tools/prospects/follow-up` / `send_prospect_follow_up` | `call_id`, idempotency key, `primary_route=new_project`, confirmed contact details, project summary, optional postal code, `prospect_confirmed=true` | Customer.io | `sent`, `validation_failed`, `delivery_failed`, `error` | New projects only, after Salesforce contact lookup returns `not_found`. Internal email to Travis; never creates a Salesforce Lead or Contact and never emails the customer. |
| **Schedule centralized callback** — Send a new-project caller's confirmed preferred callback request internally. | `POST /v1/retell/tools/callbacks/schedule` / `schedule_callback` | `call_id`, idempotency key, `primary_route=new_project`, confirmed caller name, subject, summary, preferred date/time, confirmed callback phone | Customer.io | `scheduled`, `invalid_day_or_time`, `delivery_failed`, `error` | New projects only. Next business day or later; Monday-Friday 8:30 AM-4:30 PM Mountain; internal email only. The backend rejects existing-order callback requests. |
| **Email shipment details** — Send verified stored tracking details when the caller asks for or accepts the offer. | `POST /v1/retell/tools/shipments/email` / `email_shipment_tracking` | `call_id`, idempotency key, verified order token, confirmed order email | Customer.io + WooCommerce | `sent`, `shipment_unavailable`, `delivery_failed`, `error` | The only approved customer-facing application email. Send only to the confirmed order email. |
| **Create existing-order follow-up** — Create one new private Zendesk answering-service ticket, then send the required internal notice. | `POST /v1/retell/tools/support/cases` / `create_support_case` | `call_id`, idempotency key, `primary_route=existing_order`, confirmed contact, factual issue summary, caller type, and country when known | Zendesk + Customer.io | `created`, `created_notice_failed`, `validation_failed`, `error` | Never search for or update an earlier ticket during the call. Support group, no assignee, normal priority; native Type `Question`; Ticket Type `Answering Service`; explicit `answer_connect` tag plus field-derived `answering_service` and caller-type tags. Populate Customer Name, Phone, caller type, and Country when known. Use an internal service requester, private comments, and no customer notification. After creation, send an internal case-created email. Tell the caller the team responds by the end of the next business day without exposing case terminology. |
| **Suppress phone number** — Add a confirmed number to do-not-call. | `POST /v1/retell/tools/dnc/suppress` / `suppress_phone_number` | `call_id`, idempotency key, normalized phone, confirmed request | Five9 | `suppressed`, `already_suppressed`, `validation_failed`, `error` | Confirm once. Do not create a CRM or support record. |

## Built-In Retell Action

| Name / description | Retell node | Required input | Outcome | Boundary |
| --- | --- | --- | --- | --- |
| **Transfer to named employee** — Connect the caller to the one active employee they independently requested. | Call Transfer node | Dynamic transfer value from `lookup_active_employee` | `connected` or transfer-failure edge | Phone calls only. Use standard warm transfer, human detection, and a private employee whisper. GenStone uses Twilio; set caller ID to **User's Number** so the employee sees the customer's number. Failure returns to the agent and then follows the primary route: new-project callback or existing-order Zendesk follow-up. |

## Not Separate Tools

Do not add separate tools for photos, SMS preference, claims, returns,
warranties, receipts, payment, call history, channel availability, or each
support topic. These use the shared conversation, WooCommerce, callback, or
Zendesk behavior in the capability map.

Retailer orders do not get a separate tool. Use the regular verified
WooCommerce phone or numeric-order lookup when a normal WooCommerce record
exists. Retailer/store/PO/CPO values are follow-up context only. An unmatched
retailer order uses the existing-order Zendesk path and never implies access to
a retailer portal.

## Remaining Contract Decisions

None. Retell storage mode and the R2/PlanetScale archive boundary are confirmed.
Retell, R2, and PlanetScale keep the records with no automatic deletion.
