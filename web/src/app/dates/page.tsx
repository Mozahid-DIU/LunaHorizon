import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/shell/PagePlaceholder";

export const metadata: Metadata = { title: "Dates" };

export default function DatesPage() {
  return <PagePlaceholder title="Dates" purpose="Find the best landing dates and see what a delay costs." />;
}
