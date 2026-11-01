import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/shell/PagePlaceholder";

export const metadata: Metadata = { title: "Compare" };

export default function ComparePage() {
  return <PagePlaceholder title="Compare" purpose="Compare up to three landing sites side by side." />;
}
