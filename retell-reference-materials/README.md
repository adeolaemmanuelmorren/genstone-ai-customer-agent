# Retell Reference Materials

This folder contains the approved GenStone Retell Conversation Flow design and
preserves historical GenSteel prompts, call examples, and implementation
material for reference.

## Boundary

- Nothing in this folder is imported by the active Worker.
- Nothing here is an approved GenStone prompt. Files under `docs` distinguish
  the authoritative GenStone design from non-authoritative examples.
- GenSteel branding, provider ids, field mappings, URLs, and business behavior
  must not be reused without review.
- Legacy source is retained for architecture comparison, not compilation.
- The active Worker has no Retell routes yet. Current secret names are
  documented in `docs/environment-variables.md`; secret values remain outside
  the repository.
- A legacy Zapier webhook endpoint was redacted rather than copied into this
  repository.

## Contents

| Path | Contents |
| --- | --- |
| `docs` | Current Retell Conversation Flow design, capability map, tool contracts, and clearly labeled extended references. |
| `prompts-and-handoffs` | GenSteel Retell handoff and multi-prompt conversation material. |
| `source-examples` | Markdown transcripts and notes used to shape the historical GenSteel agent. |
| `legacy-gensteel/runtime` | Historical Retell client, webhook, test-call, and outcome workflow source. |
| `legacy-gensteel/migrations` | Historical review-agent persistence schema for comparison only. |
| `legacy-gensteel/docs` | Historical API, schema, environment, and QA documentation. |

## Known Patterns Not To Copy Blindly

- Permissive webhook schemas.
- Manual authentication bypasses on production provider webhooks.
- Provider calls and persistence combined in one retryable step.
- Raw customer payload retention without a defined lifecycle.
- Hard-coded provider identifiers and notification destinations.
- Browser test pages served directly from the Worker.
- Review-agent-specific order and campaign models.

The original WAV files were not duplicated. They remain at the historical
source path and would unnecessarily add large binaries to this new repository.

## Current Research

Read these before implementing Retell:

1. [GenStone capability map](./docs/genstone-capability-map.md)
2. [Retell agent build specification](./docs/retell-agent-build-spec.md)
3. [Tool contract catalog](./docs/tool-contract-catalog.md)
4. [Conversation Flow reference](./docs/conversation-flow-reference.md)
