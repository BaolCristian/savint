import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body
        className={`${atkinson.variable} ${geistMono.variable} antialiased`}
        style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
