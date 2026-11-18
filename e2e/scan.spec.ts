import { expect, test } from "@playwright/test";

// Runs in the "camera" project: Chromium's fake camera plays e2e/.barcode.y4m.
test.use({ storageState: "e2e/.auth.json" });

test.setTimeout(60_000);

test("crate mode: scan with the camera, review and add", async ({ page }) => {
  await page.goto("/scan?mode=crate");
  await expect(page.getByRole("heading", { name: "Scan", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Start camera" }).click();

  // The barcode matches the release created by the desktop manual-entry test, so the
  // lookup resolves locally (no provider call).
  const queue = page.getByRole("region", { name: /Scanned/ });
  await expect(page.getByText(/Scanned 0?012345678905/)).toBeVisible({ timeout: 15_000 });
  await expect(queue.getByText("Found").first()).toBeVisible({ timeout: 15_000 });
  await expect(queue.getByText(/Basement Tapes \(desktop\)/).first()).toBeVisible();
  await page.getByRole("button", { name: "Stop camera" }).click();

  // Manual fallback queues too.
  await page.getByLabel("Type a barcode").fill("036000291452");
  await page.getByRole("button", { name: "Queue" }).click();
  await expect(queue.getByText(/Basement Tapes \(mobile\)/)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("link", { name: "Review & add" }).click();
  await expect(page.getByRole("heading", { name: "Review scans" })).toBeVisible();
  await page.getByRole("button", { name: /Add selected/ }).click();
  await expect(page.getByText(/Added 2 items to your collection\./)).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Nothing to review")).toBeVisible();
});
