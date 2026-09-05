import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { ServiceWorker } from "@/components/service-worker";
import { I18nProvider } from "@/i18n/client";
import { getI18n } from "@/i18n/server";

import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();

  return {
    title: {
      default: "Julius",
      template: "%s · Julius",
    },
    description: t.meta.description,
    manifest: "/manifest.webmanifest",
    applicationName: "Julius",
    appleWebApp: {
      capable: true,
      title: "Julius",
      statusBarStyle: "black-translucent",
    },
    formatDetection: {
      telephone: false,
    },
    icons: {
      apple: "/icons/apple-touch-icon.png",
    },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d12" },
  ],
  width: "device-width",
  initialScale: 1,
  // Stops iOS from zooming when a number field is focused, without trapping
  // someone who genuinely needs to pinch in.
  maximumScale: 5,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { locale } = await getI18n();

  return (
    <html lang={locale}>
      <body className={`${inter.variable} antialiased`}>
        <I18nProvider locale={locale}>{children}</I18nProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
