import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "BHID — ByteHaven Identity",
    template: "%s | BHID",
  },
  description:
    "One secure identity for your ByteHaven apps, protected by passkeys and portable sign-in.",
  openGraph: {
    type: "website",
    siteName: "BHID",
    title: "BHID — ByteHaven Identity",
    description:
      "One secure identity for your ByteHaven apps, protected by passkeys and portable sign-in.",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1254,
        height: 1254,
        alt: "BHID — ByteHaven Identity",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BHID — ByteHaven Identity",
    description:
      "One secure identity for your ByteHaven apps, protected by passkeys and portable sign-in.",
    images: ["/opengraph-image.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
