"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSelection } from "@/components/selection/useSelection";
import { isActivePage, PHONE_MORE, PHONE_TABS } from "@/lib/routes";
import { withQuery } from "@/lib/selection";
import styles from "./shell.module.css";

function TabBar({ query }: { query: string }) {
  const pathname = usePathname();
  // Remembering the page it was opened on closes the sheet on any route change, such as Back.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const isOpen = openedOn === pathname;
  const moreButton = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);

  const closeAndRefocus = () => {
    setOpenedOn(null);
    moreButton.current?.focus();
  };

  const closeForNavigation = () => {
    setOpenedOn(null);
    document.getElementById("main")?.focus();
  };

  useEffect(() => {
    if (!isOpen) return;
    sheet.current?.querySelector("a")?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenedOn(null);
        moreButton.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const links = sheet.current?.querySelectorAll("a");
      if (!links?.length) return;
      const first = links[0];
      const last = links[links.length - 1];
      const active = document.activeElement;
      const isInside = sheet.current?.contains(active) ?? false;
      if (!isInside || (!event.shiftKey && active === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  const isMoreCurrent = PHONE_MORE.some(({ href }) => isActivePage(pathname, href));

  return (
    <>
      <nav aria-label="Main" className={styles.phoneTabs} data-print="hide">
        {PHONE_TABS.map(({ href, label }) => (
          <Link key={href} href={withQuery(href, query)} aria-current={isActivePage(pathname, href) ? "page" : undefined}>
            {label}
          </Link>
        ))}
        <button
          ref={moreButton}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          data-current={isMoreCurrent}
          onClick={() => setOpenedOn(isOpen ? null : pathname)}
        >
          More
        </button>
      </nav>
      {isOpen && (
        <>
          <button type="button" className={styles.backdrop} aria-label="Close menu" tabIndex={-1} onClick={closeAndRefocus} />
          <div ref={sheet} role="dialog" aria-modal="true" aria-label="More pages" className={styles.sheet}>
            {PHONE_MORE.map(({ href, label }) => (
              <Link
                key={href}
                href={withQuery(href, query)}
                aria-current={isActivePage(pathname, href) ? "page" : undefined}
                onClick={closeForNavigation}
              >
                {label}
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function LiveTabBar() {
  return <TabBar query={useSelection().query} />;
}

export function PhoneTabs() {
  return (
    <Suspense fallback={<TabBar query="" />}>
      <LiveTabBar />
    </Suspense>
  );
}
