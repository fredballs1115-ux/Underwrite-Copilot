import type { HTMLAttributes, ReactNode } from "react";

/**
 * The box a wide table scrolls sideways in, reachable from the keyboard
 * (research pass 33, WCAG 2.1.1): Chrome makes a scrolling box focusable by
 * itself, Safari does not, so there a keyboard could never scroll the table
 * to its far columns. The box is a Tab stop and a named region — the arrow
 * keys scroll it once it has focus, and a screen reader says what the table
 * is — and it shows the site's own focus ring (globals.css `:focus-visible`).
 * The name is required: a region with no name is no landmark at all.
 */
export function ScrollRegion({
  label,
  className = "",
  children,
  ...rest
}: {
  /** what the table is, e.g. "Rollover schedule" */
  label: string;
  className?: string;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLDivElement>, "role" | "tabIndex" | "aria-label" | "aria-labelledby" | "className" | "children">) {
  return (
    <div {...rest} role="region" aria-label={label} tabIndex={0} className={`overflow-x-auto ${className}`.trim()}>
      {children}
    </div>
  );
}
