# Legacy GenSteel Runtime Snapshot

This is a selective, non-compiling snapshot of the Retell-facing GenSteel
review-agent implementation. Paths mirror the historical source where useful.

The snapshot includes inbound webhook handling, Retell call creation, web-call
testing, review outcome orchestration, and the persistence model that supported
those flows. Imports may refer to files that exist only in the historical
source repository.

Use it to understand previous decisions and failure modes. Do not add this
folder to TypeScript compilation or import from it in active runtime code.
