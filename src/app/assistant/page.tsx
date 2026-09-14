import type { Metadata } from "next";
import { AssistantView } from "@/components/pharmacy/AssistantView";

export const metadata: Metadata = {
  title: "AI Health Assistant | The Pharmacy — المساعد الصحي",
  description:
    "Ask The Pharmacy AI assistant about medicines, dosage, side effects and wellness — instant answers in Arabic and English.",
};

export default function AssistantPage() {
  return <AssistantView />;
}
