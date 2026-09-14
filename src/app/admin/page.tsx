import type { Metadata } from "next";
import { AdminView } from "@/components/pharmacy/AdminView";

export const metadata: Metadata = {
  title: "Admin Panel | The Pharmacy — لوحة الإدارة",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminView />;
}
