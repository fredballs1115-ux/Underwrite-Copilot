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
