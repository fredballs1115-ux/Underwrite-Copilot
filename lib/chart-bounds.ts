/**
 * How wide an SVG chart may be drawn. A chart drawn in a viewBox and set to
 * the column's width scales its lettering with the column: an 11-unit label
 * in a 90-unit-wide rollover chart drew at about 44px in a 1,000px column.
 * Every chart that stretches to its column caps its drawn width here, so its
 * type never draws past `CHART_MAX_SCALE` of its set size, whatever the
 * column (the bar charts keep their scroll below `minWidth`, as before).
 *
 * No imports: client and server charts both read it.
 */

/** The most a chart's set type may grow: 11 units draw at 13.75px at most. */
export const CHART_MAX_SCALE = 1.25;

/** The widest column a signed-in page lays a chart out in: the app's 5xl
 *  column (1,024px less 2rem a side), less a card's 1.25rem padding and its
 *  border a side. */
export const WIDEST_CHART_COLUMN_PX = 1024 - 64 - 42;

/**
 * Every chart in `html` whose type could draw past `CHART_MAX_SCALE` of its
 * set size in a column `columnPx` wide, said as "viewBox W: up to N×". A
 * chart is an `<svg>` with a viewBox and `<text>` in it; one drawn at a
 * fixed pixel width scales by that width, one drawn `width="100%"` by its
 * `max-width` (or the column, with none). An SVG with no text — a bar, an
 * icon — has no lettering to grow.
 */
export function chartScaleIssues(html: string, columnPx = WIDEST_CHART_COLUMN_PX): string[] {
  const issues: string[] = [];
  for (const m of html.matchAll(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/g)) {
    const [, attrs, body] = m;
    if (!/<text\b/.test(body)) continue;
    const vb = /viewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+[\d.]+\s*"/.exec(attrs);
    if (!vb) continue;
    const w = Number(vb[1]);
    const width = /\swidth="([^"]*)"/.exec(attrs)?.[1] ?? "100%";
    const maxPx = /max-width:\s*([\d.]+)px/.exec(attrs)?.[1];
    const drawn = /^[\d.]+$/.test(width)
      ? Number(width)
      : Math.min(columnPx, maxPx != null ? Number(maxPx) : Infinity);
    const scale = drawn / w;
    if (scale > CHART_MAX_SCALE + 1e-9) issues.push(`viewBox ${w}: up to ${scale.toFixed(2)}×`);
  }
  return issues;
}

/** The inline style for a chart drawn `width="100%"` in a viewBox `w` wide:
 *  never wider than `CHART_MAX_SCALE` × w, and — where `minWidth` is given —
 *  never narrower than it (the chart's own scroll takes over below). */
export function chartWidthStyle(w: number, minWidth?: number): { maxWidth: number; minWidth?: number } {
  const maxWidth = Math.floor(w * CHART_MAX_SCALE);
  return minWidth == null ? { maxWidth } : { maxWidth, minWidth: Math.min(minWidth, maxWidth) };
}
