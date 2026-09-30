import Link from "next/link";
import { DealAvatar } from "@/app/(app)/deal-avatar";

/**
 * The way back to a deal from its own pages (#464) — the assumption bridge,
 * the rent roll, the valuations — with the building beside its name, the
 * way a listing's sub-pages keep the property in view: its photograph at a
 * heading's size, else the cover its card wears. Pure, so the render test
 * draws it.
 */
export function DealCrumb({ dealId, name }: { dealId: string; name: string }) {
  return (
    <Link
      href={`/deals/${dealId}`}
      data-deal-crumb
      className="group mb-1 inline-flex w-fit items-center gap-2.5 text-sm text-muted underline-offset-2 hover:text-brand"
    >
      <DealAvatar dealId={dealId} size="md" />
      <span className="group-hover:underline">← {name}</span>
    </Link>
  );
}
