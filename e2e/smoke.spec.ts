import fs from "node:fs";

import { expect, test, type Page } from "@playwright/test";

// Signed-in browser state saved by the setup test and reused below, so the suite
// performs only two password sign-ins in total (Better Auth rate-limits sign-in).
const AUTH_STATE = "e2e/.auth.json";

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
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")) as { version: string };
    expect(await res.json()).toMatchObject({ status: "ok", db: "ok", version: pkg.version });
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
    // (/setup → /login → already signed in → /library)
    await page.goto("/setup");
    await expect(page).toHaveURL(/\/library$/);

    // The admin's password (hashed by Better Auth's hasher during setup) works for a
    // normal password login after signing out.
    await page.goto("/settings");
    await page.getByRole("button", { name: "Sign out" }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/login$/);
    await login(page);
    await expect(page.getByText(ADMIN.email).filter({ visible: true }).first()).toBeVisible();
    await page.context().storageState({ path: AUTH_STATE });
  });
});

test.describe("signed out", () => {
  test("rejects a wrong password", async ({ page }, info) => {
    // Once is enough: repeated failures trip the (intended) sign-in rate limit.
    test.skip(info.project.name !== "desktop", "desktop only");
    await page.goto("/login");
    await page.getByLabel("Email").fill(ADMIN.email);
    await page.getByLabel("Password", { exact: true }).fill("not-the-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  });
});

test.describe("signed in", () => {
  test.use({ storageState: AUTH_STATE });

  test("app shell navigation and settings", async ({ page }) => {
    await page.goto("/library");
    for (const name of ["Wishlist", "Add", "Stats", "Settings", "Library"]) {
      await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name }).click();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`/${name.toLowerCase()}$`));
    }

    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Profile", exact: true })).toBeVisible();
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")) as { version: string };
    await expect(page.getByRole("heading", { name: "About", exact: true })).toBeVisible();
    await expect(
      page.getByText(pkg.version, { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    await page.getByLabel("Personal access token").fill("abcdefghijklmnopqrstuvwxyz0123456789ABCD");
    await page.getByRole("button", { name: "Save token" }).click();
    await expect(page.getByText("Discogs token saved.").filter({ visible: true })).toBeVisible();
    await expect(
      page.getByText("A token is saved (••••ABCD).").filter({ visible: true }),
    ).toBeVisible();
  });

  test("unauthenticated users are sent to login", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();
    await page.goto("/settings");
    await expect(page).toHaveURL(/\/login\?next=%2Fsettings$/);
    await ctx.close();
  });

  test("manual entry, another copy, edit with photo, library views", async ({ page }, info) => {
    // Next keeps previously visited routes mounted (hidden) for back/forward, so
    // scope every lookup to visible elements.
    const field = (label: string) =>
      page.getByLabel(label, { exact: true }).filter({ visible: true });
    const text = (t: string) => page.getByText(t).filter({ visible: true }).first();
    const title = `Basement Tapes (${info.project.name})`;
    await page.goto("/add/manual");
    await field("Artist").fill("The Test Pressings");
    await field("Title").fill(title);
    await field("Format").selectOption("cassette");
    await field("Year").fill("1999");
    await field("Barcode").fill("0 12345 67890 5");
    await field("Tracklist").fill("A1 Side One 3:01\nB1 Side Two 4:20");
    await field("Media").selectOption("VG+");
    await field("Price").fill("12.50");
    await field("Location").selectOption("__new__");
    await field("New location name").fill(`Crate ${info.project.name}`);
    await field("Tags").fill("demo, rare");
    await page.getByRole("button", { name: "Add to collection" }).click();

    await expect(page).toHaveURL(/\/album\/[^/?]+\?added=/);
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
    await expect(text("Added to your collection.")).toBeVisible();
    await expect(text("Side Two")).toBeVisible();
    await expect(text(`Crate ${info.project.name}`)).toBeVisible();
    await expect(text("$12.50")).toBeVisible();

    await page.getByRole("link", { name: "Add another copy" }).click();
    await page.getByRole("button", { name: "Add copy" }).click();
    await expect(text("2 copies on your shelves")).toBeVisible();

    await page.getByRole("link", { name: "Edit copy 1" }).click();
    await expect(page.getByRole("heading", { name: "Edit copy" })).toBeVisible();
    await expect(field("Tags")).toHaveValue("demo, rare");
    await field("Notes").fill("Slight shelf wear");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(text("Saved.")).toBeVisible();

    // 1×1 PNG
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    await page
      .getByLabel("Add a photo")
      .setInputFiles({ name: "p.png", mimeType: "image/png", buffer: png });
    await expect(text("Photo added.")).toBeVisible();
    await expect(page.getByRole("img", { name: "Photo 1" })).toBeVisible();

    await page.goto(`/library?q=${encodeURIComponent("basement tapes")}`);
    await expect(
      page.getByRole("link", { name: new RegExp(title.replace(/[()]/g, "\\$&")) }),
    ).toBeVisible();
    await page.goto("/library?view=locations");
    await expect(
      page.getByRole("link", { name: new RegExp(`Crate ${info.project.name}`) }),
    ).toBeVisible();
    await page.goto("/library?view=recent");
    await expect(text(title)).toBeVisible();
    await page.goto("/library?view=formats");
    await expect(page.getByRole("link", { name: /Cassette/ })).toBeVisible();
  });
});
