"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { ClassroomToggle } from "@/components/classroom/ClassroomToggle";
import { SelectionBar, SelectionBarFallback } from "@/components/selection/SelectionBar";
import { useSelection } from "@/components/selection/useSelection";
import { BRIEF, groupOf, isActivePage, NAV_GROUPS, PROOF_PAGE } from "@/lib/routes";
import { withQuery } from "@/lib/selection";
import styles from "./shell.module.css";

function MainLinks({ query }: { query: string }) {
  const pathname = usePathname();
  const current = groupOf(pathname);
  return (
    <>
      <nav aria-label="Main" className={styles.tabs}>
        {NAV_GROUPS.map((group) => (
          <Link key={group.label} href={withQuery(group.pages[0].href, query)} aria-current={group === current ? "page" : undefined}>
            {group.label}
          </Link>
        ))}
      </nav>
      <div className={styles.right}>
        <Link href={withQuery(PROOF_PAGE.href, query)} className={styles.verified} aria-current={isActivePage(pathname, PROOF_PAGE.href) ? "page" : undefined}>
          <i aria-hidden="true" />
          Verified vs NASA JPL
        </Link>
        <Link href={withQuery(BRIEF.href, query)} className={styles.brief} aria-current={isActivePage(pathname, BRIEF.href) ? "page" : undefined}>
          Mission Brief
        </Link>
      </div>
    </>
  );
}

function LiveMainLinks() {
  return <MainLinks query={useSelection().query} />;
}

/** The pages inside the current group, such as Sky, Dates and Power under Plan. */
function SubTabs() {
  const pathname = usePathname();
  const { query } = useSelection();
  const group = groupOf(pathname);
  if (!group || group.pages.length < 2) return null;
  return (
    <nav aria-label={`${group.label} pages`} className={styles.subTabs}>
      {group.pages.map(({ href, label }) => (
        <Link key={href} href={withQuery(href, query)} aria-current={isActivePage(pathname, href) ? "page" : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function TopNav() {
  return (
    <header className={styles.top} data-print="hide">
      <div className={styles.row}>
        <Link href="/" className={styles.brand} aria-label="LunaHorizon home">
          Luna<span>Horizon</span>
        </Link>
        <Suspense fallback={<MainLinks query="" />}>
          <LiveMainLinks />
        </Suspense>
        <div className={styles.actions}>
          <ClassroomToggle />
        </div>
      </div>
      <div className={styles.context}>
        <Suspense fallback={<SelectionBarFallback />}>
          <SelectionBar />
        </Suspense>
        <Suspense>
          <SubTabs />
        </Suspense>
      </div>
    </header>
  );
}
