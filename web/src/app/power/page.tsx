import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/shell/PagePlaceholder";

export const metadata: Metadata = { title: "Power" };

export default function PowerPage() {
  return <PagePlaceholder title="Power" purpose="Test whether the battery lasts through the dark." />;
}
