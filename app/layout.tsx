import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site-url";
import { publicMetadata } from "@/lib/site/public-metadata";
import { Inter, Work_Sans } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/header";
import { PushOptInPrompt } from "@/components/notifications/push-opt-in-prompt";
import { NotificationSoundProvider } from "@/components/notifications/sound";
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
  ...publicMetadata("/", "Kuyog Bohol: Car Rental in Bohol, Self-Drive and With Driver",
    "Rent a car in Bohol from local owners. Drive yourself or hire a car with a driver. Book online in minutes."),
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Kuyog Bohol: Car Rental in Bohol, Self-Drive and With Driver",
    template: "%s | Kuyog Bohol",
  },
  applicationName: "Kuyog Bohol",
  twitter: { card: "summary_large_image" },
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
      data-scroll-behavior="smooth"
      lang="en"
      className={`${inter.variable} ${workSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TopProgressBar />
        <Header />
        <NotificationSoundProvider>{children}</NotificationSoundProvider>
        <PushOptInPrompt />
      </body>
    </html>
  );
}
