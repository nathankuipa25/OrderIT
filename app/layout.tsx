import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "OrderIT",
  description: "Shop order generator",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans bg-surface min-h-screen`}>
        <div className="pb-20 md:pb-6 md:pl-56">
          <div className="page-container px-4 pt-4">{children}</div>
        </div>
        <BottomNav />
      </body>
    </html>
  );
}
