import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The Complete New Homeowner System",
    short_name: "Homeowner System",
    description:
      "A practical system for setting up, maintaining, protecting, budgeting, and improving your home.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4ebdd",
    theme_color: "#c97546",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
