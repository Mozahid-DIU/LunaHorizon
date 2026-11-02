import type { Metadata } from "next";
import { Suspense } from "react";
import { DatesView, DatesViewFallback } from "@/components/dates/DatesView";
import styles from "@/components/dates/dates.module.css";

export const metadata: Metadata = { title: "Dates" };

export default function DatesPage() {
  return (
    <div className={styles.dates}>
      <Suspense fallback={<DatesViewFallback />}>
        <DatesView />
      </Suspense>
    </div>
  );
}
