"use client";

import { useState } from "react";

/**
 * A deal's building at avatar size (#435), wherever a list names deals: the
 * ⌘K list, the way a listing site's search shows each result's photograph,
 * with the call's own dot on its corner (the dot that row carried alone
 * before), and the deal page's comps from the reader's own pipeline, the
 * way a comp table pictures each comparable.
 *
 * The best-picture route (/api/deals/[id]/image: the building's own
 * photograph, then the street), asked at twice the slot for a sharp avatar
 * on a dense screen, and asked for the deal's cover where no photograph
 * answers (`fallback=cover`, #443) — the pipeline's rule, pictures, not
 * maps: it had fallen to the aerial, a smudge of roofs at 32px. A deal the
 * route cannot find keeps the slot with a plate, so the names down the list
 * start at one x. Lazy, so a long list fires no request for the rows the
 * reader never scrolls to.
 */
export function DealAvatar({ dealId, dot }: { dealId: string; dot?: string }) {
  const [gone, setGone] = useState(false);
  return (
    <span aria-hidden className="relative h-8 w-8 shrink-0">
      {gone ? (
        <span
          data-deal-avatar="blank"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-dashed border-line bg-faint text-muted/60"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
          >
            <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5M9 10h.01M15 10h.01M9 14h.01M15 14h.01" />
          </svg>
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- the pipeline row's own proxied route, with its own cache headers
        <img
          data-deal-avatar="picture"
          src={`/api/deals/${dealId}/image?w=64&h=64&fallback=cover`}
          alt=""
          width={32}
          height={32}
          loading="lazy"
          decoding="async"
          onError={() => setGone(true)}
          className="h-8 w-8 rounded-md bg-faint object-cover"
        />
      )}
      {dot ? <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface ${dot}`} /> : null}
    </span>
  );
}
