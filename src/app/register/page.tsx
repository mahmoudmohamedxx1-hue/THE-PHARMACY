import type { Metadata } from "next";
import { RegisterView } from "@/components/pharmacy/AuthViews";

export const metadata: Metadata = {
  title: "Create Account | The Pharmacy — حساب جديد",
  description:
    "Create your The Pharmacy account for fast checkout, order tracking and AI-powered health tools.",
  robots: { index: false },
};

export default function RegisterPage() {
  return <RegisterView />;
}
