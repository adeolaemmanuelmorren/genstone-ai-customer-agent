# Worker Source

This folder owns the Cloudflare Worker runtime.

`index.ts` stays thin and delegates HTTP behavior to `entrypoints/http`.
Provider clients, SQL, and orchestration do not belong in the entrypoint.
