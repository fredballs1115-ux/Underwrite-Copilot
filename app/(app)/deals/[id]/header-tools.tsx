// The deal header's tools — the IC memo, the full report, the screening
// model's workbook, the rent roll engine, the valuations reconciler and the bridge —
// as the deal page draws them (page.tsx, `DealHero`'s actions), and as the
// public pages draw the sample's (app/sample-hero `SampleHeroTools`), so a
// visitor's tool row is the product's own: one markup, one icon and one
// tooltip a tool. Plain markup: no state, no server action.
import Link from "next/link";
import type { ReactNode } from "react";

/** A tool in the deal header's row. */
export const DEAL_TOOL_CLS =
  "flex items-center gap-1.5 rounded-lg border border-line bg-surface py-1.5 pl-2.5 pr-3 text-xs font-medium shadow-sm transition-colors hover:bg-faint";

export type DealToolKind = "memo" | "report" | "model" | "rentRoll" | "valuations" | "bridge";

/** Each tool's name in the row. */
export const DEAL_TOOL_LABEL: Record<DealToolKind, string> = {
  memo: "IC memo",
  report: "Full report",
  model: "Screening model",
  rentRoll: "Rent roll",
  valuations: "Valuations",
  bridge: "Bridge",
};

/** What each tool is, said in its tooltip. */
export const DEAL_TOOL_TITLE: Record<Exclude<DealToolKind, "bridge">, string> = {
  memo: "IC screening memo, one page where it fits — verdict, buy-box fit, flags, next steps",
  report: "The full screening report — memo plus every term, challenge, comp, and market check",
  model: "The screening model (Excel): the memorandum's price and terms, with screening defaults for growth and the exit — live formulas; change the exit cap and levered IRR recalculates",
  rentRoll: "Rent roll engine — WALT, rollover, mark-to-market, and a live-formula Excel model",
  valuations: "BOV reconciler — decompose the gap between two opinions of value",
};

/** A download's tooltip where the reader's plan does not include it. */
export const DEAL_TOOL_PRO_TITLE: Record<"memo" | "report" | "model", string> = {
  memo: "IC screening memo — part of Pro",
  report: "The full screening report — part of Pro",
  model: "The screening model (Excel) — part of Pro",
};

const ICON: Record<DealToolKind, ReactNode> = {
  memo: (
    <>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M15 2v5h5" />
      <path d="M10 12h4" />
      <path d="M10 16h4" />
    </>
  ),
  report: <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />,
  model: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </>
  ),
  rentRoll: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M9 4v16" />
    </>
  ),
  valuations: (
    <>
      <path d="M12 3v18M5 8l7-5 7 5" />
      <path d="M3 12h6l-3 6-3-6zM15 12h6l-3 6-3-6z" />
    </>
  ),
  bridge: <path d="M4 19V9M10 19V5M16 19v-7M22 19h-20" />,
};

/** The "Pro" mark on a download the reader's plan does not include. */
function ProMark() {
  return <span className="rounded-full bg-brand/10 px-1.5 py-px text-[10px] font-semibold text-brand">Pro</span>;
}

/**
 * One tool: its icon, its name and, where the reader's plan does not
 * include it, the "Pro" mark — an `<a>` for a download (a route that sends
 * a file), a `Link` for a page.
 */
export function DealTool({
  kind,
  href,
  title,
  pro = false,
  page = false,
  children,
}: {
  kind: DealToolKind;
  href: string;
  title: string;
  /** the download is Pro and the reader's plan does not include it */
  pro?: boolean;
  /** a page of the app (a `Link`), not a download */
  page?: boolean;
  /** anything after the name, as the bridge's version count */
  children?: ReactNode;
}) {
  const body = (
    <>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5 text-muted"
        aria-hidden
      >
        {ICON[kind]}
      </svg>
      {DEAL_TOOL_LABEL[kind]}
      {pro && <ProMark />}
      {children}
    </>
  );
  return page ? (
    <Link href={href} title={title} className={DEAL_TOOL_CLS}>
      {body}
    </Link>
  ) : (
    <a href={href} title={title} className={DEAL_TOOL_CLS}>
      {body}
    </a>
  );
}
