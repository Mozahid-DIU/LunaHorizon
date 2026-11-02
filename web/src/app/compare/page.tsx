import type { Metadata } from "next";
import { Suspense } from "react";
import { CompareView, CompareViewFallback } from "@/components/compare/CompareView";
import styles from "@/components/compare/compare.module.css";

export const metadata: Metadata = { title: "Compare" };

export default function ComparePage() {
  return (
    <div className={styles.compare}>
      <Suspense fallback={<CompareViewFallback />}>
        <CompareView />
      </Suspense>
    </div>
  );
}
