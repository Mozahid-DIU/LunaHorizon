"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useTransition } from "react";
import { parseSelection, selectionQuery, withQuery, type ParsedSelection, type Selection } from "@/lib/selection";

interface SelectionState extends ParsedSelection {
  /** The clean query for links to other pages. */
  query: string;
  update: (change: Partial<Selection>) => void;
}

/** Reads the choice from the address and writes changes back to it. Use inside Suspense. */
export function useSelection(): SelectionState {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const parsed = useMemo(() => parseSelection(params), [params]);
  // The address updates after a delay, so a quick second change must build on the first.
  const latest = useRef<Selection | null>(null);

  useEffect(() => {
    if (!isPending) latest.current = null;
  }, [isPending]);

  return {
    ...parsed,
    query: selectionQuery(parsed.selection),
    update: (change) => {
      const next = { ...(latest.current ?? parsed.selection), ...change };
      latest.current = next;
      startTransition(() => router.replace(withQuery(pathname, selectionQuery(next)), { scroll: false }));
    },
  };
}
