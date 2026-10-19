"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { MODAL_SELECTOR, PIPELINE_ORDER_KEY, dealStepOf, neighbourIn, readOrder } from "@/lib/shortcuts";

/**
 * "[" and "]" on a deal open the previous and the next deal in the order the
 * pipeline last showed in this tab (its filters and sort applied, kept by
 * the pipeline in the session — app/(app)/deals/pipeline-keys.ts). Nothing
 * is read for it: where no order is kept (the deal opened from a link, a
 * browser that keeps no storage) or the deal is not in it, or it is the
 * first or last, the key does nothing. The same guard as every page
 * shortcut: never while typing, inside a dialog or with a modifier held.
 * Draws nothing.
 */
export function DealStepKeys({ dealId }: { dealId: string }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "[" && e.key !== "]") return;
      const delta = dealStepOf(e, { modalOpen: !!document.querySelector(MODAL_SELECTOR) });
      if (delta == null) return;
      let order: string[] | null = null;
      try {
        order = readOrder(sessionStorage.getItem(PIPELINE_ORDER_KEY));
      } catch {
        // storage unavailable — no order to step through
      }
      if (!order) return;
      const to = neighbourIn(order, dealId, delta);
      if (!to) return;
      e.preventDefault();
      router.push(`/deals/${to}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dealId, router]);
  return null;
}
