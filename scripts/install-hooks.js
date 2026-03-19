#!/usr/bin/env node
// Installs the pre-push git hook from scripts/pre-push.sh into .git/hooks/.
// Runs automatically on `npm install` via the `prepare` lifecycle script.

const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, 'pre-push.sh');
const hooksDir = path.join(__dirname, '..', '.git', 'hooks');
const dst = path.join(hooksDir, 'pre-push');

if (!fs.existsSync(hooksDir)) {
  console.log('⚠️  No .git/hooks directory found — skipping hook install.');
  process.exit(0);
}

fs.copyFileSync(src, dst);
fs.chmodSync(dst, 0o755);
console.log('✅  pre-push hook installed (.git/hooks/pre-push)');
