"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSelection } from "@/components/selection/useSelection";
import { BRIEF } from "@/lib/routes";
import { withQuery } from "@/lib/selection";
import styles from "./shell.module.css";

type Copied = "page" | "brief" | "failed";

/** The button as it looks before the selection is known, so nothing moves when it arrives. */
export function ShareButtonFallback() {
  return (
    <div className={styles.shareWrap}>
      <button type="button" className={styles.share} disabled aria-label="Share">
        <span className={styles.shareLabel}>Share</span>
      </button>
    </div>
  );
}

/** Copies a link to this page with the same site and date; a phone gets its own share sheet. */
export function ShareButton() {
  const { query } = useSelection();
  const pathname = usePathname();
  const [copied, setCopied] = useState<Copied | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const pageUrl = () => `${window.location.origin}${withQuery(pathname, query)}`;
  const briefUrl = () => `${window.location.origin}${withQuery(BRIEF.href, query)}`;

  const copy = async (what: "page" | "brief") => {
    try {
      await navigator.clipboard.writeText(what === "page" ? pageUrl() : briefUrl());
      setCopied(what);
    } catch {
      setCopied("failed");
    }
  };

  const share = async () => {
    const isPhone = window.matchMedia("(pointer: coarse)").matches;
    if (isPhone && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: document.title, url: pageUrl() });
        return;
      } catch (error: unknown) {
        // a person closing the sheet is not a failure; anything else falls back to copying
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    await copy("page");
  };

  useEffect(() => {
    if (copied === null) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (event instanceof PointerEvent && (box.current?.contains(event.target as Node) || button.current?.contains(event.target as Node))) return;
      setCopied(null);
      if (event instanceof KeyboardEvent) button.current?.focus();
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, [copied]);

  return (
    <div className={styles.shareWrap}>
      <button ref={button} type="button" className={styles.share} onClick={share} aria-expanded={copied !== null} aria-controls="share-box" aria-label="Share" data-testid="share">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
        </svg>
        <span className={styles.shareLabel}>Share</span>
      </button>
      {copied !== null && (
        <div ref={box} id="share-box" className={styles.sharePop} role="group" aria-label="Share" data-testid="share-pop">
          <p role="status">
            {copied === "failed" ? (
              <>This browser would not copy the link. Select it below and copy it.</>
            ) : (
              <>
                <b>{copied === "brief" ? "Mission Brief link copied." : "Link copied."}</b> It opens{" "}
                {copied === "brief" ? "the Mission Brief" : "this page"} with the same site and date.
              </>
            )}
          </p>
          <input
            className={styles.shareUrl}
            readOnly
            aria-label="Link"
            value={copied === "brief" ? briefUrl() : pageUrl()}
            onFocus={(event) => event.currentTarget.select()}
            data-testid="share-url"
          />
          <div className={styles.shareActions}>
            <button type="button" onClick={() => copy("page")}>
              Copy page link
            </button>
            <button type="button" onClick={() => copy("brief")}>
              Copy Mission Brief link
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
