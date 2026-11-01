import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/shell/PagePlaceholder";

export const metadata: Metadata = { title: "Ellipse" };

export default function EllipsePage() {
  return <PagePlaceholder title="Ellipse" purpose="See what changes if the lander touches down off target." />;
}
