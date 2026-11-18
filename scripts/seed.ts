/**
 * Dev seed: ~20 well-known releases across formats, with copies, locations and tags.
 *
 *   npm run db:seed -- [email]
 *
 * Uses the same DATABASE_URL / DATA_DIR as the app and adds everything for the given
 * user (default: the only/first user, so run first-run setup first). Covers are
 * generated placeholders (no network, nothing copyrighted). Refuses to run twice for
 * the same user unless --force is passed.
 */
import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";
import sharp from "sharp";

import { getDb } from "@/db";
import {
  createCopy,
  createManualRelease,
  ensureLocation,
  countCopies,
  type Condition,
} from "@/db/repos/catalog";
import { exclusive } from "@/db/tx";
import type { Format, Track } from "@/lib/catalog/types";
import { storeImage } from "@/lib/images";

type Seed = {
  artist: string;
  title: string;
  year: number;
  format: Format;
  details: string[];
  label: string;
  catno?: string;
  country: string;
  tracks?: string[];
  copy: {
    media?: Condition;
    sleeve?: Condition;
    price?: number;
    location: string;
    tags?: string[];
    daysAgo: number;
  };
};

const SEEDS: Seed[] = [
  {
    artist: "Fleetwood Mac",
    title: "Rumours",
    year: 1977,
    format: "vinyl",
    details: ["LP", "Album"],
    label: "Warner Bros. Records",
    catno: "BSK 3010",
    country: "US",
    tracks: [
      "Second Hand News",
      "Dreams",
      "Never Going Back Again",
      "Don't Stop",
      "Go Your Own Way",
      "Songbird",
    ],
    copy: {
      media: "VG+",
      sleeve: "VG",
      price: 1800,
      location: "Shelf A",
      tags: ["OG pressing"],
      daysAgo: 40,
    },
  },
  {
    artist: "Fleetwood Mac",
    title: "Rumours",
    year: 2004,
    format: "cd",
    details: ["Album", "Remastered"],
    label: "Warner Bros. Records",
    country: "US",
    copy: { media: "NM", sleeve: "NM", price: 800, location: "CD Tower", daysAgo: 12 },
  },
  {
    artist: "Pink Floyd",
    title: "The Dark Side of the Moon",
    year: 1973,
    format: "vinyl",
    details: ["LP", "Album", "Gatefold"],
    label: "Harvest",
    catno: "SHVL 804",
    country: "UK",
    tracks: ["Speak to Me", "Breathe", "On the Run", "Time", "The Great Gig in the Sky"],
    copy: {
      media: "VG",
      sleeve: "VG",
      price: 4500,
      location: "Shelf A",
      tags: ["OG pressing", "gatefold"],
      daysAgo: 90,
    },
  },
  {
    artist: "Nirvana",
    title: "Nevermind",
    year: 1991,
    format: "cd",
    details: ["Album"],
    label: "DGC",
    catno: "DGCD-24425",
    country: "US",
    tracks: ["Smells Like Teen Spirit", "In Bloom", "Come as You Are", "Breed", "Lithium"],
    copy: { media: "VG+", sleeve: "VG+", price: 500, location: "CD Tower", daysAgo: 200 },
  },
  {
    artist: "The Beatles",
    title: "Abbey Road",
    year: 1969,
    format: "vinyl",
    details: ["LP", "Album", "Stereo"],
    label: "Apple Records",
    catno: "PCS 7088",
    country: "UK",
    tracks: [
      "Come Together",
      "Something",
      "Maxwell's Silver Hammer",
      "Oh! Darling",
      "Octopus's Garden",
    ],
    copy: {
      media: "VG+",
      sleeve: "G+",
      price: 6000,
      location: "Shelf A",
      tags: ["OG pressing"],
      daysAgo: 300,
    },
  },
  {
    artist: "Miles Davis",
    title: "Kind of Blue",
    year: 1959,
    format: "vinyl",
    details: ["LP", "Album", "Mono"],
    label: "Columbia",
    catno: "CL 1355",
    country: "US",
    tracks: ["So What", "Freddie Freeloader", "Blue in Green", "All Blues", "Flamenco Sketches"],
    copy: {
      media: "G+",
      sleeve: "G",
      price: 3000,
      location: "Shelf B",
      tags: ["jazz"],
      daysAgo: 150,
    },
  },
  {
    artist: "Michael Jackson",
    title: "Thriller",
    year: 1982,
    format: "vinyl",
    details: ["LP", "Album", "Gatefold"],
    label: "Epic",
    catno: "QE 38112",
    country: "US",
    copy: { media: "VG+", sleeve: "VG+", price: 1500, location: "Shelf B", daysAgo: 60 },
  },
  {
    artist: "Daft Punk",
    title: "Random Access Memories",
    year: 2013,
    format: "vinyl",
    details: ["2×LP", "Album", "Gatefold", "180g"],
    label: "Columbia",
    country: "Europe",
    copy: {
      media: "NM",
      sleeve: "NM",
      price: 3500,
      location: "Shelf B",
      tags: ["180g"],
      daysAgo: 5,
    },
  },
  {
    artist: "Björk",
    title: "Homogenic",
    year: 1997,
    format: "cd",
    details: ["Album"],
    label: "One Little Indian",
    country: "UK",
    tracks: ["Hunter", "Jóga", "Unravel", "Bachelorette", "All Neon Like"],
    copy: { media: "NM", sleeve: "VG+", price: 700, location: "CD Tower", daysAgo: 30 },
  },
  {
    artist: "Kendrick Lamar",
    title: "To Pimp a Butterfly",
    year: 2015,
    format: "vinyl",
    details: ["2×LP", "Album", "Gatefold"],
    label: "Top Dawg Entertainment",
    country: "US",
    copy: {
      media: "M",
      sleeve: "M",
      price: 3200,
      location: "Shelf B",
      tags: ["sealed"],
      daysAgo: 2,
    },
  },
  {
    artist: "Joni Mitchell",
    title: "Blue",
    year: 1971,
    format: "vinyl",
    details: ["LP", "Album"],
    label: "Reprise Records",
    country: "US",
    copy: { media: "VG", sleeve: "VG", price: 2200, location: "Shelf A", daysAgo: 120 },
  },
  {
    artist: "Talking Heads",
    title: "Remain in Light",
    year: 1980,
    format: "cassette",
    details: ["Album"],
    label: "Sire",
    country: "US",
    copy: {
      media: "VG+",
      sleeve: "VG",
      price: 400,
      location: "Tape Crate",
      tags: ["thrift"],
      daysAgo: 75,
    },
  },
  {
    artist: "Prince and The Revolution",
    title: "Purple Rain",
    year: 1984,
    format: "cassette",
    details: ["Album"],
    label: "Warner Bros. Records",
    country: "US",
    copy: {
      media: "VG",
      sleeve: "G+",
      price: 300,
      location: "Tape Crate",
      tags: ["thrift"],
      daysAgo: 75,
    },
  },
  {
    artist: "Massive Attack",
    title: "Mezzanine",
    year: 1998,
    format: "cd",
    details: ["Album"],
    label: "Virgin",
    country: "UK",
    copy: { media: "VG+", sleeve: "VG+", price: 600, location: "CD Tower", daysAgo: 45 },
  },
  {
    artist: "Portishead",
    title: "Dummy",
    year: 1994,
    format: "cd",
    details: ["Album"],
    label: "Go! Beat",
    country: "UK",
    copy: { media: "NM", sleeve: "NM", price: 650, location: "CD Tower", daysAgo: 44 },
  },
  {
    artist: "Bob Dylan",
    title: "Blood on the Tracks",
    year: 1975,
    format: "vinyl",
    details: ["LP", "Album"],
    label: "Columbia",
    country: "US",
    copy: { media: "VG", sleeve: "VG", price: 1600, location: "Shelf A", daysAgo: 210 },
  },
  {
    artist: "Beastie Boys",
    title: "Paul's Boutique",
    year: 1989,
    format: "cassette",
    details: ["Album"],
    label: "Capitol Records",
    country: "US",
    copy: { media: "G+", location: "Tape Crate", daysAgo: 400 },
  },
  {
    artist: "Aphex Twin",
    title: "Selected Ambient Works 85-92",
    year: 1992,
    format: "cd",
    details: ["Album"],
    label: "Apollo",
    country: "Belgium",
    copy: { media: "VG+", sleeve: "VG", price: 1200, location: "CD Tower", daysAgo: 20 },
  },
  {
    artist: "Carole King",
    title: "Tapestry",
    year: 1971,
    format: "vinyl",
    details: ["LP", "Album"],
    label: "Ode Records",
    country: "US",
    copy: {
      media: "VG+",
      sleeve: "VG",
      price: 1000,
      location: "Shelf A",
      tags: ["thrift"],
      daysAgo: 160,
    },
  },
  {
    artist: "Radiohead",
    title: "OK Computer",
    year: 1997,
    format: "other",
    details: ["MiniDisc", "Album"],
    label: "Parlophone",
    country: "UK",
    copy: {
      media: "NM",
      sleeve: "VG+",
      price: 2500,
      location: "Shelf B",
      tags: ["oddity"],
      daysAgo: 8,
    },
  },
  {
    artist: "Radiohead",
    title: "OK Computer",
    year: 1997,
    format: "cd",
    details: ["Album"],
    label: "Parlophone",
    country: "UK",
    copy: { media: "VG+", sleeve: "VG", price: 400, location: "CD Tower", daysAgo: 500 },
  },
];

/** Abstract placeholder art (no text, so no fonts needed): gradient + record grooves. */
async function placeholderCover(seed: string): Promise<Buffer> {
  const h = createHash("sha256").update(seed).digest();
  const hue1 = h[0] * 1.41;
  const hue2 = (hue1 + 40 + h[1] / 4) % 360;
  const cx = 300 + (h[2] % 200);
  const cy = 300 + (h[3] % 200);
  const rings = Array.from({ length: 7 }, (_, i) => {
    const r = 60 + i * (30 + (h[4 + i] % 25));
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="white" stroke-opacity="${0.06 + (h[11 + i] % 10) / 100}" stroke-width="${2 + (h[18 + i] % 10)}"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue1},55%,45%)"/><stop offset="1" stop-color="hsl(${hue2},60%,18%)"/>
    </linearGradient></defs>
    <rect width="800" height="800" fill="url(#g)"/>${rings}
    <circle cx="${cx}" cy="${cy}" r="34" fill="hsl(${hue2},70%,70%)"/><circle cx="${cx}" cy="${cy}" r="5" fill="black"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const email = args.find((a) => !a.startsWith("--"));
  const h = getDb();
  const users = await h.db.select({ id: h.t.user.id, email: h.t.user.email }).from(h.t.user);
  const user = email ? users.find((u) => u.email === email.toLowerCase()) : users[0];
  if (!user) {
    throw new Error(
      email
        ? `No user ${email}`
        : "No users yet. Start the app and complete first-run setup, then seed.",
    );
  }
  if (!force && (await countCopies(user.id)) > 0) {
    console.log(`${user.email} already has copies; pass --force to seed anyway.`);
    return;
  }
  for (const s of SEEDS) {
    const cover = await storeImage(await placeholderCover(`${s.artist}/${s.title}/${s.format}`), {
      kind: "cover",
    });
    const tracklist: Track[] = (s.tracks ?? []).map((title, i) => ({
      position: String(i + 1),
      title,
    }));
    const { releaseId } = await createManualRelease(
      user.id,
      {
        artist: s.artist,
        title: s.title,
        year: s.year,
        format: s.format,
        formatDetails: s.details,
        label: s.label,
        catalogNumber: s.catno ?? null,
        country: s.country,
        barcode: null,
        tracklist,
        notes: "Seed data",
      },
      cover,
    );
    const locationId = await ensureLocation(user.id, s.copy.location);
    const copyId = await createCopy(user.id, releaseId, {
      mediaCondition: s.copy.media ?? null,
      sleeveCondition: s.copy.sleeve ?? null,
      priceMinor: s.copy.price ?? null,
      currency: s.copy.price ? "USD" : null,
      acquiredOn: new Date(Date.now() - s.copy.daysAgo * 86_400_000).toISOString().slice(0, 10),
      source: null,
      locationId,
      notes: null,
      rating: null,
      tags: s.copy.tags ?? [],
    });
    // Spread "Recently added" over time.
    await exclusive(async () => {
      await h.db
        .update(h.t.copy)
        .set({ createdAt: new Date(Date.now() - s.copy.daysAgo * 86_400_000) })
        .where(eq(h.t.copy.id, copyId));
    }, h);
    console.log(`  + ${s.artist} — ${s.title} (${s.format})`);
  }
  console.log(`Seeded ${SEEDS.length} releases for ${user.email}.`);
}

main()
  .catch((e) => {
    console.error(`seed: ${(e as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => getDb().close());
