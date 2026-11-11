import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kuyog Bohol",
    short_name: "Kuyog Bohol",
    description: "Manage your bookings and rental operations with Kuyog Bohol.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0B63CE",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
