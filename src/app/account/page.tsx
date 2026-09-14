import type { Metadata } from "next";
import { AccountView } from "@/components/pharmacy/OrdersView";

export const metadata: Metadata = {
  title: "My Account | The Pharmacy — حسابي",
  robots: { index: false },
};

export default function AccountPage() {
  return <AccountView />;
}
