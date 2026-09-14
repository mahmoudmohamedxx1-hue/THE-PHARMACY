import type { Metadata } from "next";
import { LoginView } from "@/components/pharmacy/AuthViews";

export const metadata: Metadata = {
  title: "Login | The Pharmacy — تسجيل الدخول",
  description:
    "Log in to The Pharmacy to track orders, refill prescriptions and shop 490+ genuine medicines across Egypt.",
  robots: { index: false },
};

export default function LoginPage() {
  return <LoginView />;
}
