import type { Metadata } from "next";
import { InteractionsView } from "@/components/pharmacy/InteractionsView";

export const metadata: Metadata = {
  title: "Drug Interaction Checker | The Pharmacy — فحص تعارض الأدوية",
  description:
    "Check your medicines for dangerous interactions for free — severity levels, medical advice and pharmacist-reviewed guidance.",
};

export default function InteractionsPage() {
  return <InteractionsView />;
}
