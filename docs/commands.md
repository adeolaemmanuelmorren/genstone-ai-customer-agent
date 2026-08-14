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

The Retell command creates or reuses the immutable `v74` shared components. If
the latest agent version is already published, it first creates a new editable
draft from that published version. It then updates the matching draft
Conversation Flow version and verifies that exact agent and flow version by
API readback. It updates dashboard agent
`agent_4863348a135c633285041a504b` by default, or the exact `RETELL_AGENT_ID`
supplied by the operator. It never creates a parallel agent or a detached
Conversation Flow. It reads publication and phone binding from Retell and does
not publish or bind a phone number.

Published Retell versions are immutable. To make the verified draft live,
publish it and repoint the configured phone number with:

```sh
doppler run --config prd -- env RETELL_AGENT_ID=agent_4863348a135c633285041a504b npx tsx scripts/publish-and-bind-retell-agent.ts
```

## Current Health Check

After starting locally:

```sh
curl http://localhost:8787/health
```
