# Services

Services own product behavior behind the HTTP boundary.

- `persistence` owns Hyperdrive-backed product data access.
- The focused R2 archive service owns exact provider-payload writes through
  `CALL_ARCHIVE_BUCKET`; persistence stores the resulting object key and state.
- `tools` coordinates the approved Retell tools without exposing provider
  identifiers or errors.
- Provider-specific clients own Salesforce, WooCommerce, Customer.io, Zendesk,
  and Five9 protocol details.

Routes call services. Services may call provider adapters and focused
repositories. Do not create one repository or client that owns the entire
product.
