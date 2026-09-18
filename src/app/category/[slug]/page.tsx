import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCategories, getProducts } from "@/lib/catalog";
import { CategoryView } from "@/components/pharmacy/CategoryView";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const c = await db.category.findUnique({
    where: { slug },
    select: { nameEn: true, nameAr: true, descEn: true, descAr: true },
  });

  if (!c) {
    return { title: "Category not found | The Pharmacy" };
  }

  const title = `${c.nameEn} — ${c.nameAr} | The Pharmacy`;
  const description = (c.descEn || c.descAr || `Shop ${c.nameEn} online in Egypt.`)
    .replace(/\s+/g, " ")
    .slice(0, 158);

  return {
    title,
    description,
    alternates: { canonical: `${SITE}/category/${slug}` },
    openGraph: { title, description, type: "website", siteName: "The Pharmacy" },
  };
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  // Unknown category slugs return a real HTTP 404 instead of a 200 "empty
  // grid" page (soft-404s are bad for SEO and for link sharing).
  const exists = await db.category.findUnique({ where: { slug }, select: { slug: true } });
  if (!exists) notFound();

  // SSR the default first page (unfiltered, sorted by popularity) so the
  // grid paints immediately with the HTML; filters re-fetch client-side.
  const [categories, products] = await Promise.all([
    getCategories(),
    getProducts({ category: slug, sort: "popular", page: 1, limit: 24 }),
  ]);

  // key={slug} forces a clean remount when switching categories
  return (
    <CategoryView
      key={slug}
      categorySlug={slug}
      initial={{ categories, products }}
    />
  );
}
