"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BRIEF, DESKTOP_NAV, isActivePage } from "@/lib/routes";
import styles from "./shell.module.css";

export function TopNav() {
  const pathname = usePathname();
  return (
    <header className={styles.top}>
      <Link href="/" className={styles.brand} aria-label="LunaHorizon home">
        Luna<span>Horizon</span>
      </Link>
      <nav aria-label="Main" className={styles.tabs}>
        {DESKTOP_NAV.map(({ href, label }) => (
          <Link key={href} href={href} aria-current={isActivePage(pathname, href) ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>
      <Link
        href={BRIEF.href}
        className={styles.brief}
        aria-current={isActivePage(pathname, BRIEF.href) ? "page" : undefined}
      >
        Mission Brief
      </Link>
    </header>
  );
}
