import type { RateRow } from "./live-rates";

/**
 * The `rates` table as the runner actually saw it — test tooling, shared by
 * the module's own tests, the render tests and the live-verify marker guard,
 * so the strip is always drawn on the same real figures.
 *
 * Every newest observation here is what the dry run of the rates workflow
 * printed on 2026-09-21 (run 35644763044), beside FRED's own title for the
 * series. The earlier observations behind the 10-year and SOFR are what the
 * Sep 16 cron wrote, read out of that run's log. Nothing here was typed from
 * memory: the sandbox cannot reach FRED, and a fixture that guesses a figure
 * is a test that passes on a page that is wrong.
 */
export const FIXTURE_NOW = new Date("2026-09-21T20:00:00Z");

export const REAL_ROWS: RateRow[] = [
  // The curve, all as of Sep 17.
  { series_id: "DGS1MO", obs_date: "2026-09-17", value: 3.97 },
  { series_id: "DGS3MO", obs_date: "2026-09-17", value: 4.12 },
  { series_id: "DGS6MO", obs_date: "2026-09-17", value: 4.2 },
  { series_id: "DGS1", obs_date: "2026-09-17", value: 4.4 },
  { series_id: "DGS2", obs_date: "2026-09-17", value: 4.67 },
  { series_id: "DGS3", obs_date: "2026-09-17", value: 4.75 },
  { series_id: "DGS5", obs_date: "2026-09-17", value: 4.78 },
  { series_id: "DGS7", obs_date: "2026-09-17", value: 4.86 },
  { series_id: "DGS10", obs_date: "2026-09-17", value: 4.94 },
  { series_id: "DGS10", obs_date: "2026-09-14", value: 4.97 },
  { series_id: "DGS20", obs_date: "2026-09-17", value: 5.32 },
  { series_id: "DGS30", obs_date: "2026-09-17", value: 5.29 },
  { series_id: "T10YIE", obs_date: "2026-09-18", value: 2.33 },
  { series_id: "DFII10", obs_date: "2026-09-17", value: 2.61 },
  // Money market.
  { series_id: "SOFR", obs_date: "2026-09-18", value: 3.85 },
  { series_id: "SOFR", obs_date: "2026-09-15", value: 3.64 },
  { series_id: "SOFR30DAYAVG", obs_date: "2026-09-21", value: 3.67623 },
  { series_id: "DFF", obs_date: "2026-09-17", value: 3.88 },
  { series_id: "DPRIME", obs_date: "2026-09-17", value: 7 },
  // Credit.
  { series_id: "BAMLC0A0CM", obs_date: "2026-09-18", value: 0.77 },
  { series_id: "BAMLC0A4CBBB", obs_date: "2026-09-18", value: 0.94 },
  { series_id: "BAMLH0A0HYM2", obs_date: "2026-09-18", value: 2.68 },
  { series_id: "DBAA", obs_date: "2026-09-18", value: 6.41 },
  // Mortgage and bank lending.
  { series_id: "MORTGAGE30US", obs_date: "2026-09-17", value: 6.95 },
  { series_id: "MORTGAGE15US", obs_date: "2026-09-17", value: 6.26 },
  { series_id: "CREACBW027SBOG_YOY", obs_date: "2026-09-09", value: 3.56389 },
  { series_id: "DRCRELEXFACBS", obs_date: "2026-04-01", value: 1.53 },
  { series_id: "SUBLPDRCSC", obs_date: "2026-07-01", value: -3.7 },
  { series_id: "SUBLPDRCSM", obs_date: "2026-07-01", value: -5.7 },
  { series_id: "SUBLPDRCSN", obs_date: "2026-07-01", value: -11.3 },
  // Inflation and cost.
  { series_id: "CPIAUCSL_YOY", obs_date: "2026-08-01", value: 3.35302 },
  { series_id: "CPILFESL_YOY", obs_date: "2026-08-01", value: 2.44616 },
  { series_id: "CUSR0000SEHA_YOY", obs_date: "2026-08-01", value: 2.75032 },
  { series_id: "CUSR0000SEHC_YOY", obs_date: "2026-08-01", value: 3.07976 },
  { series_id: "PCEPILFE_YOY", obs_date: "2026-07-01", value: 3.34414 },
  { series_id: "WPUSI012011_YOY", obs_date: "2026-08-01", value: 10.08909 },
  { series_id: "WPUIP2311001_YOY", obs_date: "2026-08-01", value: 7.78375 },
  { series_id: "WPUIP2312001_YOY", obs_date: "2026-08-01", value: 8.78211 },
  { series_id: "CES2000000003_YOY", obs_date: "2026-08-01", value: 4.2021 },
  { series_id: "TLNRESCONS_YOY", obs_date: "2026-07-01", value: -1.25112 },
  // Jobs and output.
  { series_id: "UNRATE", obs_date: "2026-08-01", value: 4.1 },
  { series_id: "PAYEMS_YOY", obs_date: "2026-08-01", value: 0.38051 },
  { series_id: "A191RL1Q225SBEA", obs_date: "2026-04-01", value: 1.5 },
  // Supply and vacancy.
  { series_id: "HOUST5F", obs_date: "2026-08-01", value: 344 },
  { series_id: "PERMIT5", obs_date: "2026-08-01", value: 467 },
  { series_id: "COMPU5MUSA", obs_date: "2026-08-01", value: 302 },
  { series_id: "HOUST", obs_date: "2026-08-01", value: 1275 },
  { series_id: "RRVRUSQ156N", obs_date: "2026-04-01", value: 7.3 },
];
