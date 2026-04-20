import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60000,
  retries: 0,
  use: {
    baseURL: BASE_URL,
    headless: true,
  },
  webServer: {
    // Override AUTH_URL / NEXTAUTH_URL so NextAuth uses the local dev
    // origin instead of the production domain baked into .env (which
    // otherwise causes redirects to https://www.savint.it/...).
    command: `AUTH_URL=${BASE_URL}/savint NEXTAUTH_URL=${BASE_URL} PORT=${PORT} npm run dev:custom`,
    port: PORT,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
