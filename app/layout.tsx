import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import OfflineShopStatus from "@/components/OfflineShopStatus";
import SWRProvider from "@/components/SWRProvider";
import { getSession } from "@/lib/session";
import SWRegister from "./sw-register";
import InstallButton from "@/components/InstallButton";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f2340",
};

export const metadata: Metadata = {
  title: "OrderIT",
  applicationName: "OrderIT",
  description: "Shop order generator with an offline-ready shop workspace.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "OrderIT",
    statusBarStyle: "black-translucent",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  return (
    <html lang="en">
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="OrderIT" />
        <link rel="apple-touch-startup-image" href="/splash/iphone-6-7.png" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)" />
        <link rel="apple-touch-startup-image" href="/splash/iphone-6-1.png" media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)" />
        <link rel="apple-touch-startup-image" href="/splash/ipad-12-9.png" media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)" />
      </head>
      <body className={`${inter.variable} font-sans bg-surface min-h-screen`}>
        <SWRProvider>
          <div className="pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6 md:pl-56">
            <div className="page-container px-4 pt-4">
              <OfflineShopStatus role={session?.role} userId={session?.sub} />
              {children}
            </div>
          </div>
          <BottomNav role={session?.role} />
        </SWRProvider>
        <SWRegister role={session?.role} userId={session?.sub} />
        <InstallButton />
      </body>
    </html>
  );
}
