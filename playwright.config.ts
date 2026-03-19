import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';

dotenv.config();

const baseURL = process.env.BASE_URL || 'http://localhost:3000';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // In CI: auto-start a test server with fake credentials (NODE_ENV=test skips real SES).
  // Locally: NO server is started — tests must run against the real dev server
  //          (`npm run dev`) so real credentials and real SES are exercised.
  ...(process.env.CI && {
    webServer: {
      command: 'node server.js',
      url: 'http://localhost:3000/health',
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'test',
        PORT: '3000',
        AWS_REGION: 'us-east-1',
        AWS_ACCESS_KEY_ID: 'test-key-id',
        AWS_SECRET_ACCESS_KEY: 'test-secret-key',
        AWS_SES_FROM_EMAIL: 'noreply@example.com',
        RECIPIENT_EMAIL: 'test@example.com',
      },
    },
  }),
});
