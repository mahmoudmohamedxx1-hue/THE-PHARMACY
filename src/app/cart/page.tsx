import type { Metadata } from "next";
import { CheckoutView } from "@/components/pharmacy/CheckoutView";

export const metadata: Metadata = {
  title: "Your Cart | The Pharmacy — عربة التسوق",
  robots: { index: false },
};

export default function CartPage() {
  return <CheckoutView />;
}
