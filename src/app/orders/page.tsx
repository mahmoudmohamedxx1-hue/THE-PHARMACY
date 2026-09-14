import type { Metadata } from "next";
import { OrdersView } from "@/components/pharmacy/OrdersView";

export const metadata: Metadata = {
  title: "My Orders | The Pharmacy — طلباتي",
  description: "Track your The Pharmacy orders in real time.",
  robots: { index: false },
};

export default function OrdersPage() {
  return <OrdersView />;
}
