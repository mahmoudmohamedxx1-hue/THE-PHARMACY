import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Geist, Geist_Mono, Cairo } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/components/pharmacy/Providers";
import { SiteChrome } from "@/components/pharmacy/SiteChrome";
import { PageViewTracker } from "@/components/pharmacy/PageViewTracker";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

// Optional analytics — scripts only load when the IDs are configured at
// build time. Without env IDs this renders nothing (zero network cost).
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

// iOS splash screens (key modern iPhone / iPad sizes)
const SPLASH: Array<[string, string]> = [
  ["1290x2796", "(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)"],
  ["1179x2556", "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)"],
  ["1284x2778", "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)"],
  ["1170x2532", "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)"],
  ["1125x2436", "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)"],
  ["1242x2688", "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3)"],
  ["828x1792", "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)"],
  ["750x1334", "(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)"],
  ["1242x2208", "(device-width: 414px) and (device-height: 736px) and (-webkit-device-pixel-ratio: 3)"],
  ["2048x2732", "(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)"],
  ["1668x2388", "(device-width: 834px) and (device-height: 1194px) and (-webkit-device-pixel-ratio: 2)"],
  ["1620x2160", "(device-width: 810px) and (device-height: 1080px) and (-webkit-device-pixel-ratio: 2)"],
  ["1536x2048", "(device-width: 768px) and (device-height: 1024px) and (-webkit-device-pixel-ratio: 2)"],
];

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "The Pharmacy | ذا فارميسي — Egypt's Smartest Online Pharmacy",
  description:
    "The Pharmacy (ذا فارميسي): Egypt's AI-powered online pharmacy. Upload your prescription and let AI read it instantly, check drug interactions, chat with our AI health assistant, and get medicines delivered fast across Egypt.",
  keywords: ["pharmacy", "online pharmacy Egypt", "صيدلية أونلاين", "The Pharmacy", "ذا فارميسي", "prescription upload", "AI pharmacist"],
  manifest: "/manifest.webmanifest",
  formatDetection: { telephone: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "The Pharmacy",
    startupImage: SPLASH.map(([size, media]) => ({
      url: `/icons/splash/apple-splash-${size}.png`,
      media,
    })),
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0d9488",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        {/* iOS standalone mode: open like a native app when launched from the home screen */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body
        className={`${cairo.variable} ${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>
          <SiteChrome>{children}</SiteChrome>
          <PageViewTracker />
        </Providers>
        <Toaster />
        {GA_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga-init" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_ID}', { send_page_view: false });`}
            </Script>
          </>
        )}
        {PIXEL_ID && (
          <Script id="meta-pixel" strategy="afterInteractive">
            {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
              n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
              document,'script','https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${PIXEL_ID}');`}
          </Script>
        )}
      </body>
    </html>
  );
}
