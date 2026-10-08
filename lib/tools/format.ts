/**
 * How `/tools` writes a dollar figure — on its cards and in the sentences
 * its modules hand them, so the two never say one figure two ways.
 *
 * The sentences used to interpolate the raw number: "owed 13480465 at the
 * sale", "Getting out PAYS 385213" (the research pass of 2026-10-01). A
 * module's note is read on the same card as the figures above it, so it
 * takes the same writer as they do.
 *
 * Pure, no I/O, no "use client": the page and the modules import it alike.
 */

import { compactUsd } from "@/lib/money";

// The sign goes OUTSIDE the dollar, and it is the minus sign (U+2212), the
// way the rest of the site writes money: "−$1.5M" on a re-screen's diff,
// "−$578/mo" under a fair market rent. Interpolating a negative straight in
// gives "$-385,213", which is not how money is written anywhere, and it
// shows up wherever a figure can legitimately go below zero — a stack
// oversized against its basis, a residual that does not work at any
// price, a defeasance that pays you. A figure that rounds to nothing
// carries no sign: "−$0" is not an amount. The cards' tiles and the
// modules' sentences share these writers, so the rule is fixed once here,
// and lib/tools/format.test.ts fails on a dollar written anywhere else.
export const money = (n: number, body: (abs: number) => string): string => {
  const figure = body(Math.abs(n));
  return `${n < 0 && /[1-9]/.test(figure) ? "−" : ""}$${figure}`;
};

/** $13.48M at a million and over, $560,000 under it; "—" for no figure.
 *  Rounded as every compact figure on the site is (lib/money `compactUsd`):
 *  a half-step up, counted in whole numbers — $1,005,000 is "$1.01M", where
 *  a float's toFixed had read "$1.00M". */
export const usd = (n: number | null): string =>
  n === null ? "—" : compactUsd(n, { millions: 2, thousandsFrom: Infinity });

/** Every dollar: $13,480,465. */
export const usdExact = (n: number | null): string =>
  n === null ? "—" : money(n, (a) => Math.round(a).toLocaleString("en-US"));

/** To the cent, the way a rent a foot is quoted: $14.00. */
export const usdCents = (n: number | null): string =>
  n === null ? "—" : money(n, (a) => a.toFixed(2));
