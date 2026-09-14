import type { Metadata } from "next";
import { CheckoutView } from "@/components/pharmacy/CheckoutView";

export const metadata: Metadata = {
  title: "Checkout | The Pharmacy — إتمام الطلب",
  description:
    "Cash on delivery across 15 Egyptian governorates. Free shipping over 500 EGP.",
  robots: { index: false },
};

export default function CheckoutPage() {
  return <CheckoutView />;
}
