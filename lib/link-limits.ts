/**
 * Two limits each said in several places, one constant each (research pass
 * 42, L6): how long a share link lives — the action that mints it, the panel
 * and the expired page that say it, and migration 0036, which clamps a
 * link's expiry to it — and how many deals the compare page sets side by
 * side — the pipeline's pick and the page's own cut.
 *
 * No imports: the client panel and the pipeline read it.
 */

/** Days a share link lives from the day it is made. Migration 0036 clamps
 *  an expiry to the same span (lib/link-limits.test.ts holds the two). */
export const SHARE_LINK_DAYS = 30;

/** Deals the compare page sets side by side. */
export const COMPARE_MAX = 4;
