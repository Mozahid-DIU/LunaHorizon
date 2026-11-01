import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/shell/PagePlaceholder";

export const metadata: Metadata = { title: "Mission Brief" };

export default function BriefPage() {
  return <PagePlaceholder title="Mission Brief" purpose="A one-page report for a chosen site and date." />;
}
