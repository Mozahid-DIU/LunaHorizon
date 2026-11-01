import type { Metadata } from "next";
import { Suspense } from "react";
import { SkyView, SkyViewFallback } from "@/components/sky/SkyView";
import styles from "@/components/sky/sky.module.css";

export const metadata: Metadata = { title: "Sky" };

export default function SkyPage() {
  return (
    <div className={styles.sky}>
      <Suspense fallback={<SkyViewFallback />}>
        <SkyView />
      </Suspense>
    </div>
  );
}
