#!/bin/sh
# Pre-commit hook: run unit tests before every commit.
# UI tests are handled by CI (ci.yml) on push to develop — not run locally.
# Installed automatically via `npm run prepare`.

if npm run --silent test:unit; then
  exit 0
else
  echo ""
  echo "❌  Unit tests failed — commit blocked."
  echo "    Fix the errors above, then commit again."
  echo ""
  exit 1
fi
