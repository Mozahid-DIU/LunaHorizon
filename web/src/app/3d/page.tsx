import type { Metadata } from "next";
import { Suspense } from "react";
import { ThreeView, ThreeViewFallback } from "@/components/three/ThreeView";
import styles from "@/components/three/three.module.css";

export const metadata: Metadata = { title: "3D" };

export default function ThreeDPage() {
  return (
    <div className={styles.page}>
      <Suspense fallback={<ThreeViewFallback />}>
        <ThreeView />
      </Suspense>
    </div>
  );
}
