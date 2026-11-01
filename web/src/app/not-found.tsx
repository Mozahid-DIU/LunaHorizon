import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="message">
      <h1>Page not found</h1>
      <p>This address does not exist on LunaHorizon.</p>
      <Link href="/">Back to the Atlas</Link>
    </div>
  );
}
