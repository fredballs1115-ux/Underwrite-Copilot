/**
 * The first focusable element on every page: a keyboard or screen-reader
 * user jumps past the header, the nav and the ticker to the page's main
 * landmark (`<main id="main">` — every page renders one). Visually hidden
 * until it takes focus. Rendered once, by the root layout, so the public
 * pages and the signed-in shell share it.
 */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
    >
      Skip to content
    </a>
  );
}
