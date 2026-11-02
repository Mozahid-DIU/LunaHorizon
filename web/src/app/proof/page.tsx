import type { Metadata } from "next";
import { ProofView } from "@/components/proof/ProofView";
import styles from "@/components/proof/proof.module.css";

export const metadata: Metadata = { title: "Proof" };

export default function ProofPage() {
  return (
    <div className={styles.proof}>
      <ProofView />
    </div>
  );
}
