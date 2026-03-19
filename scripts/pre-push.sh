#!/bin/sh
# Pre-push hook: run UI tests before any push to develop.
# Master pushes are done manually and skip this hook.
# Installed automatically via `npm run prepare`.

BRANCH=$(git rev-parse --abbrev-ref HEAD)

if [ "$BRANCH" = "develop" ]; then
  echo ""
  echo "🧪  Running UI tests before push to '$BRANCH'..."
  echo ""
  npm test
  if [ $? -ne 0 ]; then
    echo ""
    echo "❌  Tests failed — push to '$BRANCH' blocked."
    echo "    Fix the errors above, then push again."
    echo ""
    exit 1
  fi
  echo ""
  echo "✅  All tests passed. Pushing..."
  echo ""
fi

exit 0
