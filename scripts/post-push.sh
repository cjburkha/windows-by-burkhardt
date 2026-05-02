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

# Ensure Homebrew and user-installed binaries are on PATH in non-interactive shells
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"

# Run in background so the terminal returns immediately
REPO_DIR="$(git rev-parse --show-toplevel)"
SHA="$(git rev-parse HEAD)"
LOG="$REPO_DIR/.git/post-push.log"

(
  exec 3>&1           # keep fd 3 pointing at the real terminal
  exec > "$LOG" 2>&1  # redirect stdout/stderr to log file
  cd "$REPO_DIR" || exit 1

  echo "[post-push] SHA=$SHA"
  echo "[post-push] PATH=$PATH"

  # Wait for GitHub to register the run for this exact commit SHA
  RUN_ID=""
  for i in $(seq 1 15); do
    RUN_ID=$(gh run list --commit "$SHA" --limit 1 --json databaseId --jq '.[0].databaseId' 2>/dev/null)
    [ -n "$RUN_ID" ] && [ "$RUN_ID" != "null" ] && break
    echo "[post-push] Waiting for run (attempt $i/15)..."
    sleep 3
  done

  if [ -z "$RUN_ID" ] || [ "$RUN_ID" = "null" ]; then
    echo "[post-push] Could not find a GitHub Actions run for commit $SHA"
    osascript -e 'display notification "Could not find CI run — check gh auth" with title "⚠️ CI Hook" sound name "Basso"' 2>/dev/null || true
    exit 0
  fi

  echo "[post-push] Watching run $RUN_ID..."
  # Pipe through cat so output is captured; use --exit-status for failure detection
  gh run watch "$RUN_ID" --exit-status 2>&1 | cat
  EXIT=${PIPESTATUS[0]}
  echo "[post-push] Run finished — exit=$EXIT"

  if [ $EXIT -ne 0 ]; then
    echo "[post-push] CI FAILED"
    FAIL_LOG=$(gh run view "$RUN_ID" --log-failed 2>&1 \
      | sed 's/^[^\t]*\t[^\t]*\t//' \
      | grep -v "^##\[" \
      | grep -v "^shell:\|^env:" \
      | sed '/^[[:space:]]*$/d' \
      | grep -A 40 "Error:\|FAILED\|✘\|expect(\|\[ERROR\]" \
      | head -80)
    echo "$FAIL_LOG"
    FIRST_ERROR=$(echo "$FAIL_LOG" | grep -m1 "Error:\|expect(" | sed 's/^ *//' | cut -c1-80)
    # Print to real terminal (fd 3) and notify
    echo "" >&3
    echo "╔══════════════════════════════════════════════════════════╗" >&3
    echo "║  ❌  CI FAILED — see .git/post-push.log for details      ║" >&3
    echo "╚══════════════════════════════════════════════════════════╝" >&3
    echo "  ${FIRST_ERROR:-Check .git/post-push.log}" >&3
    echo "  Full log:  gh run view $RUN_ID --log-failed" >&3
    echo "" >&3
    osascript -e "display notification \"${FIRST_ERROR:-Check terminal for details}\" with title \"❌ CI FAILED\" subtitle \"Smoke tests — run $RUN_ID\" sound name \"Basso\"" 2>/dev/null || true
  else
    echo "[post-push] CI PASSED"
    COMMIT_MSG=$(git log -1 --pretty=%s HEAD 2>/dev/null | cut -c1-60)
    echo "✅  CI passed — $COMMIT_MSG" >&3
    osascript -e "display notification \"All smoke tests passed ✅\" with title \"CI PASSED\" subtitle \"$COMMIT_MSG\" sound name \"Glass\"" 2>/dev/null || true
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
      echo "✅  Report opened." >&3
    else
      echo "❌  Report opened. Fix the failures above, then push again." >&3
    fi
  else
    echo "⚠️  No Playwright report artifact found for run $RUN_ID." >&3
    if [ $EXIT -ne 0 ]; then
      osascript -e "display notification \"Report artifact missing — check gh run view $RUN_ID\" with title \"❌ CI FAILED\" sound name \"Basso\"" 2>/dev/null || true
    fi
  fi
) &

exit 0
