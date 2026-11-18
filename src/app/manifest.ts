import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "33rpm",
    short_name: "33rpm",
    description: "Your physical music collection: vinyl, CDs and tapes.",
    start_url: "/library",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0b0b",
    theme_color: "#0b0b0b",
    categories: ["music", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Scan a crate",
        url: "/scan?mode=crate",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      { name: "Add", url: "/add", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
