# HTTP Entrypoint

This folder owns Hono route registration, route-level authentication, request
parsing, schema validation dispatch, and stable JSON responses.

Do not put provider fetch calls, product SQL, or multi-step orchestration here.
