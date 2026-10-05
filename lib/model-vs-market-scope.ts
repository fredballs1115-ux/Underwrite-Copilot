import type { ModelVsMarket } from "@/lib/model-vs-market";

/**
 * The words over the model's assumptions against the published figures —
 * one copy for the deal page's card, the full report and the workbook's
 * Market Read tab, each passing the day in its own format, so the three
 * cannot say different things about what the rows were read against.
 *
 * A type import and nothing else: the card renders inside the deal page's
 * client view, and lib/model-vs-market carries the research tracker's file
 * and the price readers, which stay out of the browser bundle.
 *
 * The header says "the published figures", never "what the series have
 * actually done": the expense row carries the bond market's inflation
 * expectation (the 10-year breakeven), a forecast, beside the trailing
 * years, and a sentence that called every figure a record of the past was
 * not true of it.
 */

/** "rent growth, expense growth, stabilized vacancy and exit cap" — the rows
 *  the read has, so the scope sentence never names a row it lacks. */
export function checkTitles(read: Pick<ModelVsMarket, "checks">): string {
  const titles = read.checks.map((c) => c.title.toLowerCase());
  if (titles.length <= 1) return titles[0] ?? "";
  return `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
}

/**
 * Whether the read set any assumption against a national figure: a check
 * scoped to the nation (the expense row's price indexes, a commercial
 * deal's lessor rents), or the exit cap, whose 10-year is the nation's even
 * where the tracker's cap range makes the row the metro's. A scope sentence
 * names the nation only where one was read.
 */
export function readsNation(read: Pick<ModelVsMarket, "checks">): boolean {
  return read.checks.some((c) => c.scope === "national" || c.key === "exit_cap");
}

/**
 * The scope sentence: the rows, whose published figures they were set
 * against — the market's, or the state's for an address outside the metros
 * the site tracks, and the nation's where one was read — and the day.
 */
export function readScope(read: ModelVsMarket, readOn: string): string {
  const what = checkTitles(read);
  if (!read.metro) return `The model's ${what}, set against the nation's published figures, read on ${readOn}.`;
  const nation = readsNation(read) ? " and the nation" : "";
  return read.grain === "state"
    ? `The model's ${what}, set against the published figures for the state of ${read.metro}${nation}, read on ${readOn} — the address lies outside the metros the site tracks, so the state's figures stand in for a metro's.`
    : `The model's ${what}, set against the published figures for the ${read.metro} market${nation}, read on ${readOn}.`;
}

/** Whose a market figure is, and whose it is not. */
export function readGrainNote(read: Pick<ModelVsMarket, "grain">): string {
  return read.grain === "state"
    ? "a state figure is the state's, not any metro's, the submarket's or the building's."
    : "a metro figure is the metro area's, not the submarket's or the building's.";
}
