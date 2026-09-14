import type { Metadata } from "next";
import { WifiOff } from "lucide-react";

export const metadata: Metadata = {
  title: "Offline | The Pharmacy",
  robots: { index: false },
};

/** Offline fallback served by the service worker when the network is down. */
export default function OfflinePage() {
  return (
    <div className="max-w-md mx-auto px-4 py-24 flex flex-col items-center gap-5 text-center">
      <span className="w-20 h-20 rounded-full bg-primary/10 text-primary flex items-center justify-center">
        <WifiOff className="w-9 h-9" />
      </span>
      <h1 className="font-black text-2xl" dir="rtl">
        أنت غير متصل بالإنترنت
      </h1>
      <p className="text-muted-foreground leading-relaxed" dir="rtl">
        تحقق من اتصالك — الصفحات التي زرتها حديثاً تعمل بدون إنترنت
      </p>
      <p className="text-muted-foreground leading-relaxed" dir="ltr">
        You are offline. Check your connection — recently visited pages still
        work offline.
      </p>
      <a
        href="/"
        className="inline-flex items-center justify-center rounded-xl font-bold px-6 h-11 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        {/* retry */}
        <span dir="rtl">حاول مرة أخرى</span>
      </a>
    </div>
  );
}
