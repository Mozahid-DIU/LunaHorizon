import type { Metadata } from "next";
import { PagePlaceholder } from "@/components/shell/PagePlaceholder";

export const metadata: Metadata = { title: "3D" };

export default function ThreeDPage() {
  return <PagePlaceholder title="3D" purpose="Stand on real lunar terrain from the lander's eye." />;
}
