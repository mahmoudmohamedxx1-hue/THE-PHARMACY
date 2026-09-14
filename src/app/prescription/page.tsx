import type { Metadata } from "next";
import { PrescriptionView } from "@/components/pharmacy/PrescriptionView";

export const metadata: Metadata = {
  title: "AI Prescription Reader | The Pharmacy — ارفع الروشتة",
  description:
    "Snap a photo of your prescription and The Pharmacy AI reads it instantly, matches products and builds your cart — Arabic and English supported.",
};

export default function PrescriptionPage() {
  return <PrescriptionView />;
}
