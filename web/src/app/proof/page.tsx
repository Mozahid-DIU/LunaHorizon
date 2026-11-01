import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/shell/PagePlaceholder";

export const metadata: Metadata = { title: "Proof" };

export default function ProofPage() {
  return <PagePlaceholder title="Proof" purpose="Check our results against NASA JPL Horizons and published data." />;
}
