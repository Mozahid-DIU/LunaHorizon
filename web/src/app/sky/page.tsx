import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/shell/PagePlaceholder";

export const metadata: Metadata = { title: "Sky" };

export default function SkyPage() {
  return <PagePlaceholder title="Sky" purpose="See the Sun and Earth from the lander, over the real horizon." />;
}
