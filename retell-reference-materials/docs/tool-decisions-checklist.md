# GenStone Open Tool Decisions

Do not add a checklist item when the
[GenStone capability map](./genstone-capability-map.md) already routes it through
an approved answer, callback, shipment email, Zendesk, transfer, or DNC path.

## Decisions Still Needed

None for the approved tool and storage boundaries.

## Confirmed — No Further Scenario Decision Needed

- [x] Salesforce contact lookup is required; the agent does not create Leads or
  Contacts.
- [x] The opening question classifies the call. New-project follow-up uses
  callback scheduling; unresolved existing-order work uses Zendesk and never a
  callback appointment.
- [x] Active Salesforce Users with direct phone numbers are eligible named
  transfer targets.
- [x] Named-person transfer uses standard warm transfer with human detection
  and a private employee whisper. GenStone uses Twilio; set caller ID to
  **User's Number** so the employee sees the customer's number. Failure returns
  to the primary route rather than always offering a callback.
- [x] Samples use the regular WooCommerce order path.
- [x] Retailer, dealer, store, and Pro Desk orders use the regular verified
  WooCommerce phone or numeric-order lookup when a WooCommerce record exists.
  Retailer/store/PO/CPO values are context, not lookup or verification factors;
  an unmatched retailer order uses the existing-order Zendesk outcome.
- [x] Stored shipment details may be spoken after verification.
- [x] When requested, shipment details may be emailed to the confirmed order
  email.
- [x] Product questions without an approved answer use the follow-up path.
- [x] Channel availability is out of scope.
- [x] Simple follow-up uses internal email; tracked support uses Zendesk.
- [x] Zendesk uses Support group, no specific assignee, and normal priority by
  default.
- [x] Existing-order cases use native Type `Question`, Ticket Type `Answering
  Service`, explicit tag `answer_connect`, field-derived tags including
  `answering_service` and caller type, plus Customer Name, Phone, caller type,
  and Country when known.
- [x] Customer service answers open existing-order cases by the end of the next
  business day. This is a response expectation, not a scheduled callback.
- [x] Open-case matching starts primarily from the confirmed contact; the agent
  determines whether the issue is the same matter.
- [x] Every Zendesk case creation also sends an internal case-created email.
- [x] Zendesk uses the confirmed customer name and email as requester and a
  private initial comment. The application sends only the internal case-created
  notice; Zendesk-originated notifications remain governed by Zendesk business
  rules.
- [x] Retell data storage is `Everything`.
- [x] The exact authenticated Retell webhook body is archived in private R2;
  PlanetScale stores the object key and normalized operational record rather
  than a duplicate full-payload JSON column.
- [x] Retell, R2, and PlanetScale retain the records with no automatic deletion
  or lifecycle-expiration policy.
- [x] Five9 owns do-not-call suppression.
- [x] Photos and communication preferences are context, not separate paths.

## Checklist Rule

Before proposing anything new, ask whether the current request can already be
handled by one of these outcomes:

1. answer with approved knowledge or confirmed data;
2. verify and answer from WooCommerce;
3. email stored shipment details after the caller requests it;
4. schedule a centralized callback/internal message for a new project;
5. create one new private Zendesk support ticket for an unresolved existing
   order;
6. transfer to the explicitly named active employee;
7. record DNC; or
8. capture an unsupported capability as follow-up context.

If yes, no new scenario or tool is needed.
