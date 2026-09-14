import type { Metadata } from "next";
import { getCategories, getProducts } from "@/lib/catalog";
import { CategoryView } from "@/components/pharmacy/CategoryView";

export const metadata: Metadata = {
  title: "Search | The Pharmacy — البحث",
  robots: { index: false },
};

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export default async function SearchPage({
  params,
}: {
  params: Promise<{ q: string }>;
}) {
  const { q } = await params;
  const query = safeDecode(q);
  // SSR the first page of results so they paint with the HTML
  const [categories, products] = await Promise.all([
    getCategories(),
    getProducts({ q: query, sort: "popular", page: 1, limit: 24 }),
  ]);

  return (
    <CategoryView
      key={q}
      searchQuery={query}
      initial={{ categories, products }}
    />
  );
}
