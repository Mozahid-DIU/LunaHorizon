"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useTransition } from "react";
import { parseSelection, selectionQuery, withQuery, type ParsedSelection, type Selection } from "@/lib/selection";

interface SelectionState extends ParsedSelection {
  /** The clean query for links to other pages. */
  query: string;
  update: (change: Partial<Selection>) => void;
}

/**
 * The address updates after a delay, so a quick second change must build on the first.
 * Shared, because the header and the map pins each use this hook.
 */
let pendingSelection: Selection | null = null;

/** Reads the choice from the address and writes changes back to it. Use inside Suspense. */
export function useSelection(): SelectionState {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const parsed = useMemo(() => parseSelection(params), [params]);

  const hasStarted = useRef(false);

  useEffect(() => {
    if (isPending) {
      hasStarted.current = true;
    } else if (hasStarted.current) {
      hasStarted.current = false;
      pendingSelection = null;
    }
  }, [isPending]);

  return {
    ...parsed,
    query: selectionQuery(parsed.selection),
    update: (change) => {
      const next = { ...(pendingSelection ?? parsed.selection), ...change };
      pendingSelection = next;
      startTransition(() => router.replace(withQuery(pathname, selectionQuery(next)), { scroll: false }));
    },
  };
}
