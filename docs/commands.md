# Commands

Run commands from the repository root.

## Setup

```sh
npm install
npm run cloudflare:types:dev
```

The private `@bradford-road/api` package is resolved through the registry entry
in `.npmrc`. Authentication for private package installation must come from the
operator environment; never commit a token.

## Local Development

```sh
npm run cloudflare:dev
```

This uses Doppler config `dev`, starts Wrangler, and writes cleaned output to
`cloudflare.logs`.

## Verification

```sh
npm run typecheck
npm run retell:typecheck
npm test
npm run cloudflare:deploy:dry-run
```

## Production

```sh
npm run cloudflare:secrets:prod
npm run cloudflare:deploy:prod
npm run cloudflare:logs:prod
```

Secret synchronization and deployment are intentionally separate operations.
Both production commands use the product's approved Wrangler/Doppler access.

Apply the product-owned PlanetScale migrations:

```sh
npm run db:migrate:prod
```

Create the unpublished Retell Conversation Flow and voice-agent draft:

```sh
npm run retell:deploy:draft
```

The Retell command refuses to create a duplicate agent named
`GenStone Customer Agent`. It creates dedicated versioned GenStone shared
subflows and never updates one in place. A safe rerun after a partial failure
reuses only an exact name whose complete repository-owned configuration still
matches: prompts, nodes, edges, tools, parameters, URLs, headers, and model
settings. Otherwise it stops. It reads publication and phone binding from
Retell instead of printing assumed values. It does not publish or bind a phone
number.

## Current Health Check

After starting locally:

```sh
curl http://localhost:8787/health
```
