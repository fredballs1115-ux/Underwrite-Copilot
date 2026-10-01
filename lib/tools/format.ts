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

// The sign goes OUTSIDE the dollar. Interpolating a negative straight in
// gives "$-385,213", which is not how money is written anywhere, and it
// shows up wherever a figure can legitimately go below zero — a stack
// oversized against its basis, a residual that does not work at any
// price, a defeasance that pays you. The cards' tiles and the modules'
// sentences share these writers, so the rule is fixed once here.
export const money = (n: number, body: (abs: number) => string): string =>
  `${n < 0 ? "-" : ""}$${body(Math.abs(n))}`;

/** $13.48M at a million and over, $560,000 under it; "—" for no figure. */
export const usd = (n: number | null): string =>
  n === null
    ? "—"
    : money(n, (a) =>
        a >= 1_000_000
          ? `${(a / 1_000_000).toFixed(2)}M`
          : Math.round(a).toLocaleString("en-US"),
      );

/** Every dollar: $13,480,465. */
export const usdExact = (n: number | null): string =>
  n === null ? "—" : money(n, (a) => Math.round(a).toLocaleString("en-US"));

/** To the cent, the way a rent a foot is quoted: $14.00. */
export const usdCents = (n: number | null): string =>
  n === null ? "—" : money(n, (a) => a.toFixed(2));
