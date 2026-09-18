import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getProductDetail } from "@/lib/catalog";
import { ProductView } from "@/components/pharmacy/ProductView";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

interface Props {
  params: Promise<{ slug: string }>;
}

/** Server-rendered metadata so shared links unfurl in WhatsApp / Telegram / social. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = await db.product.findUnique({
    where: { slug },
    select: {
      nameEn: true, nameAr: true, descEn: true, descAr: true,
      imageUrl: true, price: true, brand: true,
    },
  });

  if (!p) {
    return { title: "Product not found | The Pharmacy" };
  }

  const description = (p.descEn || p.descAr || "Genuine medicine delivered across Egypt.")
    .replace(/\s+/g, " ")
    .slice(0, 158);
  const title = `${p.nameEn} — ${p.nameAr} | The Pharmacy`;

  return {
    title,
    description,
    alternates: { canonical: `${SITE}/product/${slug}` },
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "The Pharmacy",
      images: p.imageUrl
        ? [{ url: p.imageUrl, width: 800, height: 800, alt: p.nameEn }]
        : undefined,
    },
    twitter: {
      card: p.imageUrl ? "summary_large_image" : "summary",
      title,
      description,
      images: p.imageUrl ? [p.imageUrl] : undefined,
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;

  // One query feeds the JSON-LD below AND the client view's initial data —
  // the product detail paints with the HTML instead of waiting on JS + API.
  const [p, detail] = await Promise.all([
    db.product.findUnique({
      where: { slug },
      select: {
        nameEn: true, nameAr: true, descEn: true, descAr: true,
        imageUrl: true, price: true, stock: true, slug: true,
        brand: true, rating: true, reviewCount: true,
      },
    }),
    getProductDetail(slug),
  ]);

  // Unknown slugs must return a real HTTP 404 (soft-404s hurt SEO and
  // confuse crawlers that see a "not found" page with a 200 status).
  if (!p || !detail) notFound();

  // schema.org structured data for rich Google results
  const jsonLd = p
    ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name: p.nameEn,
        alternateName: p.nameAr,
        sku: p.slug,
        description: (p.descEn || p.descAr || p.nameEn).replace(/\s+/g, " ").slice(0, 500),
        image: p.imageUrl ? [p.imageUrl.startsWith("http") ? p.imageUrl : `${SITE}${p.imageUrl}`] : undefined,
        brand: { "@type": "Brand", name: p.brand },
        offers: {
          "@type": "Offer",
          url: `${SITE}/product/${slug}`,
          priceCurrency: "EGP",
          price: p.price,
          availability: p.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
          itemCondition: "https://schema.org/NewCondition",
        },
        ...(p.reviewCount > 0
          ? {
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: p.rating,
                reviewCount: p.reviewCount,
              },
            }
          : {}),
      }
    : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <ProductView slug={slug} initial={detail ?? undefined} />
    </>
  );
}
