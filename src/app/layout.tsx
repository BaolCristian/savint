import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Providers } from "@/components/providers";
import { HubHeader } from "@/components/hub/hub-header";
import { isHubMode } from "@/lib/config/savint-mode";
import { getHubSessionFromCookies } from "@/lib/auth/hub-session";
import "./globals.css";

const atkinson = Atkinson_Hyperlegible({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "SAVINT",
  description: "Quiz interattivi per la scuola",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SAVINT",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const hub = isHubMode();
  const isAdmin = hub ? (await getHubSessionFromCookies())?.role === "HUB_ADMIN" : false;

  return (
    <html lang={locale}>
      <body
        className={`${atkinson.variable} ${geistMono.variable} antialiased`}
        style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
      >
        <NextIntlClientProvider messages={messages}>
          <Providers>
            {hub && <HubHeader isAdmin={isAdmin} />}
            {children}
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
