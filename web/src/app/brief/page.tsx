import type { Metadata } from "next";
import { IBM_Plex_Serif } from "next/font/google";
import { Suspense } from "react";
import { BriefView, BriefViewFallback } from "@/components/brief/BriefView";

export const metadata: Metadata = { title: "Mission Brief" };

const plexSerif = IBM_Plex_Serif({ variable: "--font-serif", subsets: ["latin"], weight: ["400", "500"] });

export default function BriefPage() {
  return (
    <div className={plexSerif.variable}>
      <Suspense fallback={<BriefViewFallback />}>
        <BriefView />
      </Suspense>
    </div>
  );
}
