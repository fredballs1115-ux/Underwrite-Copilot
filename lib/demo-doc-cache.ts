// How long the public sample's documents (the memo, the full report and
// the workbook under app/api/demo) are held, by the browser and by the
// process. Each reads today's published figures for the stress test and the
// model's market read, as /demo does, so each is held for /demo's own ISR
// window (its `revalidate`, 300 seconds, which lib/demo-doc-cache.test.ts
// holds equal to this): a document a day old could print figures /demo no
// longer shows. No imports.

/** /demo's ISR window, in seconds. */
export const DEMO_DOC_SECONDS = 300;

/** The Cache-Control a sample document is served with. */
export const DEMO_DOC_CACHE_CONTROL = `public, max-age=${DEMO_DOC_SECONDS}`;

/** A render the process holds: the reader's day it was dated for, and when
 *  it was made. */
export interface HeldRender {
  day: string;
  at: number;
}

/** Whether a held render may be served again: the same reader's day, and
 *  made inside the window. */
export function heldRenderFresh(held: HeldRender | null, day: string, now: number): boolean {
  return !!held && held.day === day && now - held.at >= 0 && now - held.at < DEMO_DOC_SECONDS * 1000;
}
