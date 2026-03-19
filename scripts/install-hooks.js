#!/usr/bin/env node
// Installs git hooks from scripts/ into .git/hooks/.
// Runs automatically on `npm install` via the `prepare` lifecycle script.
//
// Hooks installed:
//   pre-commit  → scripts/pre-commit.sh  (runs unit tests before every commit)
//
// UI tests (Playwright) are NOT run locally — they run in CI on push to develop.

const fs = require('fs');
const path = require('path');

const hooksDir = path.join(__dirname, '..', '.git', 'hooks');

if (!fs.existsSync(hooksDir)) {
  console.log('⚠️  No .git/hooks directory found — skipping hook install.');
  process.exit(0);
}

const hooks = [
  { src: 'pre-commit.sh', dst: 'pre-commit' },
];

for (const { src, dst } of hooks) {
  const srcPath = path.join(__dirname, src);
  const dstPath = path.join(hooksDir, dst);
  fs.copyFileSync(srcPath, dstPath);
  fs.chmodSync(dstPath, 0o755);
  console.log(`✅  ${dst} hook installed (.git/hooks/${dst})`);
}
