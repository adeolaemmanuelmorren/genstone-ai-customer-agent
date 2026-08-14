# External Systems Research Reference

> This is preserved discovery detail, not the authoritative launch scope. Some
> statements below may be stale or describe options that were not approved.
> Use [External Systems](./external-systems.md) for current decisions.

This is the shared handoff document for GenStone integrations. Each discovery
task owns one section below and must write confirmed findings here so they are
available outside its conversation.

Record names, field mappings, routing rules, API behavior, and remaining
questions. Never record passwords, API keys, access tokens, or other secret
values.

The approved caller behavior remains in the
[GenStone capability map](../retell-reference-materials/docs/genstone-capability-map.md).
This document explains how external systems support those paths; it must not
invent additional caller scenarios.

## WooCommerce Orders And Shipments

Owner task: WooCommerce integration discovery

### Confirmed

- The production store is `https://genstone.com`, uses the `America/Denver`
  site timezone, and exposes authenticated WooCommerce REST v3 order routes at
  `GET /wp-json/wc/v3/orders` and
  `GET /wp-json/wc/v3/orders/{numeric_order_id}`. The supplied temporary
  read-only credentials successfully returned production orders;
  unauthenticated access returned `401`. No secret value was recorded.
- A custom WordPress/PHP order endpoint is not required. The Worker can use the
  existing WooCommerce collection and single-order routes, apply GenStone's
  phone normalization, and require an exact billing-phone match after the
  broad collection search.
- The public REST index does not expose a shipment-tracking namespace.
  Shipment identifiers are stored on WooCommerce orders by the FarApp
  integration and processed by the GenStone theme. Relevant metadata is
  `_tracking_provider`, `_custom_tracking_provider`, `_tracking_number`,
  `_date_shipped`, and `gs_tracking_numbers`.
- Production still needs a permanent, dedicated, least-privilege read-only
  WooCommerce integration identity and key stored only in Worker secrets.

#### Existing-order verification and selection

- The authoritative caller sequence is: search by confirmed caller-ID phone,
  exclude quote-status drafts, and confirm the candidate items. Exact
  order-number lookup also excludes quotes. If no order is found, retry using an alternate
  phone or numeric order number. Do not expose order data before this
  verification succeeds.
- Caller-ID and alternate-phone lookup both search `billing.phone`. The Worker
  must format the search value using the GenStone rule, normalize every
  returned candidate again, and require exact equality. WooCommerce's broad
  `search` result is not itself authorization.
- A production test found five exact historical orders for one billing phone.
  That is not automatically a `multiple` result: sort exact matches by
  `date_created_gmt` descending, break identical-date ties by numeric `id`
  descending, and select the newest. Return `multiple` only if the available
  identifiers still cannot resolve one safe order.
- GenStone currently treats the displayed order number as the numeric
  WooCommerce order ID: site forms cast it to an integer and call
  `wc_get_order(id)`, and the site also stores the same value in `_order_id`
  for dashboard search. Exact retrieval is therefore
  `GET /wp-json/wc/v3/orders/{id}`. An invalid production order ID returned
  WooCommerce's `404` `Invalid ID`; an impossible phone returned no exact
  candidates.
- The approved verification projection is only the order identifier,
  `line_items[].name`, `line_items[].quantity`, and `billing.email`. SKU,
  product ID, and variation ID may be retained internally when required for
  safe matching, but the raw WooCommerce response must never be returned to
  the caller because it also contains addresses, phones, payment metadata,
  costs, margins, manager IDs, and notes.
- The existing staff dashboard matches `_billing_phone` against both the raw
  input and the site's normalized form. Another dashboard view matches
  `_billing_email` OR normalized `_billing_phone`, returns at most 300 records,
  and sorts creation date descending. These are verified staff-site behaviors,
  not yet an implemented caller endpoint.
- Some paid orders are split into two linked WooCommerce orders: fireplace
  items are moved into a new order and both records receive the bidirectional
  `gs_sibling_id` metadata. Billing, shipping, customer, and customer note are
  copied, and later order-status changes are synchronized. A lookup that lands
  on either record must fetch the sibling before returning verification items;
  otherwise the caller may hear only part of the logical purchase or the pair
  may be misreported as multiple recent orders.

#### Phone normalization

- `genstone_format_phone_number` is the current store normalization rule:
  leave empty values and already formatted `(###) ###-####` values unchanged;
  leave values containing letters unchanged; otherwise remove non-digits;
  accept 10 digits or 11 digits beginning with `1`; remove the leading `1`;
  and store/compare the result as `(###) ###-####`. Values with fewer than 10
  digits, more than 11 digits, or an 11-digit value not beginning with `1` are
  returned unchanged.
- New/updated order billing phones are normalized before WooCommerce saves the
  order. A maintenance job normalizes older records for both WooCommerce HPOS
  and legacy post storage. User `billing_phone`, `shipping_phone`, and `phone`
  metadata are also normalized, but existing order searches use billing phone.
- The caller adapter should preserve the original confirmed input for audit,
  apply the same GenStone normalization for matching, and require an exact
  match. An unrecognized or international format must not be coerced into a
  different customer's number.

#### Caller-safe order information

- WooCommerce supplies `status`, `date_created_gmt`, `line_items[].name`,
  `line_items[].quantity`, and `created_via` for the approved order-information
  response.
- `created_via=checkout` means website checkout and `created_via=dashboard`
  means the custom GenStone dashboard created the record. A dashboard-created
  order is not necessarily a retailer order, so `created_via` must not be
  presented as a guaranteed purchase-channel classification.
- Use this small caller-safe status mapping: `pending` to `Pending`,
  `processing` to `Processing`, `completed` to `Completed`, `cancelled` to
  `Cancelled`, and `refunded` to `Refunded`. Any other core or GenStone custom
  status uses human follow-up. `Completed` must never be translated to
  `delivered`.

#### Samples

- Samples use the regular order lookup and verification path; there is no
  separate sample-order endpoint.
- When `gs_payroll_type=sample`, the caller-safe candidate confirmation may
  identify it as a sample order before speaking its items.
- The store labels a paid order with `gs_payroll_type=sample` when its current
  classification logic finds a product type of `samples` or `closing-kit`, or
  finds only panel items with subtotal under $200. This label may describe a
  matching order but must not replace the normal identifiers or authorization
  checks.
- Twenty-two of the 100 most recent production orders checked on 2026-08-08
  had `gs_payroll_type=sample`. A sampled production sample order had the same
  phone, email, item, shipping-line, status, date, and shipment fields as an
  ordinary order. No separate sample tool or classification system is needed.

#### Orders, shipment, and tracking fields

- Return `gs_tracking_numbers` when it is a populated array; use the legacy
  `_tracking_number` only as a fallback. The tested order contained five
  tracking numbers, and one of the 100 most recent orders contained six.
- For customer-visible carrier text, match the existing GenStone theme:
  prefer `_custom_tracking_provider` when populated, otherwise use
  `_tracking_provider`, then apply `gs_get_carrier_label`. FarApp's ingestion
  code often checks the standard provider first when generating its internal
  order note; that ingestion behavior must not silently override the label the
  website already presents to the customer.
- `_date_shipped` is available as a Unix timestamp when FarApp supplied it.
  Normalize it to a timestamped date in the site timezone. Its presence proves
  only the stored shipped date; it does not prove a carrier scan or delivery.
- WooCommerce does not return a ready tracking URL. The GenStone website
  constructs one with `gs_get_tracking_url` from carrier URL templates in the
  private `genstone_carriers_cache` WordPress option, falling back to the
  `genstone_carriers` ACF option. A backend or email flow can construct the
  same link only from an approved, versioned copy of those templates. Unknown
  providers return the provider and tracking number without a guessed URL.
- `gs_tracking_numbers` is rebuilt when an order changes to `completed` by
  scanning up to 70 order notes for text containing ` with tracking number `.
  The store can therefore show several tracking numbers, but it has no package
  identifier, line-item IDs, shipped quantities, or tracking-number-to-item
  mapping.
- WooCommerce proves only the stored order status, carrier label, tracking
  number(s), stored shipped timestamp, and a derived carrier link. It does not
  contain carrier scan events and cannot verify `in_transit`, `delivered`,
  `exception`, a delivered date, or an ETA. The caller and tracking email must
  never infer those states from `completed` or from a tracking number.
- Multiple tracking numbers do not prove a partial shipment. The linked sibling
  order structure can also produce separate tracking context. Until a source
  provides package/item quantities or an explicit partial-shipment state, the
  shipment tool can return verified tracking identifiers but must not label the
  order `partial`.

#### Retailer orders present in WooCommerce

- The GenStone staff dashboard creates orders with `wc_create_order` and
  `created_via=dashboard`. Dealer and distributor users have role-scoped views,
  but their orders still use the ordinary WooCommerce order model, billing
  fields, line items, metadata, and order ID. They therefore need no separate
  retailer lookup when the record exists in WooCommerce.
- The staff order dashboard can search exact billing phone, exact billing
  email, numeric order ID, billing company (`_billing_company`, partial match),
  and a custom `gs_order_cpo` field (partial match). No distinct retailer or
  store-number order field was found.
- Company and CPO searches are custom staff-dashboard queries, not a confirmed
  read-only retailer API contract. Their partial-match behavior can locate
  candidates for staff but cannot safely identify or authorize a caller. The
  code does not define what CPO means operationally or prove that it is
  consistently populated.
- Retailer, dealer, distributor, or store/PO context may help locate an order
  only when a normal WooCommerce record exists. Candidate location must still
  flow through the same item verification. `gs_order_cpo` or company
  name alone is not sufficient authorization.
- A populated explicit retail-order signal may label the candidate as a retail
  order in the item-confirmation sentence. It does not replace verification or
  authorize any additional order data.
- The public retailer claim form accepts a retailer order number, email, and
  phone. It attempts `wc_get_order` when the number is a WooCommerce ID, but its
  explicit retailer/unknown-order branch still submits the issue for human
  follow-up when no WooCommerce order exists. It does not query a retailer
  portal or create another order index.
- The capability map likewise defines one optional verified WooCommerce lookup
  followed by the existing-order Zendesk path. If the record is absent from
  WooCommerce, return `unsupported` or `not_found` as appropriate and use that
  follow-up; never imply access to the retailer's system.
- A read-only production sample of the 500 most recent orders on 2026-08-08 had
  53 orders with a billing company, two with a known retailer name in that
  field, two with populated `gs_order_cpo`, and three with dealer price level.
  Those signals represented five distinct orders: two known-retailer retail-
  price orders, two dealer-price orders with CPO, and one dealer-price order
  without CPO. All five were created through the dashboard; four were completed
  and one was a quote. This is a bounded signal sample, not a global retailer-
  order count or proof that every company/CPO order is a retailer order.
- All five signaled orders returned complete normal lookup fields: order number,
  billing phone, billing email, and line items. Direct numeric lookup returned
  all five, and the ordinary WooCommerce phone search returned the same order
  for all five after exact normalized-phone filtering. Four of the five phones
  had multiple exact historical order matches, confirming that the adapter must
  exclude quotes, select the newest actual order, and confirm its items.
- Across those 500 REST responses, `gs_order_cpo` was the only metadata key whose
  name indicated store, retailer, dealer, distributor, Pro Desk, or CPO context.
  The production WordPress REST route index exposed zero retailer-, dealer-,
  distributor-, Pro Desk-, or CPO-specific routes.
- Conclusion: do not create a retailer-specific lookup, caller scenario, or
  portal integration. Use the regular phone/numeric-order lookup and normal
  item verification when a WooCommerce record exists; otherwise use
  the existing follow-up path. There is no remaining launch owner decision for
  this boundary.

#### Safe adapter outcomes

| Outcome | Required behavior |
| --- | --- |
| `order_found` | Return only the minimal verification projection. |
| `order_not_found` | Return no customer or order details; try an alternate phone or numeric order number. |
| `multiple_possible_orders` | Return no candidates and request the alternate identifier. Ordinary historical matches still select the newest exact order. |
| `shipment_found` | Return the stored carrier, tracking number(s), stored shipped timestamp, and approved derived link when present. |
| `shipment_unavailable` | The order exists but usable tracking metadata does not. For `processing`, say it is still processing and the customer will be notified by email once ready to ship. Otherwise state the stored status and lack of shipment/arrival data. Do not force support follow-up. |
| `system_error` | Treat authentication, network, rate-limit, server, and invalid-response failures as errors; disclose no data and use normal follow-up. |

### Still Needed

- Provision the permanent dedicated read-only WooCommerce key in the Worker's
  secret path and record only its variable name and owner, never its value.
- Confirm whether linked `gs_sibling_id` orders should be presented as one
  logical order or as separately numbered shipments. The lookup must at least
  retrieve both records so it does not omit items or tracking data.
- Select and authorize the carrier-status connection for any future live
  `in_transit`, `delivered`, `exception`, delivered-date, or ETA response.
  Carrier APIs require credentials or approved shipper access; WooCommerce
  metadata alone cannot supply those states.
- Define partial-shipment truth: the field or external response that maps each
  tracking number/package to shipped line-item quantities and indicates what
  remains unshipped. Multiple tracking numbers alone are insufficient.
- Confirm whether non-US/Canada caller numbers must be supported. The current
  formatter is North-American-number-specific and deliberately leaves other
  formats unchanged.

Evidence checked: the authoritative GenStone capability map; the local
`genstone-live` theme at commit `14e1a123c222e53a42945e6fc02b68836a8659f1`
(2026-08-06); the local WooCommerce FarApp plugin shipment-ingestion source;
production WooCommerce collection and single-order responses on 2026-08-08;
the live public WordPress REST route index on 2026-08-08; and the
[official WooCommerce REST v3 order documentation](https://developer.woocommerce.com/docs/apis/rest-api/v3/orders/).

## WooCommerce And WordPress Product Ownership

Owner task: product field ownership discovery

### Confirmed

- GenStone does not maintain two independent product copies. WooCommerce is the
  commerce layer on WordPress's `product` custom post type. For a live product,
  the WordPress route `/wp-json/wp/v2/product/{id}` and the WooCommerce Store
  route `/wp-json/wc/store/v1/products/{id}` return the same numeric ID, slug,
  permalink, title, short description, and long description. Both public
  collections returned 274 published products when checked on 2026-08-08.
- WooCommerce is not a separate API service from WordPress. All three relevant
  route families are served by the same WordPress REST server under `/wp-json`:
  `wp/v2/product` is the generic WordPress controller for WooCommerce's product
  custom post, `wc/store/v1/products` is WooCommerce's public storefront
  projection, and `wc/v3/products` is WooCommerce's authenticated commerce
  API. They are different namespaces and field contracts over the same product
  records.
- The live `wp/v2/product` schema can read and, with authorization, write the
  core post fields and WooCommerce product taxonomies: title, slug, status,
  content, excerpt, featured media, brand, category, and tag. Its current schema
  does not expose SKU, prices, dimensions, stock, backorders, or
  purchasability. Those commerce fields require a WooCommerce namespace unless
  GenStone later extends the generic WordPress schema. Endpoint namespace must
  not be mistaken for a separate source system.
- The customer-agent repository has no product adapter, product tables,
  WooCommerce/WordPress credentials, or active catalog configuration. The
  ownership below describes the current website, not an implemented caller
  lookup.
- The local `genstone-live` repository is the custom GenStone application
  layer, not a complete WordPress checkout. It commits the GenStone theme but
  not WordPress core or the WooCommerce plugin, so the standard `wp/v2` and
  `wc/*` route-registration code is not present there. The installed plugin is
  what supplies the standard WooCommerce REST namespaces on the running site.
- The theme does contain a substantial custom staff/customer frontend over
  WooCommerce. It renders a `/dashboard` application, reads and writes
  WooCommerce products and orders through PHP objects such as
  `wc_get_product`, `wc_get_order`, and `wc_create_order`, and submits most
  interactive operations to WordPress `admin-ajax.php` through the shared
  `fetch_posts` action. No custom `register_rest_route` or theme-owned REST
  namespace was found. This is an extended WooCommerce application, but it is
  not a separate product or order system.
- Customer.io campaign `5` is a downstream projection of WooCommerce order
  events, not a product authority. Its completed-order event copies order-item
  fields and tracking metadata from the incoming WooCommerce payload; it must
  not be used as the source for specifications, pricing, lifecycle,
  availability, or inventory.

#### Field ownership and boundaries

| Field | Current technical authority | Confirmed boundary |
| --- | --- | --- |
| Product identity and descriptive content | The shared WordPress/WooCommerce product record. WordPress owns the post title, slug, publication state, excerpt, and content; WooCommerce exposes those same values through its product representation. | These are not separate sources to reconcile. Read a single WooCommerce product record for a future consolidated lookup, but expose only an approved field allowlist. |
| Specifications | Product dimensions come from WooCommerce product metadata. Per-product short and long descriptions come from the shared product post. The site's `Specs` tab is a global WordPress ACF option, not a per-product specification record. | There is no complete, normalized specification schema or approved caller-safe specification set. |
| Direct online retail price | WooCommerce product or variation price metadata (`price`, `regular_price`, `sale_price`, and sale dates). The live theme renders these values through the WooCommerce product object. | The public Store API price is the current direct-site unit price, not a project quote, installed price, retailer price, or guaranteed price. |
| Dealer and distributor price | Custom WooCommerce product post metadata maintained through the GenStone staff dashboard. The code has retail, dealer, distributor, and distributor-FOB price levels. | The voice agent has no approved role/price-tier authorization and must continue to use the capability map's human follow-up path for quotes and channel-specific pricing. |
| Publication and catalog lifecycle | WordPress post status and WooCommerce catalog visibility/purchasability on the same product record. | No GenStone-specific `discontinued` field, status, tag, or deterministic mapping was found. A published or purchasable product must not be described as "current" or "not discontinued" until the business lifecycle rule is supplied. |
| Direct-site checkout availability | WooCommerce purchasability and backorder behavior. | This describes whether the website will accept an order; it is not evidence of physical inventory or local-retailer availability. Caller stock questions use the existing follow-up path. |
| Physical inventory | No source is selected because live inventory lookup is intentionally outside the launch scope. WooCommerce has stock fields, but the public responses are deliberately transformed by the live theme and expose no reliable quantity. | Do not build inventory tracking for launch. Do not use the public `is_in_stock` value or the presence of an Add to Cart button as physical-inventory truth. |

#### Shared identifiers

- The WordPress post ID is the WooCommerce product ID. This is the exact join
  key between the two APIs inside the current GenStone site; for example, the
  live Chicago Panel is ID `8460` in both.
- WooCommerce SKU is the stable commerce-facing candidate key. The live theme
  uses SKU as the product identifier for reviews and analytics, and order line
  items carry SKU together with product and variation IDs. The generic
  WordPress product response does not expose SKU, so a caller adapter should
  read it from WooCommerce and verify uniqueness before relying on it across
  external systems.
- Variable products have a parent product ID plus a distinct variation ID and
  variation SKU. A lookup must preserve both rather than collapsing a selected
  variation to the parent.
- Slug and permalink currently match across both APIs, but editors can change
  them. They are navigation fields, not primary integration keys.

#### Confirmed conflicts and caller-safety limits

- The live Chicago Panel record is internally inconsistent: its short
  description says `1.88 SQFT`, while its long description says `3.75 sq. ft.`.
  The page renders the first near the product title and the second in the
  expanded content. Specifications cannot be spoken from arbitrary product
  prose until this record and the broader catalog are reviewed or normalized.
- The live theme globally forces `is_in_stock()` to `true` and changes a raw
  `outofstock` status to `onbackorder` outside the WordPress admin. It also
  renders a hard-coded `Available on backorder (Approx. 7-10 Days)` message.
  This explains why the public Store API can return an out-of-stock-filtered
  product with `is_in_stock: true`; the response is a storefront sales policy,
  not warehouse truth.
- The hard-coded backorder timing is not caller-approved evidence. The
  capability map prohibits inferred ETAs, so the voice agent must not repeat
  `7-10 Days` unless an authoritative, timestamped lookup and an explicit
  spoken-field approval are supplied.
- Adeola confirmed that live inventory lookup is not required for launch. Any
  question about stock, quantity on hand, warehouse or retailer availability,
  replenishment, or backorder timing uses the capability map's existing
  follow-up path. This decision requires no inventory-tracking system or new
  caller scenario.
- No product field is newly approved for caller speech by this discovery.
  Identity, description, price, lifecycle, availability, and inventory must
  continue to follow the capability map: answer only from approved content or
  confirmed live data, and use the existing follow-up path otherwise.

### Still Needed

- Define the business lifecycle states and their exact field mapping,
  especially how a discontinued item is represented and whether a published,
  hidden, non-purchasable, or backordered item can be discontinued.
- Assign an accountable specification owner and resolve the Chicago Panel
  `1.88` versus `3.75` square-foot conflict. Then define a normalized, reviewed
  specification allowlist instead of treating arbitrary post content or the
  global Specs tab as product-specific truth.
- Approve which price, if any, may be spoken: direct-site regular price, active
  sale price with timestamp, or neither. Dealer, distributor, retailer,
  project, installed, discount, and promotional pricing require separate
  authority and must not be inferred from the public product price.
- Confirm SKU uniqueness across all simple products and variations and whether
  any upstream system can change or reuse SKUs. Use numeric product/variation
  IDs as the site-internal join and SKU as the cross-system key only after this
  check.
- Approve the final caller-safe field allowlist. At minimum it must distinguish
  reviewed static facts from timestamped commerce fields and must exclude raw
  HTML, arbitrary descriptions, internal price tiers, stock quantities, and
  any unverified lifecycle or delivery conclusion.

Evidence checked: the authoritative GenStone capability map; the empty active
customer-agent integration surface; the local `genstone-live` theme at commit
`14e1a123c222e53a42945e6fc02b68836a8659f1` (2026-08-06); the local installed
WooCommerce-related plugins; the live public WordPress and WooCommerce Store
APIs on 2026-08-08; the [official WooCommerce Store Products API](https://developer.woocommerce.com/docs/apis/store-api/resources-endpoints/products/),
the [official WooCommerce REST product schema](https://woocommerce.github.io/woocommerce-rest-api-docs/#products),
and the [official WordPress custom-content REST guidance](https://developer.wordpress.org/rest-api/extending-the-rest-api/adding-rest-api-support-for-custom-content-types/).

## Zendesk

Owner task: Zendesk integration discovery

### Confirmed

- Use Zendesk when a request needs tracked support ownership and resolution.
- Use one general create-or-update case action instead of issue-specific tools.
- Later contact about the same issue should update the existing open case.
- Caller-facing language must not mention a case, ticket, or internal ID.
- Communication preference and other relevant caller-provided details are case
  context, not separate scenarios.
- The live account is `genstone.zendesk.com`. Brand `GenStone` (`brand_id`
  `466088`) is active and is the account default.
- A temporary admin API token was used only for read-only discovery. It is not
  launch authentication. Zendesk is retiring API-token authentication, so the
  production backend should use a dedicated, least-privilege Zendesk identity
  and server-side OAuth. The eventual OAuth client, identity, scopes, and
  Worker-owned secret names are not configured in this repository yet.

#### Form, fields, and groups

- `Default Ticket Form` (`ticket_form_id` `13148185979027`) is the only active
  form. It is the default and is end-user visible. Existing API-created tickets
  frequently have no explicit `ticket_form_id`, so selecting this form for the
  new action is a launch choice rather than a requirement copied from the
  historical integrations.
- The account default group is `Support` (`group_id` `26273508`). Other active
  groups are `Customer Service` (`34219842152979`), `Dealers` (`360006278774`),
  `Distributors` (`360006278754`), `Factory` (`43266048`), and
  `Project Coordinators` (`34219828134931`).
- No active trigger or automation assigns a group or agent. Group and assignee
  values therefore come from the creating integration or a human update. Of 79
  unsolved API-channel tickets checked, 72 were in `Support`, 76 were assigned,
  and three were unassigned. This establishes the historical pattern but does
  not identify the correct assignee for the new action.
- The default form contains these useful fields:

| Purpose | Zendesk target | Live behavior |
| --- | --- | --- |
| Requester | Native `requester` / `requester_id` | Required confirmed customer name and email. Zendesk reuses an existing end user by email or creates one. The integration identity remains the submitter when the Tickets API is used normally. |
| Customer name | Custom field `27432028` | Active text field; required only on the public portal. |
| Phone | Custom field `81047148` | Active internal text field. |
| Caller type | Custom field `360025854713` | `contractor`, `customer`, `distributor`, `retail_partner`, or `other`. |
| Country | Custom field `360026226033` | `canada`, `united_states`, or `other_country`. |
| Subject and details | Native `subject` and `comment.body` | Use a short factual subject and a factual comment; do not copy the full transcript by default. |
| Priority | Native `priority` | Supports the normal Zendesk priority values; no caller-urgency mapping is approved. |
| Internal request classification | Custom field `360026303754` (`Ticket Type`) | Existing values include `customer_support`, `shipping_problem`, `refund`, `warranty`, `cancellation`, and others. These are internal routing values, not separate caller flows. |
| Group and assignee | Native `group_id` and `assignee_id` | The form marks Assignee as required in the agent UI, but live API-created and email-created tickets can still be unassigned. |
| Verified order | None | There is no active order-number or WooCommerce-order custom field. |

#### Current routing and lifecycle

- Active open/pending views are organized around Answering Service, Internal
  Support, Partners and Pros, Customer Support, Returns, Shipping, Visualizer,
  and Warranty. The views route mostly by recipient address, tags, caller type,
  and `Ticket Type`; they do not establish group or assignee ownership.
- The create-or-update action should not reproduce Zendesk views. It should
  translate already-confirmed call context into the fields those views and the
  support team use:

| When creating | Zendesk write |
| --- | --- |
| Every unresolved existing-order request | GenStone brand; Default Ticket Form; internal integration requester; `Support` group with no individual assignee; native Type `Question`; normal priority; explicit `answer_connect` tag; Ticket Type `Answering Service`; private factual comment; and `new` status, which the existing trigger changes to `open`. |
| Confirmed caller identity | Store the customer in the custom Customer Name, Phone, caller-type, and Country fields rather than making the caller the launch requester. |
| Phone was confirmed | Store it in Phone field `81047148`. |
| Caller type was confirmed | Map customer/homeowner to `customer`, contractor to `contractor`, distributor to `distributor`, retailer/store/Pro Desk to `retail_partner`, and only use `other` when that is the confirmed fit. |
| Country was confirmed | Store `canada`, `united_states`, or `other_country`; otherwise leave it unset. |
| WooCommerce order was verified | Store the numeric order ID in the proposed dedicated order field once that field exists; include safe order and affected-item context in the private comment. |
| Optional context was volunteered or confirmed | Include relevant retailer/store context, urgency signals, and communication preference in the private comment. Do not ask for these solely to fill Zendesk. |

- The approved launch behavior is to place every unresolved existing-order
  request in the `Support` group with no individual assignee. Use native Type
  `Question`, normal priority, explicit `answer_connect`, and Ticket Type
  `Answering Service`. The custom Ticket Type and caller-type choices provide
  sortable tags such as `answering_service` and `customer`. Populate Customer
  Name, Phone, caller type, and Country when known. This is internal
  classification inside one action, not a separate caller flow.
- The live account also proves these usable view inputs:

| Confirmed support need | Existing Zendesk routing input |
| --- | --- |
| General tracked customer support | `customer_support` tag places the case in the Customer Support view; `customer_support` is also an available `Ticket Type`. |
| Warranty review | `warranty_claim` tag places the case in the Warranty view; `warranty` is an available `Ticket Type`. |
| Tracking escalation | `Ticket Type` `tracking` places the case in the Shipping view. |
| Contractor, distributor, or retail partner | The confirmed caller-type field places it in the Partners and Pros view. |

- The existing Returns view is recipient-address based. The Shipping view is
  recipient-address based except for `Ticket Type` `tracking`. Consequently,
  an API-created `refund`, `cancellation`, or `shipping_problem` may appear in
  Customer Support rather than the specialist view. That is approved for
  launch and does not prevent ownership because the request still uses the
  `Support` group and `customer_support` fallback tag. The specialist views can
  optionally be expanded later to include these Ticket Types.
- For this voice-agent intake, `answer_connect` and `answering_service` are now
  approved sorting values. Do not add unrelated tags such as
  `internal_support`, `paypal_payment`, or `sample_refund` merely to enter a
  view.
- A create-time trigger changes every `new` ticket to `open`. The active custom
  status categories are `new`, `open`, `pending`, and `solved`; `hold` is
  inactive. Creating as `new` therefore has an effective post-trigger state of
  `open`.
- Pending tickets are automatically solved after more than 167 hours without
  an assignee update, except tickets tagged `warranty_claim`. The automation
  emails the requester and uses “support ticket” language. Solved tickets are
  later closed after more than 168 hours.
- Public comments are not passive. An active trigger emails a requester when a
  public comment is added, and another trigger emails the requester and CCs
  when an agent creates a new public ticket. A 25-ticket direct sample of
  current API-created work was entirely public and used the requester as the
  submitter. Voice-agent tickets instead attach the confirmed customer as the
  requester while keeping the initial comment private and the integration
  identity as submitter.
- Across 269 currently unsolved tickets, 34 were open and 235 were pending;
  250 were assigned and 19 were unassigned. Priority was unset on 198 tickets.
  All belonged to the GenStone brand. These counts are a dated operational
  snapshot, not routing policy.

#### Existing-case handling decision

- The voice agent does not search for, compare, select, or update existing
  Zendesk tickets. Every confirmed existing-order support call creates one new
  private answering-service ticket.
- The backend keeps call-and-payload-scoped idempotency and the created Zendesk
  ticket ID so an exact Retell retry does not intentionally create another
  ticket.
- GenStone staff may associate or merge related tickets inside Zendesk. The
  caller is never asked to classify an internal ticket relationship.

#### Caller-facing boundary

- The action may return `created`, `created_notice_failed`,
  `validation_failed`, or `error` to the conversation flow. Any Zendesk ID is
  internal only.
- The caller may be told only that the details were sent to the team and that
  the team will follow up, and only after a success result. Do not promise a
  refund, return, replacement, correction, approval, delivery date, or response
  time.
- The confirmed customer is the requester and the initial comment is private.
  The application does not send a customer email. Zendesk triggers and
  automations must continue excluding these answering-service tickets if all
  Zendesk-originated customer notifications are to remain disabled.

### Still Needed

- Create a dedicated Zendesk integration identity and OAuth client, approve its
  least-privilege scopes, and place its credentials in the project's
  Worker-owned secret path. Do not use a personal admin token in production.
- Approve the subject template and minimum private comment layout: verified
  order, confirmed contact, factual issue summary, affected items, retailer
  context, urgency signals, and communication preference.
- Keep new voice support work unassigned in the approved `Support` group with
  `normal` priority. Caller urgency remains factual internal context.
- Use the internal integration/service identity as requester. Do not create or
  reuse a customer end-user requester at launch; retain confirmed customer
  details as internal case context.
- Add and identify a dedicated custom field for the verified numeric
  WooCommerce order ID. Decide whether a second stable integration issue key or
  Zendesk `external_id` will represent the same support matter.
- Approve the unresolved-case matching rule. The safest candidate is exact
  integration source plus verified order ID plus requester identity plus a
  stable issue key, limited to `new`, `open`, `pending`, or `hold`. Multiple
  matches must fail closed for human review rather than updating arbitrarily.
- Confirm that later contact should preserve current assignment and change a
  `pending` match back to `open` so the new information re-enters an active
  work view.
- Keep all AI-originated comments private and customer notifications disabled.
  A later change to customer participation requires an explicit configuration
  change and review of the current notification and closure automations.

Evidence checked on 2026-08-08: the authoritative GenStone capability map; the
local customer-agent repository and tool contract; the live Zendesk account's
brand, groups, form, fields, statuses, active views, 17 active triggers, four
active automations, 269 unsolved tickets, and direct API-created ticket
samples; the [Zendesk Tickets API](https://developer.zendesk.com/api-reference/ticketing/tickets/tickets/),
[Search API](https://developer.zendesk.com/api-reference/ticketing/ticket-management/search/),
[Ticket Forms API](https://developer.zendesk.com/api-reference/ticketing/tickets/ticket_forms/),
and [OAuth migration guidance](https://developer.zendesk.com/documentation/api-basics/authentication/oauth-migration/).

## Customer.io

Owner task: Customer.io transactional-email discovery

### Confirmed

- Customer.io account `124862` contains the intended `GenStone` workspace,
  whose workspace/environment id is `184464`. It is a US-region, marketing-type
  workspace with normal delivery enabled.
- The workspace has an authenticated `genstone.com` sending domain on the
  shared Mailgun pool. Domain, DKIM, SPF, and CNAME verification are all
  reported as complete.
- Production sends should use Customer.io's US Transactional App API endpoint,
  `POST https://api.customer.io/v1/send/email`, authenticated with a
  workspace-scoped App API key supplied to the Worker as
  `CUSTOMERIO_APP_API_KEY`. This is distinct from Customer.io Track API
  credentials. Never expose or document the key value.
- The active Worker uses the workspace-scoped App API credential supplied as
  `CUSTOMERIO_APP_API_KEY`. Never expose or document its value.
- `GenStone Callback Request` was created as the replacement Customer.io draft
  with transactional message id `5`, content template id `75`, and trigger name
  `genstone_callback_request_v2`. It has a fixed internal recipient of
  `appt@genstone.com`.
- `GenStone Unmatched Prospect Follow-up` was created as the replacement
  Customer.io draft with transactional message id `6`, content template id
  `76`, and trigger name `genstone_unmatched_prospect_v2`. It has a fixed
  internal recipient of `travis.m@genstone.com`. It is used after a confirmed
  new-project caller is not found by Salesforce contact lookup. It does not
  create a Salesforce Lead or Contact and does not email the prospect.
- Both replacement internal messages use the verified
  `GenStone <projects@genstone.com>` From identity and have no Reply-To
  override. They use Customer.io's Rich Text editor with ordinary paragraph
  formatting and plain-text fallbacks; they do not use the superseded large
  headings or tabular report layout. Both use stored Customer.io content rather
  than `auto_create`, allow operational delivery regardless of marketing
  unsubscribe state, disable link tracking, do not queue drafts, and hide
  rendered message bodies from Customer.io delivery history.
- Scheduled callback requests go only to `appt@genstone.com`. Their required
  message data is: internal request reference, Retell call reference, confirmed
  subject, factual description, preferred date, preferred time normalized to
  `America/Denver`, customer name, and confirmed callback phone. Include the
  confirmed customer email, caller type, original timezone/time, order or
  project references, caller-volunteered employee name, and urgency signals
  when present. Urgency changes the email's displayed priority only; it does
  not trigger another message. Do not include raw transcripts, recording URLs,
  credentials, card data, or unrelated customer data.
- A confirmed new prospect whose Salesforce contact lookup returns `not_found`
  uses the unmatched-prospect internal message to Travis. Other new-project
  follow-up uses the ordinary callback path. Neither path creates a Salesforce
  Lead or Contact.
- Callback messages remain internal-only. Adeola approved one separate
  customer-facing transactional use on 2026-08-08:
  after the shared existing-order verification succeeds, when a caller asks
  when the delivery will arrive or requests tracking details, give a concise
  spoken status without reading tracking numbers and offer to email the stored
  details to a complete address confirmed by the caller.
  This is part of the existing order/shipment path, not a new caller scenario.
- `GenStone Order Tracking Email` now exists as the replacement draft
  transactional message id `7`, content template id `77`, and trigger name
  `genstone_order_tracking_details_v2`. It uses the verified
  `GenStone <projects@genstone.com>` sender, the shared empty layout, stored
  Rich Text content with an ordinary paragraph-style email and plain-text
  fallback, no click tracking, operational delivery despite marketing
  unsubscribe state, and hidden rendered bodies in delivery history.
- `GenStone Support Case Created Notice` exists as draft transactional message
  id `8`, content template id `78`, and trigger name
  `genstone_support_case_created_v1`. It uses the same verified sender and
  delivery settings as the other operational messages and has the fixed
  internal recipient `appt@genstone.com`. Its content contains only safe case
  context and the internal Zendesk link; it does not notify the customer.
- The tracking message uses the caller-confirmed destination as the Customer.io
  recipient. The backend passes that address as `to` and the Customer.io email
  identifier. Only after the caller accepts the shipment-email offer, the agent
  asks which complete address to use and confirms it once before sending.
  Required message data is the WooCommerce order number and
  one or more `shipments` containing `provider`, `tracking_number`, optional
  approved `tracking_url`, and optional normalized `shipped_date`.
- **Temporary browser-QA override:** the active Worker ignores the
  caller-confirmed shipment-email destination and sends every shipment message
  to `adeolamorren@gmail.com`, with `travis.m@generalsteel.com` as BCC. The
  caller-supplied address receives nothing. This source-owned safety override
  must be removed before customer-facing delivery is enabled.
- The tracking message is informational. It must state that the carrier link
  has the latest available carrier updates and must not claim an ETA,
  delivered date, `in_transit`, `delivered`, `exception`, or partial shipment
  unless an authoritative carrier response directly supplied that fact.
- Construct one link per tracking number from an approved, versioned copy of
  the GenStone WordPress carrier URL templates used by `gs_get_tracking_url`.
  Normalize the provider, encode the tracking number, permit only reviewed
  HTTPS carrier domains, and omit the link for an unknown provider rather than
  guessing or rendering an arbitrary stored URL.
- For the active callback and unmatched-prospect internal messages, pass the literal staff `to` address
  and the same address as `identifiers.email`, plus the message-specific
  `message_data`. The backend uses transactional message id `5` for callbacks
  and id `6` for unmatched prospects; content template ids `75` and `76` are
  management ids, not App API send identifiers.
- The backend uses transactional message id `7` for the customer-requested
  tracking email; content template id `77` is a management id, not an App API
  send identifier.
- The backend uses transactional message id `8` for the internal notice after a
  new Zendesk case is created; content template id `78` is a management id, not
  an App API send identifier.
- Transactional messages `2`, `3`, and `4` and content templates `69`, `70`,
  and `72` are superseded by messages `5`, `6`, and `7`. Adeola said she will
  delete the superseded messages; the backend must not use their ids or their
  original non-`_v2` trigger names.
- A successful Transactional API request returns HTTP `200` with a unique
  `delivery_id` and `queued_at`. This means Customer.io accepted and queued the
  request; it does not prove inbox delivery. Store the provider delivery id,
  transactional message id, internal request reference, and normalized result
  for audit and later delivery-status reconciliation.
- For a callback, return `scheduled` only after Customer.io accepts the internal
  manager email. If that send fails, attempt the private Slack alert to Travis
  and return `delivery_failed_notified` or `delivery_failed_unnotified`. An
  exact replay returns the original result without sending again. Never expose
  raw Customer.io or Slack errors or provider ids to the caller. Both failure
  results use the approved consolidated callback-failure statement and end the
  call.
- For tracking details, return `sent` only after Customer.io accepts the
  message; otherwise return `shipment_unavailable`, `validation_failed`, or
  `delivery_failed` as appropriate. An exact replay returns the original result
  without sending again. Do not tell the
  caller that email was sent before provider acceptance, and never treat email
  acceptance as proof that the shipment or email was delivered.
- Customer.io's delivery log can later report `sent`, `delivered`, `failed`,
  `bounced`, `dropped`, `deferred`, `queued`, `spammed`, `unsubscribed`, or
  `undeliverable`. Preserve the terminal state and safe failure reason in the
  audit record; do not blindly retry failed POST requests because that can
  duplicate mail.
- The workspace has no default sender identity. Its verified static identities
  are `GenStone <projects@genstone.com>`,
  `GenStone <travis.m@genstone.com>`, and
  `Kevin at GenStone <kevin@genstone.com>`. A fourth dynamic identity exists
  but is not verified and must not be selected for these messages.

### Still Needed

- Review the four active-path Rich Text drafts in the Customer.io UI:
  `GenStone Callback Request` (`5`/`75`),
  `GenStone Unmatched Prospect Follow-up` (`6`/`76`),
  `GenStone Order Tracking Email` (`7`/`77`), and
  `GenStone Support Case Created Notice` (`8`/`78`). Preview the tracking message's
  multiple-shipment rendering with approved sample data, and test only with an
  explicitly approved test order and recipient before activation. This task did
  not activate the replacement messages or send a test or production email.
- Export and review the current `genstone_carriers_cache`/ACF carrier URL
  templates, record a versioned allowlist for the backend, and test URL
  construction for every provider GenStone actually uses. Do not give the
  Worker direct access to arbitrary WordPress option values at send time.
- Transactional messages `5`, `6`, `7`, and `8` remained in `draft` at their
  last state check; message `6` is not part of the approved flow. Superseded
  messages `2`, `3`, and `4` were still
  `active` and pending Adeola's deletion. No test or production email was sent.

## Do-Not-Call

Owner task: do-not-call system discovery

### Confirmed

- Confirm the phone number before recording a suppression request.
- This is an administrative action, not a sales or support case.
- Five9 is the authoritative do-not-call suppression system.
- After the caller confirms the number, send an HTTP `POST` to
  `https://api.five9.com/wsadmin/v12/AdminWebService` with
  `Content-Type: text/xml;charset=UTF-8`.
- The SOAP body calls `addNumbersToDnc`. Its `numbers` value is the confirmed
  area code and local number concatenated without a separator.
- Construct the HTTP Basic Authorization header from the Doppler secrets
  `FIVE9_USERNAME` and `FIVE9_PASSWORD`. The Worker performs the encoding. The
  secret values must never be logged or documented.
- This path writes directly to Five9; it does not create a Salesforce Lead,
  Salesforce Contact, Zendesk ticket, or other sales/support record.
- The signed Worker route successfully validated `addNumbersToDnc` in
  production on 2026-08-09 using the separate username/password secrets.

### Still Needed

- The exact success, already-present, and error responses returned by Five9.
- Where the product records the confirmed number, call/request identity,
  Five9 result, and timestamp for a durable audit without logging credentials.
- The restricted Five9 removal/unsuppression process; the confirmed inbound
  caller path only adds numbers to DNC.

## Cross-System Decisions

Add only decisions that affect more than one section. Keep system-specific
details in the owning section.

### Confirmed

- New-project messages and scheduled callbacks use email.
- Every unresolved existing-order request uses Zendesk.
- The capability map defines caller behavior; external-system limitations must
  fall back to its existing email or Zendesk handling instead of creating a new
  conversation path.

### Still Needed

- None currently.
