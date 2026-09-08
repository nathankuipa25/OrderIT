import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import SWRProvider from "@/components/SWRProvider";
import { getSession } from "@/lib/session";
import SWRegister from "./sw-register";
import InstallButton from "@/components/InstallButton";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "OrderIT",
  description: "Shop order generator",
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
        <meta name="theme-color" content="#111827" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/icons/icon-192.svg" />
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
      </head>
      <body className={`${inter.variable} font-sans bg-surface min-h-screen`}>
        <SWRProvider>
          <div className="pb-20 md:pb-6 md:pl-56">
            <div className="page-container px-4 pt-4">{children}</div>
          </div>
          <BottomNav role={session?.role} />
        </SWRProvider>
        <SWRegister />
        <InstallButton />
      </body>
    </html>
  );
}
