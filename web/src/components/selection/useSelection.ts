"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useTransition } from "react";
import { COMPARE_PARAM, compareQuery, joinQueries } from "@/lib/compare";
import { parseSelection, selectionQuery, withQuery, type ParsedSelection, type Selection } from "@/lib/selection";

interface SelectionState extends ParsedSelection {
  /** The clean query for links to other pages. */
  query: string;
  update: (change: Partial<Selection>) => void;
  /** The compared columns' link values, counting a change still on its way to the address. */
  latestCompared: () => readonly string[];
  updateCompared: (values: readonly string[]) => void;
}

/**
 * The address updates after a delay, so a quick second change must build on the first.
 * Shared, because the header and the map pins each use this hook.
 */
let pendingSelection: Selection | null = null;
let pendingCompared: readonly string[] | null = null;

/** Reads the choice from the address and writes changes back to it. Use inside Suspense. */
export function useSelection(): SelectionState {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const parsed = useMemo(() => parseSelection(params), [params]);

  const compared = params.getAll(COMPARE_PARAM);

  const hasStarted = useRef(false);

  useEffect(() => {
    if (isPending) {
      hasStarted.current = true;
    } else if (hasStarted.current) {
      hasStarted.current = false;
      pendingSelection = null;
      pendingCompared = null;
    }
  }, [isPending]);

  const write = (next: Selection, values: readonly string[]) =>
    startTransition(() => router.replace(withQuery(pathname, joinQueries(selectionQuery(next), compareQuery(values))), { scroll: false }));

  return {
    ...parsed,
    query: joinQueries(selectionQuery(parsed.selection), compareQuery(compared)),
    update: (change) => {
      const next = { ...(pendingSelection ?? parsed.selection), ...change };
      pendingSelection = next;
      write(next, pendingCompared ?? compared);
    },
    latestCompared: () => pendingCompared ?? compared,
    updateCompared: (values) => {
      pendingCompared = values;
      write(pendingSelection ?? parsed.selection, values);
    },
  };
}
