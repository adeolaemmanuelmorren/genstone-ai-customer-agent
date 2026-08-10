#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_FILE="$ROOT_DIR/cloudflare.logs"
STRIP_ANSI="$ROOT_DIR/scripts/dev-commands/strip-ansi.pl"

cd "$ROOT_DIR"

{
  printf "\n--- production log tail started %s ---\n" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  npx wrangler tail
} 2>&1 | tee >(perl "$STRIP_ANSI" >> "$LOG_FILE")
