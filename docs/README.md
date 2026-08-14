# GenStone AI Customer Agent Docs

## Repo Type

Backend-only Cloudflare Worker repository.

## Current Runtime Shape

The deployed runtime exposes:

- `GET /health` for public deploy checks.
- the signed Retell webhook archive;
- signed and bearer-protected Retell tool routes, including business-hours,
  unified support follow-up, and indexed WooCommerce order resolution;
- Hyperdrive-backed product persistence and a private R2 archive binding;
- focused Salesforce, WooCommerce, Customer.io, Zendesk, and Five9 clients.

The Retell Conversation Flow deployment definition is present under `retell/`.
The deployed Retell agent uses the published `v73` responsibility-component
flow. The local `v74` replacement has eight isolated subflows with explicit
diagram-based canvas positions and visible Call Transfer nodes. Its main canvas
contains a silent caller-number preparation step, component entries, one
responsibility router, two global human interruptions, and the final end node.
Cross-responsibility changes pass `next_responsibility` and one
`pending_request` to the destination, then clear both immediately after use; no
rolling context variable is maintained. New Project, Existing Order, and
General Knowledge each retain their own same-context follow-up questions.
Release `v74` uses dedicated Extract Dynamic Variables nodes and deterministic
equation gates before downstream routing or tool execution. Live phone-path and
Twilio transfer QA remain outstanding as recorded in
[Implementation next steps](./implementation-next-steps.md).
No Workflow, Durable Object, Queue, or scheduled trigger is active.

Retell design and historical GenSteel reference material are intentionally isolated in
[`../retell-reference-materials`](../retell-reference-materials/README.md). It
is not imported by the Worker. The capability map in that folder is the current
conversation specification; the copied historical examples are not.

## Folder Map

| Path | Owns |
| --- | --- |
| `src/index.ts` | Thin Worker entrypoint. |
| `src/entrypoints/http` | Hono route registration, authentication gates, parsing, and response shape. |
| `src/services` | Product behavior, persistence, and provider adapters. |
| `src/workflows` | Future durable business timelines. |
| `src/schemas` | Runtime payload and workflow contracts. |
| `src/lib` | Small product-local infrastructure such as structured logging. |
| `src/types` | Worker environment and binding contracts. |
| `src/utils` | Tiny dependency-light helpers. |
| `src/testing` | Fixtures and runtime test harnesses. |
| `migrations` | Product-owned PlanetScale migrations. |
| `retell` | Typed Retell Conversation Flow and agent build definition. |
| `scripts` | Product-owned migration, deployment, and operator commands. |
| `retell-reference-materials` | Historical reference material that cannot be imported by runtime code. |

## Dependency Flow

```text
HTTP routes
  -> validated schemas
  -> product services or durable workflows
  -> persistence and provider adapters
  -> external systems
```

The authoritative provider and tool-flow design remains under
`retell-reference-materials/docs`; the active implementation follows it from
the Worker and `retell/` without importing reference files at runtime.

## Shared Package Usage

The Worker consumes the published `@bradford-road/api` package for generic Hono
primitives. Product routes, product schemas, SQL, tool policy, and business
behavior remain in this repository.

## Reading Order

1. [External systems](./external-systems.md)
2. [Retell agent build specification](../retell-reference-materials/docs/retell-agent-build-spec.md)
3. [Retell capability and tool design](../retell-reference-materials/docs/README.md)
4. [Environment variables](./environment-variables.md)
5. [Call data storage](./call-data-storage.md)
6. [Porting notes](./porting-notes.md)
7. [API setup](./api-setup.md)
8. [Product schema](./product-schema.md)
9. [Commands](./commands.md)
10. [QA validation](./qa-validation.md)
11. [Owner test-call findings and correction plan](./owner-test-call-findings.md)
12. [Retell variable and routing risk audit](./retell-variable-and-routing-risk-audit.md)
13. [Detailed external-system research](./external-systems-reference.md)

## Placement Rules

- Keep `src/index.ts` thin.
- Keep external URL registration easy to scan in `entrypoints/http/routes.ts`.
- Authenticate, parse, and validate at the HTTP boundary.
- Keep provider calls and SQL out of route files.
- Keep workflow classes readable as business timelines.
- Keep SQL schema-qualified under the product schema.
- Keep full provider webhook bodies in private R2 and only their object keys
  plus normalized operational fields in PlanetScale.
- Keep unapproved prompt copy and provider experiments out of the active
  runtime.
- Never import from `retell-reference-materials`.
