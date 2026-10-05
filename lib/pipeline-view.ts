// How the pipeline is drawn, and the view it opens on (#428, #438).
//
// Pure and universal, and deliberately NOT in the pipeline's own client
// module: the page, a server component, reads the reader's choice from a
// cookie, and every export of a "use client" module is a client reference on
// the server — a function standing in for the component, never the value.
// The cookie's name lived in the client module, so the page asked for the
// cookie under a function's name, found nothing, and opened every visit on
// the cards whatever the reader had chosen. Nothing failed; the choice was
// silently never read. Both sides import this module now.

/** Photograph-led cards (#428), the dense list, or every deal on one map
 *  (#431). */
export type PipelineView = "cards" | "list" | "map";

/** The cookie that remembers the cards or the list, so the server draws
 *  the view the reader left — no flash of another on the next visit. */
export const PIPELINE_VIEW_COOKIE = "uc_pipeline_view";

/**
 * The view the page opens on: the list where the reader chose it, the cards
 * otherwise — never the map (#438). The pipeline's main view is its
 * pictures; the map is opened for a visit, and a map remembered from one
 * visit would greet the reader on every one after it.
 */
export function landingView(cookie: string | null | undefined): PipelineView {
  return cookie === "list" ? "list" : "cards";
}

/** Whether a chosen view is remembered: the cards and the list are, the map
 *  is not. */
export function remembersView(view: PipelineView): boolean {
  return view !== "map";
}

/**
 * The cards view's grid (#428), and its loading state's column for column
 * (app/(app)/deals/loading.tsx): as many columns as hold a card of 17.5rem
 * or more, counted from the grid's own width, never the screen's. Its
 * breakpoints had gone two-up at `sm` (640px) while the 240px sidebar
 * arrives at `md` (768px), so from 768 to 1023 a card was 222–250px wide
 * and its market caption collapsed (research pass 29). A card is a phone's
 * column on a screen narrower than 17.5rem and its padding (`min`, so the
 * grid never runs past it), and the page's 80rem column holds four at most.
 *
 * Measured beside the sidebar (lib/views.render.test.ts holds the
 * arithmetic): one column of 350px at 390, 464 at 768 and 516 at 820; two
 * of 352 at 1024; three of 315 at 1280 and 368 at 1440; four of 292 from
 * 1520 up.
 */
export const PIPELINE_CARD_GRID = "mt-2 grid grid-cols-[repeat(auto-fill,minmax(min(17.5rem,100%),1fr))] gap-4";

/**
 * A card picture's width at each screen, the `sizes` hint the grid's
 * columns give (`PIPELINE_CARD_GRID` beside the app shell's 240px sidebar
 * from 768px, its 20px or, from 640px, 32px of padding a side and its
 * 80rem column): four columns from 1472px, three from 1176, two from 880,
 * one beside the sidebar from 768, two from 616 without it, and one on a
 * phone.
 */
export const PIPELINE_CARD_SIZES =
  "(min-width: 1520px) 292px, (min-width: 1472px) calc(25vw - 88px), (min-width: 1176px) calc(33.33vw - 112px), (min-width: 880px) calc(50vw - 160px), (min-width: 768px) calc(100vw - 304px), (min-width: 640px) calc(50vw - 40px), (min-width: 616px) calc(50vw - 28px), calc(100vw - 40px)";
