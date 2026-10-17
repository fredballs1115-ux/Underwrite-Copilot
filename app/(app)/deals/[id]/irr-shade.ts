/**
 * The sensitivity grid's shade (model-panels `Sensitivity`): one hue, the
 * brand's teal (#114e54), deeper as the IRR rises, from the grid's lowest
 * (t = 0) to its highest (t = 1). One hue says only which cell is higher —
 * never "good": on a grid where every IRR is negative the least-bad cell is
 * the deepest teal, and its figure stays red (audit C11, L1: the market
 * boards' emerald-to-amber scale had drawn it green). At a low alpha, so
 * the figure on top keeps its own tone. Pure, so a render test can compare
 * two cells' backgrounds.
 */
export function irrShade(t: number): string {
  const k = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0.5));
  return `rgba(17, 78, 84, ${(0.04 + 0.2 * k).toFixed(3)})`;
}
