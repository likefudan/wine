#!/bin/sh
# A throwaway local site for the browser tests: its own database under .wrangler/e2e, migrated from
# scratch, on port 8788, with the test-only email sign-in. Needs `npm run build` first.
set -e
cd "$(dirname "$0")/.."
rm -rf .wrangler/e2e
npx wrangler d1 migrations apply DB --local --persist-to .wrangler/e2e > /dev/null
exec npx wrangler dev --port 8788 --persist-to .wrangler/e2e --show-interactive-dev-session=false \
  --var DEV_LOGIN:1 --var ENVIRONMENT:e2e --var OWNER_EMAILS:owner@example.com --var SITE_ORIGIN:http://localhost:8788
