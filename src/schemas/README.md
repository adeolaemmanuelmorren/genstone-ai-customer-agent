# Schemas

Schemas own strict runtime contracts for external payloads, tool requests,
workflow inputs, and canonical action names.

Do not use an empty passthrough schema for provider webhooks. Validate the
minimum identifiers and event fields required for safe processing.
