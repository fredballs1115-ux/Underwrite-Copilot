/**
 * The notices the data providers' own terms ask a product to print, each in
 * the provider's own words as the GitHub runner printed its terms page (the
 * sandbox cannot reach them): one place, so every surface prints the same
 * sentence and lib/data-notices.test.ts holds each to the printed words.
 *
 * PURE, AND IMPORTS NOTHING: the signed-in shell's footer is a client
 * component, and it draws these without loading anything else.
 *
 * Never write a notice here from memory, and never one for a provider whose
 * terms the runner has not printed.
 */

/**
 * The FRED® API Terms of Use (fred.stlouisfed.org/docs/api/terms_of_use.html,
 * printed by zori probe run 37262488972): "Place the following notice
 * prominently on your application". The same terms say an application may
 * not "State or imply that your application, web site or product is
 * endorsed, recommended or favored by the Federal Reserve Bank of St.
 * Louis" — so a page credits FRED as the channel a figure came through,
 * never as a party that stands behind the site.
 */
export const FRED_NOTICE =
  "This product uses the FRED® API but is not endorsed or certified by the Federal Reserve Bank of St. Louis.";

/**
 * The BLS API's terms (bls.gov/developers/termsOfService.htm, printed by the
 * same run): "Users must clearly state that “BLS.gov cannot vouch for the
 * data or analyses derived from these data after the data have been
 * retrieved from BLS.gov.”" The same terms ask users of the API to "cite
 * the date that data were accessed or retrieved using the API".
 *
 * The site reads the BLS API directly only for the series filed with
 * `source: "bls"` in data/fred-series.json (three metros' rent CPI); every
 * other BLS figure on the site reaches it through FRED.
 */
export const BLS_NOTICE =
  "BLS.gov cannot vouch for the data or analyses derived from these data after the data have been retrieved from BLS.gov.";

/**
 * The New York Fed's Terms of Use (newyorkfed.org/privacy/termsofuse,
 * printed by zori probe runs 37262564561 and 37262665824): "If you use or
 * distribute reference rate data or related information posted to the
 * website, you must include the following notice and disclaimer with your
 * presentation of that data or information:" — the template exactly as
 * printed, its blanks in brackets.
 */
export const NY_FED_NOTICE_TEMPLATE =
  "The [NAME OF DATA or CONTENT]* is subject to the Terms of Use posted at newyorkfed.org. The New York Fed is not responsible for publication of the [DATA NAME] by [NAME OF PUBLISHER], does not [sanction] or [endorse] any particular republication, and has no liability for your use.";

/** The publisher the template names: the product, as its own pages and
 *  metadata name it (app/layout.tsx's `applicationName`). */
export const NY_FED_PUBLISHER = "Underwrite Copilot";

/**
 * The template filled: the data's name in both of its blanks, the publisher
 * in its own, and the template's brackets and footnote mark taken off the
 * words they enclose. Nothing else in the printed words changes.
 */
export function nyFedNotice(dataName: string, publisher: string): string {
  return NY_FED_NOTICE_TEMPLATE.replace("[NAME OF DATA or CONTENT]*", dataName)
    .replace("[DATA NAME]", dataName)
    .replace("[NAME OF PUBLISHER]", publisher)
    .replace("[sanction]", "sanction")
    .replace("[endorse]", "endorse");
}

/** The notice for SOFR, the reference rate the site shows with its 30-day
 *  average (`NY_FED_SERIES`). */
export const NY_FED_SOFR_NOTICE = nyFedNotice("SOFR data", NY_FED_PUBLISHER);

/**
 * The same terms, as printed: "The Secured Overnight Financing Rate (SOFR)
 * Data and Broad General Collateral Rate (BGCR) Data are calculated using
 * data provided under a license granted to the New York Fed by DTCC
 * Solutions LLC". Drawn with the notice wherever SOFR is.
 */
export const DTCC_SOFR_SENTENCE =
  "The Secured Overnight Financing Rate (SOFR) Data and Broad General Collateral Rate (BGCR) Data are calculated using data provided under a license granted to the New York Fed by DTCC Solutions LLC (“Solutions”), an affiliate of The Depository Trust & Clearing Corporation. Solutions, its affiliates, and third parties from which they obtained data have no liability for the content of this material.";

/** The New York Fed's notice and the DTCC sentence, as one paragraph's words. */
export const NY_FED_SOFR_NOTICES = `${NY_FED_SOFR_NOTICE} ${DTCC_SOFR_SENTENCE}`;

/** The series the New York Fed's notice covers, by their id in
 *  data/fred-series.json: SOFR and its 30-day average, both the New York
 *  Fed's reference-rate data, which the site reads through FRED. */
export const NY_FED_SERIES: readonly string[] = ["SOFR", "SOFR30DAYAVG"];

/** Whether a figure from this series is presented with the New York Fed's
 *  notice. */
export function carriesNyFedNotice(seriesId: string | null | undefined): boolean {
  return typeof seriesId === "string" && NY_FED_SERIES.includes(seriesId);
}
