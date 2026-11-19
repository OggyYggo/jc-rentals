import type { Metadata } from "next";
import { Inter, Work_Sans } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/header";
import { PushOptInPrompt } from "@/components/notifications/push-opt-in-prompt";
import { TopProgressBar } from "@/components/loading/TopProgressBar";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const workSans = Work_Sans({
  variable: "--font-work-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://kuyogbohol.com"),
  title: "Kuyog Bohol — Rental Business, Simplified",
  description: "Manage bookings, vehicles, customers, and rental operations in one clear workspace. Built for rental businesses in the Philippines.",
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: "/icon-192.png",
  },
  appleWebApp: { capable: true, title: "Kuyog Bohol", statusBarStyle: "default" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${workSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TopProgressBar />
        <Header />
        {children}
        <PushOptInPrompt />
      </body>
    </html>
  );
}
