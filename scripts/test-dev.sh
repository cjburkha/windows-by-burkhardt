#!/usr/bin/env bash
# scripts/test-dev.sh
# Runs UI tests against localhost:3000 with smart server lifecycle management.
#
# Fast path — server already running (e.g. `npm run dev` in another terminal):
#   Tests run immediately against it, server left running when done.
#
# Cold path — no server running:
#   Starts node directly (no npm/nodemon overhead — ~0.4s), runs tests,
#   then leaves the server running so you can inspect the app afterwards.

set -e

PORT=3000
SERVER_PID=""

is_up() {
  curl -sf "http://localhost:$PORT/health" > /dev/null 2>&1
}

if is_up; then
  echo "▶ Server already on :$PORT — running tests against it"
else
  echo "▶ Starting server..."
  # Start node directly — skips npm+nodemon for a fast cold start
  node server.js &
  SERVER_PID=$!

  # Poll /health at 100ms intervals, max 5 seconds
  for i in $(seq 1 50); do
    if is_up; then
      echo "  ✔ Ready in ~$((i * 100))ms"
      break
    fi
    sleep 0.1
    if [ $i -eq 50 ]; then
      echo "❌ Server did not start within 5s"
      kill "$SERVER_PID" 2>/dev/null || true
      exit 1
    fi
  done
fi

# Run tests and open the HTML report
npm run test:open
TEST_EXIT=$?

echo ""
echo "✔  Server still running on http://localhost:$PORT"
echo "   (Stop with: lsof -ti:$PORT | xargs kill)"

exit $TEST_EXIT
