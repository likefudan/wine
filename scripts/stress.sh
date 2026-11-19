#!/usr/bin/env bash
# Runs one kind of test over and over and keeps going when a round fails, to find tests that only
# fail sometimes. Used by .github/workflows/stress.yml; also works on a laptop:
#
#   bash scripts/stress.sh <mode> <rounds> [label]
#   node scripts/stress-summary.mjs stress-results
#
# Modes:
#   unit          npm test, as CI runs it
#   unit-shuffle  the same tests with files and tests in a random order (a new seed each round)
#   e2e           the browser tests, as CI runs them (needs `npm run build` first)
#   e2e-busy      the same while every CPU core is kept busy, so everything is slow
#   e2e-alone     each browser test file by itself on a fresh site, so none can lean on an earlier one
#
# Everything runs against the local test Worker and its throwaway database. Nothing here reaches the
# test site, production or a paid AI model: no keys are set, and the tests stub those calls.
#
# Each round leaves <id>.json (the test runner's report) and <id>.log in stress-results/, plus one
# line in rounds.tsv: mode, label, round, id, exit status, seconds, seed.
set -u
cd "$(dirname "$0")/.."

mode=${1:?mode}
rounds=${2:?rounds}
label=${3:-local}
out=stress-results
mkdir -p "$out"
failed=0

if [ "$mode" = e2e-busy ]; then
  hogs=()
  for _ in $(seq "$(nproc)"); do
    (while :; do :; done) &
    hogs+=($!)
  done
  trap 'kill "${hogs[@]}" 2>/dev/null' EXIT
fi

# one <round> <name> <seed> <limit seconds> <command...>
one() {
  local round=$1 name=$2 seed=$3 limit=$4
  shift 4
  local id="$mode-$label-$round$name"
  local start=$SECONDS status
  echo "::group::$mode round $round$name"
  REPORT="$PWD/$out/$id.json" timeout -k 10 "$limit" bash -c '"$@"' _ "$@" 2>&1 | tee "$out/$id.log"
  status=${PIPESTATUS[0]}
  echo "::endgroup::"
  if [ "$status" -ge 124 ]; then
    # Stopped for running too long: the local site may still hold the port.
    pkill -f "wrangler dev --port 8788" 2>/dev/null
    pkill workerd 2>/dev/null
    sleep 2
  fi
  [ "$status" -eq 0 ] || failed=$((failed + 1))
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$mode" "$label" "$round" "$id" "$status" "$((SECONDS - start))" "$seed" >> "$out/rounds.tsv"
  echo "$mode round $round$name: exit $status in $((SECONDS - start))s"
}

unit() { npx vitest run --reporter=default --reporter=json --outputFile.json="$REPORT" "$@"; }
browser() { PLAYWRIGHT_JSON_OUTPUT_NAME="$REPORT" npx playwright test --trace off --reporter=list,json "$@"; }
export -f unit browser
export WRANGLER_SEND_METRICS=false

for round in $(seq "$rounds"); do
  case "$mode" in
    unit) one "$round" "" "" 600 unit ;;
    unit-shuffle)
      seed=$(((RANDOM << 15) | RANDOM))
      one "$round" "" "$seed" 600 unit --sequence.shuffle.files --sequence.shuffle.tests --sequence.seed="$seed"
      ;;
    e2e | e2e-busy) one "$round" "" "" 1200 browser ;;
    e2e-alone)
      for file in e2e/*.spec.ts; do
        one "$round" "-$(basename "$file" .spec.ts)" "" 300 browser "$file"
      done
      ;;
    *)
      echo "unknown mode $mode" >&2
      exit 2
      ;;
  esac
done

echo "$mode: $failed failed"
[ "$failed" -eq 0 ]
