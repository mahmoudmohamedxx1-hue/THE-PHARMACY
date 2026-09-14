import type { Metadata } from "next";
import { SuccessView } from "@/components/pharmacy/CheckoutView";

export const metadata: Metadata = {
  title: "Order Confirmed | The Pharmacy — تم تأكيد الطلب",
  robots: { index: false },
};

export default async function OrderSuccessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SuccessView orderId={id} />;
}
