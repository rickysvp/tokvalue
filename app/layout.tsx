import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { I18nBody } from "./i18n-body";
import { getServerDict } from "@/lib/i18n/server";
import { PageViewTracker } from "@/components/PageViewTracker";

const d = getServerDict();

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  metadataBase: new URL('https://tokvalue.com'),
  title: { default: 'TokValue', template: '%s · TokValue' },
  description: d.seo.description,
  icons: {
    icon: '/w.png?v=2',
    shortcut: '/w.png?v=2',
    apple: '/w.png?v=2',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'TokValue',
    images: [
      {
        url: '/og.jpg?v=2',
        width: 1200,
        height: 630,
        alt: 'TokValue — TikTok Account Value Calculator',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og.jpg?v=2'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#0a0a0a] text-neutral-100 min-h-screen`}
      >
        <I18nBody>
          <PageViewTracker />
          {children}
        </I18nBody>
      </body>
    </html>
  );
}
