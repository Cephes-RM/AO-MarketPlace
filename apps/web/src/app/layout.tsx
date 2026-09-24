import type { Metadata } from "next";
import { Cinzel, Geist, Geist_Mono } from "next/font/google";
import { SiteFooter, SiteHeader } from "@albion/ui";
import { Crest } from "@/components/Crest";
import "./globals.css";

const PRODUCT_NAME = "Albion Platform";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display face for headings and numerals; the engraved look Albion's own UI uses.
const cinzel = Cinzel({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700", "900"],
});

export const metadata: Metadata = {
  title: {
    default: "Albion Platform",
    template: "%s · Albion Platform",
  },
  description:
    "Player database for Albion Online: kill and death history, equipment, and performance ratings for players, guilds and alliances.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${cinzel.variable} flex min-h-screen flex-col antialiased`}
      >
        <SiteHeader productName={PRODUCT_NAME} logo={<Crest className="h-6 w-auto" />} />
        <div className="flex-1">{children}</div>
        <SiteFooter productName={PRODUCT_NAME} />
      </body>
    </html>
  );
}
