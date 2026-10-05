// Where a horizontally scrolling strip of tabs should sit so the selected
// tab can be read. Pure: the deal page measures the strip and the tab and
// sets the strip's own scrollLeft from this, never the page's scroll — so a
// tab chosen from far down the page brings its strip round without moving
// the page an inch.

export interface StripBox {
  /** the strip's left edge, in client pixels */
  left: number;
  /** the strip's visible width */
  clientWidth: number;
  /** the strip's whole scrolled width */
  scrollWidth: number;
  scrollLeft: number;
}

export interface TabBox {
  /** the tab's edges, in client pixels */
  left: number;
  right: number;
}

/**
 * The strip's scrollLeft that brings the tab wholly into view, the tab
 * centred in what is visible so its neighbours show too, clamped to what
 * the strip can scroll. Null where the tab is already wholly in view, so a
 * tap on a visible tab never moves the strip. `fade` is the width of the
 * strip's own faded right edge (the phone's gradient mask): a tab under it
 * is not yet read, so it does not count as in view.
 */
export function revealScrollLeft(strip: StripBox, tab: TabBox, fade = 0): number | null {
  const visibleLeft = strip.left;
  const visibleRight = strip.left + strip.clientWidth - Math.max(0, fade);
  if (tab.left >= visibleLeft && tab.right <= visibleRight) return null;
  const tabCentre = (tab.left + tab.right) / 2;
  const viewCentre = (visibleLeft + visibleRight) / 2;
  const max = Math.max(0, strip.scrollWidth - strip.clientWidth);
  const next = Math.min(max, Math.max(0, strip.scrollLeft + (tabCentre - viewCentre)));
  return Math.abs(next - strip.scrollLeft) < 0.5 ? null : Math.round(next);
}
