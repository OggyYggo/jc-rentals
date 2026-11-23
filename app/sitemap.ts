import type { MetadataRoute } from "next";
import { cacheLife } from "next/cache";
import { createPublicServerClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site-url";

async function publicCarEntries(): Promise<MetadataRoute.Sitemap> {
  "use cache";
  cacheLife("hours");

  const db = createPublicServerClient();
  const entries: MetadataRoute.Sitemap = [];
  const pageSize = 500;

  // Anonymous reads use the same public cars policy as the listing.
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db.from("cars")
      .select("id,created_at")
      .eq("is_active", true)
      .order("id")
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    for (const car of data) {
      entries.push({
        url: `${SITE_URL}/cars/${car.id}`,
        lastModified: car.created_at,
        priority: 0.7,
      });
    }
    if (data.length < pageSize) return entries;
  }
}

const staticLastModified = new Date();

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries = ["/", "/cars", "/for-owners", "/apply", "/contact", "/terms", "/pricing", "/privacy"].map(path => ({
    url: `${SITE_URL}${path}`,
    lastModified: staticLastModified,
    priority: path === "/" ? 1 : path === "/cars" ? 0.9 : 0.5,
  }));

  try {
    return [...staticEntries, ...await publicCarEntries()];
  } catch {
    return staticEntries;
  }
}
