import type { ReactNode } from "react";
import { SCREEN_STAGES } from "@/lib/screen-stages";
import { StageIcon } from "./stage-icons";

// Pictures for empty states (the operator's rule: words that can be a
// picture should be one). Each is plainly a placeholder — dashed, muted,
// `aria-hidden`, no figure, no axis label — so nothing here can be read as
// data; the sentence beside it says what is missing. The pattern is the
// analytics page's AnalyticsEmptyPicture. No "use client": the server pages
// and the deal page's client sections draw the same markup.

function GlyphSvg({ children, className = "h-5 w-5" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

/** The icons an empty list or page wears, by what it is waiting for. */
export const EMPTY_GLYPH = {
  /** a decision log: a page of entries */
  log: (
    <GlyphSvg>
      <path d="M6 3h12v18H6z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </GlyphSvg>
  ),
  /** a task list: ticked boxes */
  tasks: (
    <GlyphSvg>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <path d="m5.5 7 1.5 1.5 2.5-3" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <path d="M13 7h7M13 17h7" />
    </GlyphSvg>
  ),
  /** the assumption bridge: a waterfall of steps */
  bridge: (
    <GlyphSvg>
      <path d="M3 21h18" />
      <path d="M5 18V8M9 8V5M13 12V8M17 18v-6M5 8h4M9 8h4M13 12h4" />
    </GlyphSvg>
  ),
  /** opinions of value: a balance */
  scales: (
    <GlyphSvg>
      <path d="M12 4v16M6 20h12M6 8h12" />
      <path d="m6 8-3 6h6zM18 8l-3 6h6z" />
    </GlyphSvg>
  ),
  /** a construction pipeline: a crane */
  crane: (
    <GlyphSvg>
      <path d="M7 21V5M7 5h13M7 5l-3 3M17 5v5" />
      <path d="M15 10h4v3h-4zM4 21h7" />
    </GlyphSvg>
  ),
  /** a submarket's series: bars under a line */
  trend: (
    <GlyphSvg>
      <path d="M3 20h18M6 20v-5M10 20v-8M14 20v-6M18 20v-10" />
      <path d="m5 9 4-3 4 2 6-4" />
    </GlyphSvg>
  ),
} as const;

/** One glyph in a dashed, muted ring: the picture an empty list wears. */
export function EmptyGlyph({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      aria-hidden
      data-empty-picture="icon"
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-line text-muted/70 ${className}`}
    >
      {children}
    </span>
  );
}

/** An empty list's line: its glyph beside the sentence that says what is
 *  missing. */
export function EmptyNote({
  icon,
  children,
  className = "",
}: {
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <EmptyGlyph>{icon}</EmptyGlyph>
      <p className="text-sm text-muted">{children}</p>
    </div>
  );
}

/** A page's empty card: its glyph beside a heading and the sentence under it. */
export function EmptyCard({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 rounded-lg border border-line bg-surface p-6">
      <EmptyGlyph>{icon}</EmptyGlyph>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">{children}</p>
      </div>
    </div>
  );
}

/** The six-stage rail, idle: each stage's icon in a dashed ring, joined by a
 *  dashed line, none lit — the screen that has not run. */
export function StageRailGhost({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden data-empty-picture="stage-rail" className={`relative flex items-center justify-between ${className}`}>
      <span className="absolute inset-x-5 top-1/2 border-t border-dashed border-line" />
      {SCREEN_STAGES.map((s) => (
        <span
          key={s.key}
          data-stage={s.key}
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-line bg-surface text-muted/60"
        >
          <StageIcon stage={s.key} className="h-4 w-4" />
        </span>
      ))}
    </div>
  );
}

/** A trend chart with nothing loaded: dashed bars under a dashed line, no
 *  axis, no figures. `className` sets its width ("max-w-xs" by default). */
export function GhostTrend({ className = "max-w-xs" }: { className?: string }) {
  const W = 320;
  const H = 96;
  const bars = [44, 58, 36, 62, 50, 70, 46];
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      aria-hidden
      data-empty-picture="trend"
      className={`mx-auto block text-line ${className}`}
    >
      <line x1={8} x2={W - 8} y1={H - 6} y2={H - 6} stroke="currentColor" />
      {bars.map((h, i) => (
        <rect
          key={i}
          x={22 + i * 42}
          y={H - 6 - h}
          width={22}
          height={h}
          rx={2}
          fill="none"
          stroke="currentColor"
          strokeDasharray="3 3"
        />
      ))}
      <polyline
        points={bars.map((h, i) => `${33 + i * 42},${H - 18 - h}`).join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeDasharray="5 4"
      />
    </svg>
  );
}
