import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { Suspense } from "react";
import { PhoneTabs } from "@/components/shell/PhoneTabs";
import { TopNav } from "@/components/shell/TopNav";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: { default: "LunaHorizon", template: "%s · LunaHorizon" },
  description:
    "Find the right place and the right time to land on the Moon: Sun, Earth and terrain visibility for any lunar landing site and date.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <Suspense>
          <TopNav />
        </Suspense>
        <main id="main" tabIndex={-1} className="page">
          {children}
        </main>
        <Suspense>
          <PhoneTabs />
        </Suspense>
      </body>
    </html>
  );
}
