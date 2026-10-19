"use client";

import { useId, useState, type ReactNode } from "react";
import type { DealFact } from "@/lib/facts";

/**
 * A citation chip next to an extracted number (Feature 2).
 *  - located extracted fact → gray "p. 14" chip; click opens the OM at that
 *    page; the memorandum's own words beside it (a quote mark) open over it;
 *  - unlocated fact → a muted "source not located" tag (the absolute rule:
 *    never show a page we couldn't validate);
 *  - derived fact → an "ƒ" chip (its derivation);
 *  - assumption/default → an "A" chip.
 *
 * Every explanation is reachable without a mouse: each tag is a button that
 * opens a small popover on a tap or a click and shows it while focused or
 * hovered, the popover described to a screen reader (`aria-describedby`).
 * `title` stays for a pointer's tooltip. The chips keep their size.
 */
export function SourceChip({
  fact,
  omUrl,
  note,
}: {
  fact: DealFact;
  /** the deal's OM route (lib/om-link: `/api/deals/<id>/om`, which signs the
   *  file when clicked); when present a located chip links to it at
   *  `#page=N` */
  omUrl?: string | null;
  /** plain-English derivation for an ƒ chip */
  note?: string;
}) {
  const base =
    "ml-1 inline-flex items-center rounded px-1 py-px align-middle text-[9px] font-medium leading-none";

  if (fact.provenance === "derived") {
    const why = note || "Derived figure — see the model for how it's computed";
    return (
      <ChipPopover label="How this figure is derived" text={why} className={`${base} bg-brand/10 text-brand`}>
        ƒ
      </ChipPopover>
    );
  }
  if (fact.provenance === "assumption") {
    return (
      <ChipPopover
        label="An assumption, not a figure from the OM"
        text="Underwrite Copilot default — edit in the model's Assumptions tab"
        className={`${base} bg-caution/10 text-caution`}
      >
        A
      </ChipPopover>
    );
  }
  if (!fact.located || fact.pageNumber == null) {
    return (
      <ChipPopover
        label="Why the source is not located"
        text="The extraction couldn't tie this to a page in the OM"
        className={`${base} bg-line/60 text-muted`}
      >
        source not located
      </ChipPopover>
    );
  }

  const hover = [fact.locatorSnippet, fact.docLabel].filter(Boolean).join(" · ");
  const chip = `p.${fact.pageNumber}`;
  const quote = fact.locatorSnippet?.trim()
    ? (
        <ChipPopover
          label={`The OM's words on ${chip}`}
          text={`“${fact.locatorSnippet.trim()}” · ${fact.docLabel}, ${chip}`}
          className="ml-px inline-flex items-center rounded px-0.5 py-px align-middle text-[9px] font-medium leading-none text-muted hover:text-ink"
        >
          “
        </ChipPopover>
      )
    : null;
  if (omUrl) {
    // The page rides as the fragment on the route's URL. The route answers
    // with a redirect whose Location has no fragment, and a browser keeps
    // the request's fragment across such a redirect, so the signed PDF
    // opens at this page.
    return (
      <>
        <a
          href={`${omUrl}#page=${fact.pageNumber}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`${base} bg-faint text-muted underline-offset-2 transition-colors hover:bg-line/60 hover:text-ink`}
          title={hover || `Open the OM at ${chip}`}
        >
          {chip}
        </a>
        {quote}
      </>
    );
  }
  return (
    <>
      <span className={`${base} bg-faint text-muted`} title={hover || chip}>
        {chip}
      </span>
      {quote}
    </>
  );
}

/**
 * A tag whose explanation opens over it: a button (so a keyboard reaches it
 * and a tap opens it), the explanation a small popover shown while the
 * button is open, focused or hovered, and closed by Escape or leaving it.
 */
function ChipPopover({
  label,
  text,
  className,
  children,
}: {
  /** what the button is, to a screen reader */
  label: string;
  /** the explanation, as the popover and the `title` say it */
  text: string;
  className: string;
  children: ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className="group/chip relative inline-flex align-middle">
      <button
        type="button"
        className={`${className} cursor-help focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand`}
        title={text}
        aria-label={label}
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        {children}
      </button>
      <span
        role="tooltip"
        id={id}
        className={`${open ? "block" : "hidden"} absolute left-0 top-full z-20 mt-1 w-56 max-w-[70vw] rounded-md border border-line bg-surface p-2 text-left text-[11px] font-normal normal-case leading-snug tracking-normal text-ink shadow-md group-hover/chip:block group-focus-within/chip:block`}
      >
        {text}
      </span>
    </span>
  );
}
