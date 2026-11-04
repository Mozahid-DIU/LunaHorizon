import type { Metadata } from "next";
import { Suspense } from "react";
import { PowerView, PowerViewFallback } from "@/components/power/PowerView";
import styles from "@/components/power/power.module.css";

export const metadata: Metadata = { title: "Power" };

export default function PowerPage() {
  return (
    <div className={styles.power}>
      <Suspense fallback={<PowerViewFallback />}>
        <PowerView />
      </Suspense>
    </div>
  );
}
