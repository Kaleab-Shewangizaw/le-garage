import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";

// Self-hosted (not next/font/google): a live Google Fonts fetch at build
// time is an external-network dependency this build should not have —
// see docs/DECISIONS.md ADR-0013. Files in src/fonts/, fetched once.
const plexSans = localFont({
  src: [
    { path: "../fonts/ibm-plex-sans-400.ttf", weight: "400", style: "normal" },
    { path: "../fonts/ibm-plex-sans-500.ttf", weight: "500", style: "normal" },
    { path: "../fonts/ibm-plex-sans-600.ttf", weight: "600", style: "normal" },
    { path: "../fonts/ibm-plex-sans-700.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = localFont({
  src: [
    { path: "../fonts/ibm-plex-mono-400.ttf", weight: "400", style: "normal" },
    { path: "../fonts/ibm-plex-mono-500.ttf", weight: "500", style: "normal" },
    { path: "../fonts/ibm-plex-mono-600.ttf", weight: "600", style: "normal" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Le Garage",
  description: "Garage operations — jobs, customers, vehicles, and service history.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
