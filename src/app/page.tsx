import { getCategories, getProducts } from "@/lib/catalog";
import { HomeView } from "@/components/pharmacy/HomeView";

// Regenerate the static home page at most every 5 minutes (ISR) — the page
// ships with all catalog data in the HTML, so first paint has real content
// instead of an empty shell waiting on JS + API round trips.
export const revalidate = 300;

export default async function Home() {
  const [categories, featured, popular, all] = await Promise.all([
    getCategories(),
    // Homepage sections only merchandise in-stock items with real photos —
    // out-of-stock or artwork-fallback hero cards read as broken images.
    getProducts({ featured: true, limit: 8, inStock: true, hasImage: true }),
    getProducts({ sort: "popular", limit: 8, inStock: true, hasImage: true }),
    // Unfiltered total powers the "genuine products" hero stat — a filtered
    // count (in-stock only) would understate the real catalog.
    getProducts({ limit: 1 }),
  ]);

  return (
    <HomeView
      initial={{
        categories,
        featured,
        popular,
        totalAll: all.total,
      }}
    />
  );
}
