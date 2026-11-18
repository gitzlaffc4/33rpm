/**
 * Renders an EAN-13 barcode into a Y4M video for Chromium's fake camera
 * (--use-file-for-fake-video-capture), so the scan test exercises the real decoder.
 */
import fs from "node:fs";

export const BARCODE_VIDEO = "e2e/.barcode.y4m";
/** UPC-A 012345678905 as EAN-13; it's the barcode the desktop manual-entry test uses. */
export const SCAN_CODE = "0012345678905";

const L = [
  "0001101",
  "0011001",
  "0010011",
  "0111101",
  "0100011",
  "0110001",
  "0101111",
  "0111011",
  "0110111",
  "0001011",
];
const G = L.map((p) =>
  [...p]
    .map((b) => (b === "1" ? "0" : "1"))
    .reverse()
    .join(""),
);
const R = L.map((p) => [...p].map((b) => (b === "1" ? "0" : "1")).join(""));
const PARITY = [
  "LLLLLL",
  "LLGLGG",
  "LLGGLG",
  "LLGGGL",
  "LGLLGG",
  "LGGLLG",
  "LGGGLL",
  "LGLGLG",
  "LGLGGL",
  "LGGLGL",
];

export function ean13Modules(code: string): string {
  const d = [...code].map(Number);
  let bits = "101";
  for (let i = 1; i <= 6; i++) bits += PARITY[d[0]][i - 1] === "L" ? L[d[i]] : G[d[i]];
  bits += "01010";
  for (let i = 7; i <= 12; i++) bits += R[d[i]];
  return bits + "101";
}

export default function globalSetup() {
  const W = 640;
  const H = 480;
  const moduleWidth = 5;
  const bits = ean13Modules(SCAN_CODE);
  const x0 = Math.floor((W - bits.length * moduleWidth) / 2);
  const y = Buffer.alloc(W * H, 235); // white page
  for (let row = 120; row < 360; row++) {
    for (let i = 0; i < bits.length; i++) {
      if (bits[i] !== "1") continue;
      y.fill(16, row * W + x0 + i * moduleWidth, row * W + x0 + (i + 1) * moduleWidth);
    }
  }
  const chroma = Buffer.alloc((W / 2) * (H / 2) * 2, 128);
  const frame = Buffer.concat([Buffer.from("FRAME\n"), y, chroma]);
  fs.writeFileSync(
    BARCODE_VIDEO,
    Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`), frame, frame]),
  );
}
