#!/bin/sh
# Post-push hook: watch the GitHub Actions run triggered by this push,
# then automatically download and open the Playwright smoke test report.
#
# Runs in the background so your terminal is not blocked.
# Installed automatically via `npm run prepare` (scripts/install-hooks.js).

echo ""
echo "🚀  Push complete — watching GitHub Actions deploy..."
echo "    Report will open automatically when smoke tests finish."
echo ""

# Run in background so the terminal returns immediately
(
  # Wait a few seconds for GitHub to register the new run
  sleep 6

  RUN_ID=$(gh run list --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null)

  if [ -z "$RUN_ID" ]; then
    echo "⚠️  Could not find a GitHub Actions run — is gh authenticated?"
    exit 0
  fi

  echo "    Watching run $RUN_ID..."
  gh run watch "$RUN_ID" --exit-status 2>/dev/null
  EXIT=$?

  if [ $EXIT -ne 0 ]; then
    echo ""
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║  ❌  SMOKE TESTS FAILED — diagnosing...                  ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo ""
    # Print just the failure section — strip GitHub log prefixes and timestamps
    gh run view "$RUN_ID" --log-failed 2>&1 \
      | sed 's/^[^\t]*\t[^\t]*\t//' \
      | grep -v "^##\[" \
      | grep -v "^shell:\|^env:" \
      | sed '/^[[:space:]]*$/d' \
      | grep -A 40 "Error:\|FAILED\|✘\|expect(" \
      | head -80
    echo ""
    echo "  Full log:    gh run view $RUN_ID --log-failed"
    echo "  All runs:    gh run list --limit 5"
    echo ""
  fi

  # Artifact upload happens after the job completes — give GitHub 15s head start
  # then retry download for up to 90s total
  echo "    Waiting for artifact upload to complete..."
  sleep 15
  for i in $(seq 1 12); do
    gh run download "$RUN_ID" -n playwright-report -D playwright-report 2>/dev/null && break
    echo "    Waiting for artifact to be available (attempt $i/12)..."
    sleep 5
  done

  if [ -f "playwright-report/index.html" ]; then
    open playwright-report/index.html
    if [ $EXIT -eq 0 ]; then
      echo "✅  Deploy passed — report opened."
    else
      echo "❌  Report opened. Fix the failures above, then push again."
    fi
  else
    echo "⚠️  No Playwright report artifact found for run $RUN_ID."
  fi
) &

exit 0
