# GenStone AI Customer Agent

Cloudflare Worker backend and Retell build definition for the GenStone
customer-service agent.

The deployed Worker contains the signed webhook archive and the approved
Salesforce, WooCommerce, Customer.io, Zendesk, and Five9 tool routes. The
Retell Conversation Flow definition is in [`retell`](./retell/build-config.ts).
The API-verified agent remains unpublished and unbound until a production phone
number is available and the launch test matrix passes.

Historical GenSteel Retell material and the authoritative GenStone design are
isolated under
[`retell-reference-materials`](./retell-reference-materials/README.md).

Read [`docs/README.md`](./docs/README.md) first.
