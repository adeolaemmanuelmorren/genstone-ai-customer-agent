# Porting Notes

## Source

The foundation was derived from the local GenSteel review-agent material found
at `/Users/adeola/genteel-ai-review-agent`. The directory name differs from the
product name inside that source.

Current Bradford platform conventions were checked against:

- `/Users/adeola/bradford-consolidated/docs`
- `/Users/adeola/genstone-ai-backend/backend`
- `/Users/adeola/genteel-ai-review-agent`

## Preserved Patterns

- Backend-only Cloudflare Worker layout.
- Hono route table with a public health endpoint.
- Shared `@bradford-road/api` HTTP primitives.
- Hyperdrive-backed PlanetScale access that fails closed without its binding.
- Structured logging with stronger customer-data redaction.
- Doppler-backed local commands and separate production secret/deploy commands.
- Product documentation and folder ownership maps.

## Not Ported Into The Initial Runtime Foundation

- Retell agents, prompts, webhook routes, and API clients. Current secret names
  are now documented separately, but values never belong in the repository.
- GenSteel post-order review behavior.
- Customer.io review campaigns and review-template rotation.
- Gift-card and Zapier behavior.
- Review-agent tables or the monolithic persistence repository.
- GenSteel Salesforce field mapping and review-order test UI.
- Production identifiers, email recipients, Slack channels, and provider ids.
- Raw audio, `node_modules`, generated Worker types, and historical logs.

## Retell Reference Rule

Retell design and related source material are retained only under
[`../retell-reference-materials`](../retell-reference-materials/README.md).
The authoritative design docs may guide implementation, but historical prompts
and GenSteel behavior must not be copied into runtime code without review.
