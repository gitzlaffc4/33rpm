import fs from "node:fs";

import { expect, test, type Page } from "@playwright/test";

const ADMIN = { name: "Test Admin", email: "admin@example.com", password: "correct-horse-battery" };

function setupCodeFromLogs(): string {
  const log = fs.readFileSync("e2e/.server.log", "utf8");
  const codes = [...log.matchAll(/\b([A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4})\b/g)];
  const code = codes.at(-1)?.[1];
  if (!code) throw new Error("No setup code found in server log");
  return code;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password", { exact: true }).fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/library$/);
}

test.describe("first run", () => {
  test("health endpoint reports ok", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBe(true);
    expect(await res.json()).toMatchObject({ status: "ok", db: "ok" });
  });

  test("setup requires the code, creates the admin, and lands in the app", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "desktop", "setup runs once");

    await page.goto("/");
    await expect(page).toHaveURL(/\/setup$/);
    await expect(page.getByRole("heading", { name: "Welcome to 33rpm" })).toBeVisible();

    const fill = async (code: string) => {
      await page.getByLabel("Setup code").fill(code);
      await page.getByLabel("Name").fill(ADMIN.name);
      await page.getByLabel("Email").fill(ADMIN.email);
      await page.getByLabel("Password", { exact: true }).fill(ADMIN.password);
      await page.getByLabel("Confirm password").fill(ADMIN.password);
      await page.getByRole("button", { name: "Create admin account" }).click();
    };

    await fill("AAAA-BBBB-CCCC-DDDD");
    await expect(page.getByText("Invalid setup code")).toBeVisible();

    await fill(setupCodeFromLogs());
    await expect(page).toHaveURL(/\/library$/);
    await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();

    // Setup is closed once an admin exists.
    await page.goto("/setup");
    await expect(page).not.toHaveURL(/\/setup$/);
  });
});

test.describe("signed in", () => {
  test("rejects a wrong password", async ({ page }, info) => {
    // Once is enough: repeated failures trip the (intended) sign-in rate limit.
    test.skip(info.project.name !== "desktop", "desktop only");
    await page.goto("/login");
    await page.getByLabel("Email").fill(ADMIN.email);
    await page.getByLabel("Password", { exact: true }).fill("not-the-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  });

  test("app shell navigation and settings", async ({ page }) => {
    await login(page);
    for (const name of ["Wishlist", "Add", "Stats", "Settings", "Library"]) {
      await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name }).click();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`/${name.toLowerCase()}$`));
    }

    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Profile", exact: true })).toBeVisible();
    await page.getByLabel("Personal access token").fill("abcdefghijklmnopqrstuvwxyz0123456789ABCD");
    await page.getByRole("button", { name: "Save token" }).click();
    await expect(page.getByText("Discogs token saved.").filter({ visible: true })).toBeVisible();
    await expect(
      page.getByText("A token is saved (••••ABCD).").filter({ visible: true }),
    ).toBeVisible();
  });

  test("unauthenticated users are sent to login", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/login\?next=%2Fsettings$/);
    await ctx.close();
  });
});
