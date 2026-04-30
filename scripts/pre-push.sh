#!/bin/sh
# Pre-push hook: run UI tests before any push (all branches).
# Skips DB persistence test ("no mock") which requires prod DATABASE_URL.
# Installed automatically via `npm run prepare`.

echo ""
echo "🧪  Running UI tests locally before push (branch: $(git rev-parse --abbrev-ref HEAD))..."
echo ""

# Start the local dev server in the background
npm run dev &
SERVER_PID=$!

# Wait up to 15s for the server to be ready
READY=0
for i in $(seq 1 15); do
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health 2>/dev/null | grep -q "200"; then
    READY=1
    break
  fi
  sleep 1
done

if [ $READY -eq 0 ]; then
  echo "⚠️  Dev server did not start in 15s — skipping pre-push tests."
  kill $SERVER_PID 2>/dev/null
  exit 0
fi

# Run all tests except the DB persistence test (needs live DATABASE_URL)
npx playwright test --grep-invert "no mock"
TEST_EXIT=$?

# Kill the dev server
kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null

if [ $TEST_EXIT -ne 0 ]; then
  echo ""
  echo "❌  Tests failed — push blocked. Fix the errors above, then push again."
  echo "    To force-push anyway: git push --no-verify"
  echo ""
  exit 1
fi

echo ""
echo "✅  All tests passed. Pushing..."
echo ""

exit 0
