import type { Metadata } from "next";
import { Suspense } from "react";
import { EllipseView, EllipseViewFallback } from "@/components/ellipse/EllipseView";
import styles from "@/components/ellipse/ellipse.module.css";

export const metadata: Metadata = { title: "Ellipse" };

export default function EllipsePage() {
  return (
    <div className={styles.ellipse}>
      <Suspense fallback={<EllipseViewFallback />}>
        <EllipseView />
      </Suspense>
    </div>
  );
}
