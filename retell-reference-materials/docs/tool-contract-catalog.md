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
| **Check business hours** — Determine whether a live GenStone handoff is currently available. | `POST /v1/retell/tools/business-hours/status` / `check_business_hours` | `call_id` | Worker clock | `open`, `closed`, `error` | Monday-Friday, 8:30 AM-4:30 PM Mountain, excluding standard U.S. federal holidays. The model never calculates availability itself. |
| **Find Salesforce contact** — Determine whether the caller is an existing CRM contact and retrieve confirmed contact context. | `POST /v1/retell/tools/contacts/lookup` / `lookup_contact`, then `lookup_contact_by_email` when needed | `call_id`; confirmed phone first, confirmed email after no unique phone match | Salesforce | `found`, `not_found`, `ambiguous`, `validation_failed`, `error` | Phone is tried first. Ask for and confirm email only after phone returns `not_found` or `ambiguous`. Does not verify an order and never creates or updates a Lead or Contact. |
| **Find active employee** — Resolve a caller-supplied employee name to an eligible direct transfer number. | `POST /v1/retell/tools/employees/lookup` / `lookup_active_employee` | `call_id`; employee name | Salesforce User | `found`, `not_found`, `ambiguous`, `missing_number`, `error` | Accept one unique eligible search result even for a partial name. If several Users match, ask once for the full name and retry. Return the transfer destination privately, not as spoken data. Only active Users in a mapped GenStone profile with a direct phone qualify. |
| **Find order candidate** — Find and traverse candidates used by the existing-order verification gate. | `POST /v1/retell/tools/orders/lookup` / `lookup_order` or `next_order_candidate` | `call_id`; confirmed phone, exact billing email, order number, or previous rejected candidate token | WooCommerce; call-scoped candidate tokens in PlanetScale | `found`, `not_found`, `no_more_candidates`, `validation_failed`, `error` | Query WooCommerce directly and exclude quote-status drafts. Store only the eligible candidates for this call so advancing to the next candidate does not repeat the WooCommerce search. Do not maintain a copied order lookup system. |
| **Read stored shipment details** — Return shipment identifiers already stored on the verified order. | `POST /v1/retell/tools/shipments/lookup` / `lookup_shipment` | `call_id`; verified order token | WooCommerce | `found`, `shipment_unavailable`, `error` | For a processing order without tracking, say it is still processing and the customer will be notified by email once it is ready to ship. For other statuses, state the stored status and lack of shipment/arrival data. Do not force support follow-up or guess an ETA. |

## Write Tools

| Name / description | Proposed route / Retell name | Required input | System | Caller-safe outcomes | Boundary |
| --- | --- | --- | --- | --- | --- |
| **Send unmatched prospect follow-up** — Existing internal endpoint not exposed to the active Retell flow. | `POST /v1/retell/tools/prospects/follow-up` / `send_prospect_follow_up` | `call_id`, idempotency key, `primary_route=new_project`, confirmed name, phone, and email, project summary, optional volunteered postal code | Customer.io | `sent`, `validation_failed`, `delivery_failed`, `error` | Never emails the customer or creates a Salesforce Lead or Contact. The active new-project flow uses project-coordinator transfer and callback. |
| **Schedule centralized callback** — Send a new-project caller's confirmed preferred callback request internally. | `POST /v1/retell/tools/callbacks/schedule` / `schedule_callback` | `call_id`, idempotency key, `primary_route=new_project`, confirmed caller name, phone, and email, subject, summary, preferred date/time | Customer.io; Slack only on delivery failure | `scheduled`, `invalid_day_or_time`, `delivery_failed_notified`, `delivery_failed_unnotified`, `error` | New projects only. Next business day or later; Monday-Friday 8:30 AM-4:30 PM Mountain; internal email only. A Customer.io delivery failure attempts a private Slack alert and then terminates the call through one consolidated failure response. |
| **Email shipment details** — Send verified stored tracking details when the caller asks for or accepts the offer. | `POST /v1/retell/tools/shipments/email` / `email_shipment_tracking` | `call_id`, idempotency key, verified order token, caller-confirmed destination email | Customer.io + WooCommerce | `sent`, `shipment_unavailable`, `delivery_failed`, `error` | The only approved customer-facing application email. Ask which email address to use only after the caller accepts the offer, then confirm that destination once before sending. Do not read tracking numbers aloud. |

Temporary QA override: until explicitly removed, the Worker routes every
shipment email to `adeolamorren@gmail.com` regardless of the address supplied
to the tool and BCCs `travis.m@generalsteel.com`. No shipment email can reach a
customer while this override is active.
| **Record existing-order follow-up** — Create the call's first private Zendesk answering-service ticket or append related later details as a private comment. | `POST /v1/retell/tools/support/follow-up` / `record_support_follow_up` | `call_id`, call-scoped idempotency key, `primary_route=existing_order`, confirmed name, phone, and email, factual issue summary, caller type, and country when volunteered | Zendesk + Customer.io | `created`, `updated`, `created_notice_failed`, `validation_failed`, `error` | The first unresolved issue creates the ticket and internal case-created email. Related information later in the same call appends a private comment to that ticket. Attach the confirmed caller as requester, keep comments private, and never expose ticket terminology, ids, or provider details to the caller. |
| **Suppress phone number** — Add a confirmed number to do-not-call. | `POST /v1/retell/tools/dnc/suppress` / `suppress_phone_number` | `call_id`, idempotency key, normalized phone, confirmed request | Five9 | `suppressed`, `already_suppressed`, `validation_failed`, `error` | Confirm once. Do not create a CRM or support record. |

## Built-In Retell Action

| Name / description | Retell node | Required input | Outcome | Boundary |
| --- | --- | --- | --- | --- |
| **Transfer to project coordinator** — Connect a new-project caller during business hours. | Call Transfer node | Phone channel, open business-hours result, caller permission | `connected` or transfer-failure edge | Standard warm transfer to `303-876-4333`; failed transfer uses Callback. |
| **Transfer to customer service** — Escalate an existing-order caller during business hours. | Two sequential Call Transfer nodes | Phone channel, open business-hours result, caller permission | `connected` or transfer-failure edge | Try `303-647-1024`, then `303-904-7205`; if neither answers, create the normal Zendesk follow-up. |
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
