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
REPO_DIR="$(git rev-parse --show-toplevel)"
SHA="$(git rev-parse HEAD)"
(
  cd "$REPO_DIR" || exit 0

  # Wait for GitHub to register the run for this exact commit SHA
  RUN_ID=""
  for i in $(seq 1 15); do
    RUN_ID=$(gh run list --commit "$SHA" --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null)
    [ -n "$RUN_ID" ] && break
    sleep 3
  done

  if [ -z "$RUN_ID" ]; then
    echo "⚠️  Could not find a GitHub Actions run for commit $SHA — is gh authenticated?"
    exit 0
  fi

  echo "    Watching run $RUN_ID..."
  gh run watch "$RUN_ID" --exit-status 2>/dev/null
  EXIT=$?

  if [ $EXIT -ne 0 ]; then
    echo ""
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║  ❌  CI FAILED — diagnosing...                           ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo ""
    # Print just the failure section — strip GitHub log prefixes and timestamps
    FAIL_LOG=$(gh run view "$RUN_ID" --log-failed 2>&1 \
      | sed 's/^[^\t]*\t[^\t]*\t//' \
      | grep -v "^##\[" \
      | grep -v "^shell:\|^env:" \
      | sed '/^[[:space:]]*$/d' \
      | grep -A 40 "Error:\|FAILED\|✘\|expect(\|\[ERROR\]" \
      | head -80)
    echo "$FAIL_LOG"
    echo ""
    echo "  Full log:    gh run view $RUN_ID --log-failed"
    echo "  All runs:    gh run list --limit 5"
    echo ""
    # macOS banner notification — visible regardless of which app is in focus
    FIRST_ERROR=$(echo "$FAIL_LOG" | grep -m1 "Error:\|expect(" | sed 's/^ *//' | cut -c1-80)
    osascript -e "display notification \"${FIRST_ERROR:-Check terminal for details}\" with title \"❌ CI FAILED\" subtitle \"Smoke tests — run $RUN_ID\" sound name \"Basso\"" 2>/dev/null || true
  else
    osascript -e "display notification \"All smoke tests passed ✅\" with title \"CI PASSED\" subtitle \"$(git log -1 --pretty=%s HEAD 2>/dev/null | cut -c1-60)\" sound name \"Glass\"" 2>/dev/null || true
  fi

  # Artifact upload happens after the job completes — give GitHub 15s head start
  # then retry download for up to 90s total
  echo "    Waiting for artifact upload to complete..."
  sleep 15
  rm -rf playwright-report
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
    if [ $EXIT -ne 0 ]; then
      osascript -e "display notification \"Report artifact missing — check gh run view $RUN_ID\" with title \"❌ CI FAILED\" sound name \"Basso\"" 2>/dev/null || true
    fi
  fi
) &

exit 0
