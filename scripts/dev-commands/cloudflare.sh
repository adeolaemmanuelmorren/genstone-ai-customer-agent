#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_FILE="$ROOT_DIR/cloudflare.logs"
STRIP_ANSI="$ROOT_DIR/scripts/dev-commands/strip-ansi.pl"

cd "$ROOT_DIR"

FORCE_COLOR=1 \
CLICOLOR_FORCE=1 \
npm_config_color=always \
doppler run --config dev --mount .env -- npx wrangler dev 2>&1 | tee >(perl "$STRIP_ANSI" > "$LOG_FILE")
