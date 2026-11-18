// Renders the PWA icons in public/icons from an SVG ("33" record label).
// Run after changing the design: `node scripts/generate-icons.mjs` (needs the Inter font
// installed for the label text). The PNGs are committed; this isn't part of the build.
import sharp from "sharp";

const ORANGE = "#f5a524";
const INK = "#141414";

/** @param {number} scale record diameter as a fraction of the canvas (maskable needs a safe zone) */
function svg(scale, background) {
  const r = 256 * scale;
  const grooves = [0.92, 0.84, 0.76, 0.68, 0.6]
    .map(
      (f) =>
        `<circle cx="256" cy="256" r="${r * f}" fill="none" stroke="#fff" stroke-opacity="0.07" stroke-width="${r * 0.012}"/>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  ${background ? `<rect width="512" height="512" fill="${background}"/>` : ""}
  <circle cx="256" cy="256" r="${r}" fill="${INK}"/>
  ${grooves}
  <circle cx="256" cy="256" r="${r * 0.48}" fill="${ORANGE}"/>
  <text x="256" y="256" text-anchor="middle" dominant-baseline="central"
    font-family="Inter, Inter Display, sans-serif" font-weight="800" font-size="${r * 0.5}"
    letter-spacing="${-r * 0.02}" fill="${INK}">33</text>
</svg>`;
}

const out = [
  ["icon-192.png", 192, svg(0.98, null)],
  ["icon-512.png", 512, svg(0.98, null)],
  ["maskable-512.png", 512, svg(0.78, "#0b0b0b")],
  ["apple-touch-icon.png", 180, svg(0.86, "#0b0b0b")],
];
for (const [name, size, s] of out) {
  await sharp(Buffer.from(s))
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(`public/icons/${name}`);
  console.log(`public/icons/${name}`);
}
