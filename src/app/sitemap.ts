import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories] = await Promise.all([
    db.product.findMany({
      select: { slug: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    db.category.findMany({ select: { slug: true } }),
  ]);

  return [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/prescription`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/assistant`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/interactions`, changeFrequency: "monthly", priority: 0.9 },
    ...categories.map((c) => ({
      url: `${SITE_URL}/category/${c.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...products.map((p) => ({
      url: `${SITE_URL}/product/${p.slug}`,
      lastModified: p.createdAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
