# External Systems

This is the authoritative launch map for systems used by the GenStone customer
agent. It records confirmed responsibilities and the remaining decisions only.
Detailed discovery evidence is preserved in
[External systems research reference](./external-systems-reference.md).

## System Map

| System | Purpose in the call | Reads | Writes |
| --- | --- | --- | --- |
| Salesforce | Identify existing contacts and find active employees requested by name | Contacts; active Users and their direct phone numbers | None during a call |
| WooCommerce | Verify an existing order and answer confirmed order or stored-shipment questions | Orders, line items, order contact, stored shipment fields | None during a call |
| WordPress / WooCommerce | Source approved product facts | Product content and product records | None during a call |
| Zendesk | Track support work requiring ownership and resolution | Open cases related to the confirmed contact | Create one case or update the matching case |
| Customer.io | Deliver approved transactional email | None | Internal new-project callback, unmatched-prospect, and case-created notices; customer shipment details when requested |
| Five9 | Record do-not-call requests | None required for the caller flow | Add confirmed phone number to DNC |
| Retell | Run the Conversation Flow agent and phone call | Call state and dynamic variables | Invoke tools and transfer a call |

## Salesforce

Salesforce contact lookup is required. It answers whether the caller already
exists in the CRM, supplies confirmed contact context, and prevents an existing
customer from being handled as an unmatched new prospect. It does not replace
WooCommerce order verification and it does not authorize creating or updating a
Lead or Contact during the call.

Salesforce also owns the named-person transfer directory:

- Search Salesforce Users by the employee name supplied by the caller.
- Only Users whose Salesforce status is Active are eligible.
- Use the employee's direct phone number as the Retell transfer destination.
- Active means the person still works for GenStone. It does not prove they are
  presently available.
- If no unique active match, no direct number, or the transfer fails, return to
  the primary route: new projects use callback scheduling; existing orders use
  Zendesk follow-up.
- Do not proactively ask callers to choose a person or department.

## WooCommerce Orders And Shipments

Existing-order help starts with the shared verification gate:

1. Confirm the caller's phone number.
2. Look up the most recent order using that number.
3. If found, confirm the order items and order email.
4. If not found, ask for another phone number or the order number and confirm
   the matching order.
5. Only then discuss the order or use it in another tool.

WooCommerce is authoritative for regular orders, sample orders, order contact,
line items, status, and the shipment values stored on the order. The initial
shipment answer may use confirmed carrier/provider, tracking number, approved
tracking link, and stored shipped date. It must not invent live ETA, delivery,
exception, or item-level partial-shipment status.

When a verified caller asks when a shipment will arrive or asks for tracking,
the agent may offer to email the stored shipment details. It must confirm the
order email and send only to that address. This is the one approved
customer-facing Customer.io email path.

## Retailer Orders

Retailer, store, and Pro Desk orders do not require a separate lookup path.

- Use the regular verified WooCommerce lookup by confirmed phone or numeric
  WooCommerce order number. This covers dealer, distributor, or retailer-context
  orders when GenStone has an ordinary WooCommerce record for them, including
  orders created through the staff dashboard.
- Confirm the matched order with its items and stored order email before
  discussing it. Retailer name, billing company, store number, PO, or CPO may be
  retained as follow-up context, but none is a lookup or verification factor.
- Do not infer purchase channel from `created_via=dashboard`; the dashboard also
  creates non-retailer orders.
- Read-only production verification on 2026-08-08 found five retailer-, dealer-,
  or CPO-signaled records among the 500 most recent orders. All five were normal
  WooCommerce records found by both numeric order lookup and the existing phone
  search, and the production REST index exposed no retailer-specific endpoint.
- If the supplied retailer order number is not a WooCommerce order number, or no
  verified WooCommerce record is found, use the existing-order Zendesk path.
- Do not create a retailer-specific caller scenario, tool, or portal connection,
  and never imply access to a retailer's system.

Remaining owner decision: none for the retailer-order lookup boundary. A future
request to search by retailer/store/PO would require a new authoritative source
and verification design; it is not part of launch.

## Product Information

WordPress and WooCommerce expose the same underlying product records for the
current catalog. For the initial flow, answer only from approved public
knowledge. Questions requiring unapproved live price, inventory, product
lifecycle, or project-specific interpretation use the normal follow-up path.

Channel-availability lookup is out of scope. Do not create a separate live
retailer or local-inventory path.

The public Visualizer at <https://genstone.com/visualizer> is for a new project
rendering. It is not a support-photo upload portal. If support work may need
photos, create or update the normal Zendesk case and say the team will follow up
with the best way to provide them.

## Zendesk

Use Zendesk for every existing-order issue that cannot be resolved during the
call. This includes returns, warranties, claims, damage, missing or wrong items,
and other existing-order issues. These are examples of one shared support-case
path, not separate conversation paths. Do not schedule callbacks for existing
orders.

Confirmed launch behavior:

- Search primarily by confirmed contact and present relevant open cases to the
  agent.
- The agent decides from the current issue and case summary whether this is the
  same matter or a different one.
- Update the matching case for the same matter; otherwise create one case.
- Assign to the Support group with no specific assignee.
- Use normal priority by default. Urgency is captured as factual context.
- Use native Type `Question`.
- Set Ticket Type to `Answering Service`.
- Add the explicit tag `answer_connect`. Ticket Type and caller-type field
  values also provide sortable tags such as `answering_service` and `customer`.
- Populate Customer Name, Phone, caller type (Customer, Partner, or Pro), and
  Country when known.
- Do not routinely ask whether photos exist. Preserve photo availability only
  when the caller volunteers it or it is necessary to understand the issue.
- Do not tell the caller a case or ticket was created. State that the customer
  service team will respond by the end of the next business day. This is a
  response expectation, not a scheduled appointment.

Every successful Zendesk case creation must also send an internal case-created
email through Customer.io.

Zendesk is **internal-only at launch**:

- use the configured internal integration/service identity as requester rather
  than creating or reusing the caller as a Zendesk end user;
- create private/internal comments only;
- disable or suppress Zendesk triggers that would notify the customer;
- keep the caller's confirmed contact and order references as internal case
  context; and
- keep requester mode, comment visibility, and customer notifications behind
  centralized backend configuration so they can be enabled later without
  changing the Retell conversation flow.

The application does not send a separate customer support email for this
action. The required Customer.io case-created notice remains internal.

## Customer.io

Customer.io is the transactional email service for:

- centralized callback requests to GenStone managers;
- unmatched new-prospect details to the approved internal recipient;
- an internal notification after a Zendesk case is created;
- shipment details to the confirmed order email, only after the verified caller
  asks for or accepts that email.

Sender identities, internal recipients, and transactional-message ids are
typed product source configuration. Do not read generic internal-email from/to
environment variables. Retell supplies business context only and never chooses
an internal recipient.

No callback confirmation, prospect confirmation, or general support email is
sent to the customer by this application.

## Five9 Do-Not-Call

A clear do-not-call request writes the confirmed number to Five9. It does not
create a Salesforce record or Zendesk case. Confirm the number once, perform the
write, and report success only after the backend confirms it.

## Retell Call Transfer

Retell Conversation Flow supports a Call Transfer node whose destination can be
a runtime dynamic variable. Use it only when the caller independently requests
a named employee and Salesforce returns one unique active User with a direct
phone number. Use standard warm transfer with human detection, auto-greeting,
and a private employee whisper. GenStone uses Twilio; set Retell's transfer
caller ID to **User's Number** so the employee sees the customer's number. If
the attempted connection fails, return to the agent, tell the caller the
connection could not be completed, and use the primary route's follow-up:
new-project callback or existing-order Zendesk.
Confirm the displayed caller ID in one live transfer test before launch.

## Remaining Decisions

The external-system behavior documented here has no remaining launch routing
decision. Retell storage is `Everything`; the Worker archives full authenticated
webhook bodies in private R2 and stores their object keys in PlanetScale.
Retell, R2, and PlanetScale keep these records with no automatic deletion.
