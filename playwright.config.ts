import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

/**
 * Smoke tests against the production build (`npm run build` first).
 * The server starts with an empty data dir, so tests exercise first-run setup.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    // Optional override for environments with a preinstalled Chromium.
    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
      : {}),
  },
  globalSetup: "./e2e/global-setup.ts",
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /scan\.spec/ },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      dependencies: ["desktop"],
      testIgnore: /scan\.spec/,
    },
    {
      // Fake camera showing a generated barcode (see e2e/global-setup.ts).
      name: "camera",
      testMatch: /scan\.spec/,
      dependencies: ["mobile"],
      use: {
        ...devices["Pixel 7"],
        permissions: ["camera"],
        launchOptions: {
          ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
            ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
            : {}),
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            "--use-file-for-fake-video-capture=e2e/.barcode.y4m",
          ],
        },
      },
    },
  ],
  webServer: {
    command: "./scripts/e2e-server.sh",
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { E2E_PORT: String(PORT) },
  },
});
