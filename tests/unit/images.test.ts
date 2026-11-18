import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resetEnvCache } from "@/env";
import { imageFile, isAllowedImageUrl, storeImage } from "@/lib/images";

let dir: string;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "33rpm-img-"));
  process.env.DATA_DIR = dir;
  process.env.APP_URL ??= "http://localhost:3000";
  process.env.AUTH_SECRET ??= "x".repeat(32);
  resetEnvCache();
});
afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  resetEnvCache();
});

describe("image host allowlist", () => {
  it.each([
    ["https://coverartarchive.org/release/x/front-250", true],
    ["https://ia800100.us.archive.org/0/items/x.jpg", true],
    ["https://i.discogs.com/abc.jpeg", true],
    ["http://coverartarchive.org/release/x/front", false],
    ["https://evil.example/archive.org.jpg", false],
    ["https://archive.org.evil.example/x.jpg", false],
    ["https://169.254.169.254/latest/meta-data", false],
    ["not a url", false],
  ])("%s → %s", (url, ok) => expect(isAllowedImageUrl(url)).toBe(ok));
});

describe("storeImage", () => {
  it("writes 600 and 1200 px WebP variants without upscaling", async () => {
    const png = await sharp({
      create: { width: 1600, height: 1500, channels: 3, background: "#c60" },
    })
      .png()
      .toBuffer();
    const img = await storeImage(png, { kind: "cover", sourceUrl: "https://i.discogs.com/x.jpg" });
    expect(img).toMatchObject({ kind: "cover", width: 1600, height: 1500 });
    expect(img.path.startsWith("covers/")).toBe(true);
    const small = await sharp(imageFile(img.path, 600)).metadata();
    const large = await sharp(imageFile(img.path, 1200)).metadata();
    expect([small.format, small.width]).toEqual(["webp", 600]);
    expect([large.format, large.width]).toEqual(["webp", 1200]);

    const tiny = await sharp({
      create: { width: 300, height: 300, channels: 3, background: "#000" },
    })
      .jpeg()
      .toBuffer();
    const t = await storeImage(tiny, { kind: "photo", userId: "u1" });
    expect((await sharp(imageFile(t.path, 1200)).metadata()).width).toBe(300);
  });

  it("rejects non-images and path traversal", async () => {
    await expect(storeImage(Buffer.from("hello"), { kind: "photo" })).rejects.toThrow();
    expect(() => imageFile("../../etc/passwd", 600)).toThrow("invalid image path");
  });
});
