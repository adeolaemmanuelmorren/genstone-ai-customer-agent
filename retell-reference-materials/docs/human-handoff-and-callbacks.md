# Human Handoff And Callbacks

GenStone has two human-handoff outcomes. They are chosen by what the caller
actually asks for, not by prompting the caller to select a department.

## 1. Named-Person Transfer

Use this only when the caller independently asks for a specific employee.

1. Search Salesforce Users using the supplied name.
2. Require one unique User whose status is Active and whose direct phone number
   is present.
3. Confirm that the caller wants to be transferred to that person.
4. Pass the direct number to Retell's Call Transfer node.
5. Use a standard warm transfer with human detection and a private whisper to
   the employee before bridging the caller.
6. If there is no unique valid target or the connection fails, tell the caller
   the connection could not be completed and return to the primary route: a new
   project uses centralized callback scheduling; an existing order uses the
   Zendesk follow-up path.

Do not claim that an Active employee is currently available. Do not proactively
ask which person or department the caller wants.

GenStone uses Twilio. Set Retell's transfer caller ID to **User's Number** so
the employee sees the customer's number. The private whisper identifies the
GenStone call and may include the caller's name and broad topic; it must not
include unnecessary sensitive details. Confirm the display with one live
transfer test before launch.

## 2. Centralized Callback

Use the callback only for new-project follow-up, including a generic human
request while on the new-project route. A callback is not booked on a
particular coordinator's calendar. Customer.io sends the request internally to
the manager address configured for GenStone. Existing-order callers are never
asked to choose a callback time.

### Callback rules

| Rule | Confirmed behavior |
| --- | --- |
| Earliest date | Next business day; never same day |
| Days | Monday-Friday, excluding standard U.S. federal holidays for now |
| Hours | 8:30 AM-4:30 PM Mountain time, inclusive |
| Topic | Propose a short subject from the conversation and let the caller correct it |
| Phone | Read back caller ID and confirm or replace it |
| Urgency | Add factual priority context to the internal email; do not promise faster service |
| Follow-up preference | Record it as ordinary context; it is not a separate path |
| Customer email | Do not send a callback confirmation to the caller |
| Completion | Say it is scheduled only after Customer.io accepts the internal request |

### Appropriate callback topics

Keep subjects broad, for example: `project`, `product question`, `order
question`, `retailer question`, `named person`, or `other`.

Do not route any unresolved existing-order matter into callback merely because
a human must follow up. Those use the shared Zendesk path and the internal
case-created email.

### Internal callback email

Include only useful, confirmed context:

- callback type and short subject;
- short factual call summary;
- preferred date and Mountain time;
- confirmed customer name and callback phone;
- order, project, retailer, or requested-employee references when relevant;
- communication preference, urgency signals, and customer email when useful as
  internal context.

Never tell the caller an internal email was sent. Confirm the callback date,
Mountain time, and phone number after the backend reports success.

## Relationship To Zendesk

The decision is simple:

- A new-project follow-up uses Customer.io internal email and callback
  scheduling.
- An unresolved existing-order matter uses Zendesk, without scheduling a
  callback.
- After creating a Zendesk case, also send the internal case-created email.
- Do not tell the caller that a case or ticket was created; say the team will
  respond by the end of the next business day.
