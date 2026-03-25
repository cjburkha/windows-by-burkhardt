import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

dotenv.config();

const burkBase = process.env.BASE_URL      || 'http://localhost:3000';
const joseBase = process.env.JOSE_BASE_URL || 'http://localhost:3001';

// Jose project runs when:
//   - CI=true          (GitHub Actions spins up port 3001 via webServer config below), or
//   - JOSE_BASE_URL    is explicitly set (local two-server dev or smoke test pipeline)
const runJose = !!process.env.CI || !!process.env.JOSE_BASE_URL;

// Env shared by both CI test servers (fake credentials — NODE_ENV=test skips real SES)
const ciServerEnv = {
  NODE_ENV:              'test',
  AWS_REGION:            'us-east-1',
  AWS_ACCESS_KEY_ID:     'test-key-id',
  AWS_SECRET_ACCESS_KEY: 'test-secret-key',
};

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    // Burkhardt — runs the full test suite (ui.spec.ts + tenants.spec.ts)
    {
      name: 'burkhardt',
      use: { ...devices['Desktop Chrome'], baseURL: burkBase },
    },
    // Jose — runs only tenants.spec.ts so Burkhardt-specific assertions in
    // ui.spec.ts (e.g. "has correct title: /Windows by Burkhardt/") don't fail.
    // Only enabled in CI (two-server setup) or when JOSE_BASE_URL is provided.
    ...(runJose
      ? [{
          name: 'jose',
          use: { ...devices['Desktop Chrome'], baseURL: joseBase },
          testMatch: ['**/tenants.spec.ts'],
        }]
      : []),
  ],
  // In CI: auto-start TWO server instances — one per tenant — with fake credentials.
  // Locally: NO server is started — tests must run against the real dev server
  //          (`npm run dev`) so real credentials and real SES are exercised.
  ...(process.env.CI && {
    webServer: [
      {
        command: 'node server.js',
        url: 'http://localhost:3000/health',
        reuseExistingServer: false,
        env: { ...ciServerEnv, PORT: '3000', TEST_HOSTNAME: 'windowsbyburkhardt.com' },
      },
      {
        command: 'node server.js',
        url: 'http://localhost:3001/health',
        reuseExistingServer: false,
        env: { ...ciServerEnv, PORT: '3001', TEST_HOSTNAME: 'windowsbyjose.com' },
      },
    ],
  }),
});
