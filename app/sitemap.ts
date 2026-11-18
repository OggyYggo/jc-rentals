import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://kuyogbohol.com").replace(/\/$/, "");
  return ["", "/cars", "/for-owners", "/contact", "/terms", "/privacy"].map((path) => ({
    url: `${baseUrl}${path}`,
    changeFrequency: "monthly",
    priority: path === "" ? 1 : path === "/contact" ? 0.7 : 0.6,
  }));
}
