# Persistence

This folder owns PlanetScale access through the `HYPERDRIVE` binding.

Keep product SQL in small domain repositories and schema-qualify every product
table under `genstone_customer_agent`. Store normalized operational fields and
private R2 object keys here. Exact Retell webhook bodies belong in
`CALL_ARCHIVE_BUCKET`, not PlanetScale JSON columns. See
[`docs/call-data-storage.md`](../../../docs/call-data-storage.md).
