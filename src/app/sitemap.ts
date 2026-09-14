import type { MetadataRoute } from "next";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories] = await Promise.all([
    db.product.findMany({
      select: { slug: true, createdAt: true },
      orderBy: { popularity: "desc" },
    }),
    db.category.findMany({ select: { slug: true } }),
  ]);

  return [
    { url: SITE, changeFrequency: "daily", priority: 1 },
    { url: `${SITE}/prescription`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE}/assistant`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE}/interactions`, changeFrequency: "monthly", priority: 0.9 },
    ...categories.map((c) => ({
      url: `${SITE}/category/${c.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...products.map((p) => ({
      url: `${SITE}/product/${p.slug}`,
      lastModified: p.createdAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
