import type { Metadata } from "next";
import { WishlistView } from "@/components/pharmacy/WishlistView";

export const metadata: Metadata = {
  title: "My Wishlist | The Pharmacy — المفضلة",
  robots: { index: false },
};

export default function WishlistPage() {
  return <WishlistView />;
}
