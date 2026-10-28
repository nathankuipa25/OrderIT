import type { Metadata, Viewport } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import ShopSyncToast from "@/components/ShopSyncToast";
import SWRProvider from "@/components/SWRProvider";
import { getSession } from "@/lib/session";
import SWRegister from "./sw-register";
import InstallButton from "@/components/InstallButton";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f2340",
};

export const metadata: Metadata = {
  title: "Shop Orders",
  applicationName: "Shop Orders",
  description: "Create and review shop orders, online or offline after the first sync.",
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
    title: "Shop Orders",
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
        <meta name="apple-mobile-web-app-title" content="Shop Orders" />
        <link rel="apple-touch-startup-image" href="/splash/iphone-6-7.png" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)" />
        <link rel="apple-touch-startup-image" href="/splash/iphone-6-1.png" media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)" />
        <link rel="apple-touch-startup-image" href="/splash/ipad-12-9.png" media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2)" />
      </head>
      <body className="font-sans min-h-screen bg-surface">
        <SWRProvider>
          <div className="pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:pb-6 md:pl-56">
            <div className="page-container px-4 pt-3">
              <ShopSyncToast role={session?.role} userId={session?.sub} />
              {children}
            </div>
          </div>
          <BottomNav role={session?.role} shopName={session?.role === "SHOP" ? session.name : undefined} />
        </SWRProvider>
        <SWRegister role={session?.role} userId={session?.sub} />
        <InstallButton />
      </body>
    </html>
  );
}
