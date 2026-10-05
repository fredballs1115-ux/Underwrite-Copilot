// Which of Analyze Boston's per-year resources is the current assessment
// roll. Pure, so the choice is tested on the names the portal really gives.
//
// The portal's package_show (printed from the GitHub runner, zori run
// 37231906743, 2026-10-04) lists 39 resources. Their `name` is null; the
// name is in `name_translated.en` — "Property Assessment FY" and the year's
// four digits, the same with "Data Key" after it, then the year before,
// newest first. The first reader took `name` alone and read a year as "FY"
// or "20" then two digits, so this year's roll and next year's both read
// 20, and with every name null the newest roll was simply whichever the
// list put first. No fiscal year is typed into this file (the rule
// lib/fiscal-year-literal.test.ts holds every source to); the printed names
// are in its test.

export interface CkanResource {
  id: string;
  name?: string | null;
  name_translated?: { en?: string | null } | null;
  datastore_active?: boolean;
}

/** A resource's name as the portal shows it: `name`, else the English
 *  translation, else "". */
export function resourceName(r: CkanResource): string {
  return (r.name ?? r.name_translated?.en ?? "").trim();
}

/**
 * The fiscal year a resource's name states — "FY" and four digits, or "FY"
 * and two (read in the 2000s) — or null. A data key or a dictionary is
 * documentation, not a roll, and states no year here; a bare "2026" is not
 * read, since only the roll's own label says which fiscal year it is.
 */
export function rollYear(name: string): number | null {
  if (/\bdata\s*key\b|\bdictionary\b/i.test(name)) return null;
  const four = name.match(/\bFY\s?-?(\d{4})\b/i);
  if (four) return Number(four[1]);
  const two = name.match(/\bFY\s?-?(\d{2})\b/i);
  return two ? 2000 + Number(two[1]) : null;
}

/**
 * The current roll: of the resources the portal can serve rows from
 * (`datastore_active`), the one whose name states the highest fiscal year;
 * where none states one, the first of them in the portal's own order. Null
 * where none can serve rows.
 */
export function pickAssessmentRoll(resources: CkanResource[]): { id: string; name: string; year: number | null } | null {
  const served = resources.filter((r) => r.datastore_active);
  if (!served.length) return null;
  let best: CkanResource | null = null;
  let bestYear = -1;
  for (const r of served) {
    const y = rollYear(resourceName(r));
    if (y != null && y > bestYear) {
      best = r;
      bestYear = y;
    }
  }
  const pick = best ?? served[0];
  return { id: pick.id, name: resourceName(pick) || pick.id, year: best ? bestYear : null };
}
