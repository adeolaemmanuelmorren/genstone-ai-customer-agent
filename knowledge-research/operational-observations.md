# Operational Observations

> Internal research notes only. These observations must not be copied into the caller-facing knowledge draft as operational instructions.

## Website

- The public Project SOS path offers human assistance for color selection, visualizations, material estimates, and installation questions. The internal routing or assignment process is not described. [Source](https://genstone.com/project-sos)
- The returns and shipping-claims page separates direct GenStone purchases from retailer purchases and asks direct purchasers for order details. Retailer returns are directed back to the retailer. [Source](https://genstone.com/claim-or-return)
- The damage-claim form requests a description and photos of damaged product. The public page says the support team follows up after submission. [Source](https://genstone.com/claim-or-return)
- The warranty-registration form collects purchaser, project-location, completion, product, project-type, and installation information. These fields are workflow inputs, not caller-facing policy. [Source](https://genstone.com/warranty/registration)
- The warranty claim form requests proof of purchase, property information, photographs, affected-area measurements, and sometimes product samples. Claim requirements should be summarized as “supporting evidence may be required,” while the current form controls the exact submission. [Source](https://genstone.com/wp-content/uploads/2019/06/GenStone-Warranty-Claim.pdf)
- The self-service visualizer accepts a project photo and can pass the selected appearance into project-pricing and cart flows. A separate rendering-request form collects a photo and contact information. [Source](https://genstone.com/see-genstone-on-your-home) [Source](https://genstone.com/visualizer)
- The online calculator uses measurements to estimate panels and accessories and can add selected materials to the shopping cart. [Source](https://genstone.com/price-my-project)

## Call Transcripts

- Reviewed all 428 Markdown transcripts individually; evidence and hashes are recorded in [`raw/transcripts/transcript-findings.md`](raw/transcripts/transcript-findings.md) and [`raw/transcripts/transcript-inventory.json`](raw/transcripts/transcript-inventory.json).
- The answering service usually cannot view orders, carrier details, pricing, inventory, product specifications, returns, claims, or employee schedules. Most substantive calls become messages or scheduled callbacks.
- Missed callbacks, ambiguous caller ID, time-zone form problems, and repeated identity intake created avoidable delay for simple and urgent questions.
- Several intake agents guessed or spoke uncertainly about installers, retail relationships, locations, included accessories, promotions, and turnaround. These statements must not become policy.
- Order confirmation and item-level fulfillment visibility are inadequate in the observed customer experience. Customers repeatedly lacked confirmation, package-level contents, carrier status, or reliable ETAs.
- Multiple independent carrier drivers reported that GenStone's business phone number was printed instead of the recipient's number. Other calls involved missing unit information, address corrections, or delivery to an uncertain location.
- Checkout failures recurred across card, PayPal, promotion, address-validation, and JavaScript paths. Observed messages included a required merchant-defined field and “null is not an object.”
- Claims/returns lacked an obvious evidence channel, receipt, case number, status, or accessible label-delivery option. Customers repeatedly asked whether to send photos, keep damaged material, or wait for instructions.
- Retail/wholesale callers need a separate route for pricing, availability, sample/literature replenishment, distributor lookup, PO tracking, RGA, credits, and return disposition.
- Sales estimates sometimes undercounted panels/corners or concealed layout and waste assumptions, causing installations to stop after labor was scheduled.
- Promotion language and receipt formats sometimes caused checkout abandonment or fraud concern because eligibility, discount application, itemization, and address details were unclear.
- Marketing opt-out requests occurred more than once. They belong in compliance operations, not the caller-facing product knowledge base.

## Zendesk

Pending export and review. Transcript processing is complete.
