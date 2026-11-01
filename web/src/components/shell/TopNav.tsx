"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { SelectionBar, SelectionBarFallback } from "@/components/selection/SelectionBar";
import { useSelection } from "@/components/selection/useSelection";
import { BRIEF, DESKTOP_NAV, isActivePage } from "@/lib/routes";
import { withQuery } from "@/lib/selection";
import styles from "./shell.module.css";

function NavLinks({ query }: { query: string }) {
  const pathname = usePathname();
  return (
    <>
      <nav aria-label="Main" className={styles.tabs}>
        {DESKTOP_NAV.map(({ href, label }) => (
          <Link key={href} href={withQuery(href, query)} aria-current={isActivePage(pathname, href) ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>
      <Link
        href={withQuery(BRIEF.href, query)}
        className={styles.brief}
        aria-current={isActivePage(pathname, BRIEF.href) ? "page" : undefined}
      >
        Mission Brief
      </Link>
    </>
  );
}

function LiveNavLinks() {
  return <NavLinks query={useSelection().query} />;
}

export function TopNav() {
  return (
    <header className={styles.top}>
      <Link href="/" className={styles.brand} aria-label="LunaHorizon home">
        Luna<span>Horizon</span>
      </Link>
      <Suspense fallback={<SelectionBarFallback />}>
        <SelectionBar />
      </Suspense>
      <Suspense fallback={<NavLinks query="" />}>
        <LiveNavLinks />
      </Suspense>
    </header>
  );
}
